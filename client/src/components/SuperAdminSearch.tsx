// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, Building2, User } from 'lucide-react';
import { superadminApi } from '@/apis/superadminApi';
import { API_BASE } from '@/config/urls';
import type { MemberSearchHit, OrgSearchHit } from '@/types/organization';
import { cn } from '@/lib/utils';

interface SuperAdminSearchProps {
  open: boolean;
  onClose: () => void;
}

// A flattened hit — orgs and members are rendered in separate sections but share
// one keyboard cursor, so we tag each row with its kind to drive navigation.
type Flat =
  | { kind: 'org'; hit: OrgSearchHit }
  | { kind: 'member'; hit: MemberSearchHit };

// Both kinds navigate to an org detail page — an org by its own id, a member by
// the id of the org they belong to (that's where you manage them).
function flatUrl(f: Flat): string {
  return f.kind === 'org'
    ? `/superadmin/orgs/${f.hit.id}`
    : `/superadmin/orgs/${f.hit.organization.id}`;
}

function OrgRow({ hit, active, onClick }: { hit: OrgSearchHit; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
        active ? 'bg-accent' : 'hover:bg-accent/50',
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {hit.logoUrl ? (
          <img src={`${API_BASE}${hit.logoUrl}`} alt="" className="h-full w-full object-contain" />
        ) : (
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{hit.name}</span>
          {hit.status === 'suspended' ? (
            <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
              suspended
            </span>
          ) : null}
        </span>
        <span className="block truncate font-mono text-xs text-muted-foreground">{hit.slug}</span>
      </span>
      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
        {hit.seatsUsed}/{hit.maxUsers} seats
      </span>
    </button>
  );
}

function MemberRow({ hit, active, onClick }: { hit: MemberSearchHit; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
        active ? 'bg-accent' : 'hover:bg-accent/50',
      )}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-muted">
        <User className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{hit.name}</span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {hit.orgRole}
          </span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">{hit.email}</span>
      </span>
      <span className="ml-auto shrink-0 truncate text-[11px] text-muted-foreground">
        {hit.organization.name}
      </span>
    </button>
  );
}

export function SuperAdminSearch({ open, onClose }: SuperAdminSearchProps) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [orgs, setOrgs] = useState<OrgSearchHit[]>([]);
  const [members, setMembers] = useState<MemberSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a slow earlier request overwriting a newer one's results.
  const reqSeq = useRef(0);

  // Reset + focus each time the palette opens.
  useEffect(() => {
    if (open) {
      setQ('');
      setOrgs([]);
      setMembers([]);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const doSearch = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setOrgs([]);
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++reqSeq.current;
      try {
        const res = await superadminApi.search(value.trim());
        if (seq !== reqSeq.current) return; // a newer query already fired
        setOrgs(res.organizations);
        setMembers(res.members);
      } catch {
        if (seq === reqSeq.current) {
          setOrgs([]);
          setMembers([]);
        }
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    }, 250);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQ(e.target.value);
    setActiveIdx(0);
    doSearch(e.target.value);
  };

  // Org hits first, then members — one combined list for arrow-key navigation.
  const flat: Flat[] = [
    ...orgs.map((hit) => ({ kind: 'org' as const, hit })),
    ...members.map((hit) => ({ kind: 'member' as const, hit })),
  ];

  const select = (f: Flat) => {
    navigate(flatUrl(f));
    onClose();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, flat.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (flat[activeIdx]) select(flat[activeIdx]);
    }
  };

  if (!open) return null;

  let cursor = 0;
  const hasResults = flat.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 w-full max-w-xl overflow-hidden rounded-2xl border bg-card shadow-float duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Superadmin search"
        aria-modal="true"
      >
        {/* Input */}
        <div className="flex items-center gap-3 border-b px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={handleChange}
            onKeyDown={handleKey}
            placeholder="Search organizations and members…"
            aria-label="Search query"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading ? (
            <span className="text-xs text-muted-foreground">Searching…</span>
          ) : q ? (
            <button
              type="button"
              onClick={() => { setQ(''); setOrgs([]); setMembers([]); }}
              aria-label="Clear search"
              className="rounded-md p-0.5 hover:bg-muted"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : null}
        </div>

        {/* Results */}
        {hasResults ? (
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {orgs.length > 0 ? (
              <div>
                <SectionHeader label="Organizations" count={orgs.length} />
                {orgs.map((hit) => {
                  const idx = cursor++;
                  return (
                    <OrgRow
                      key={`org-${hit.id}`}
                      hit={hit}
                      active={idx === activeIdx}
                      onClick={() => select({ kind: 'org', hit })}
                    />
                  );
                })}
              </div>
            ) : null}
            {members.length > 0 ? (
              <div>
                <SectionHeader label="Members" count={members.length} />
                {members.map((hit) => {
                  const idx = cursor++;
                  return (
                    <MemberRow
                      key={`member-${hit.id}`}
                      hit={hit}
                      active={idx === activeIdx}
                      onClick={() => select({ kind: 'member', hit })}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : q.trim().length >= 2 && !loading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            <p>No organizations or members match <strong className="text-foreground">"{q}"</strong></p>
          </div>
        ) : q.trim().length > 0 && q.trim().length < 2 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            <p>Type at least 2 characters to search</p>
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            <p>Search across every organization and its members</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> navigate
            <kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">↵</kbd> open
            <kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
        {count}
      </span>
    </div>
  );
}
