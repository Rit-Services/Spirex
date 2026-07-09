// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown, FolderKanban, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchProjectsThunk, setCurrentProject } from '@/store/projectSlice';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Project } from '@/types/project';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">
      {children}
    </div>
  );
}

interface ProjectSwitcherProps {
  /** Custom trigger (e.g. the sidebar's project card). Falls back to the
   *  compact top-nav button when omitted. */
  trigger?: ReactNode;
  /** Popover alignment relative to the trigger. */
  align?: 'start' | 'center' | 'end';
}

export function ProjectSwitcher({ trigger, align = 'start' }: ProjectSwitcherProps = {}) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { list, currentId, recentIds, loading } = useAppSelector((s) => s.projects);
  const current = list.find((p) => p.id === currentId) ?? null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch once on mount. Intentionally excludes list.length from deps —
  // including it creates an infinite loop when the server returns [].
  useEffect(() => {
    if (!loading) void dispatch(fetchProjectsThunk());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // Reset the query each time the popover closes so it reopens clean.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Split into recent (most-recent-first) and the rest. Recents come from the
  // persisted slice list, mapped back to live projects and capped.
  const { recents, rest } = useMemo(() => {
    const byId = new Map(list.map((p) => [p.id, p] as const));
    const recent = recentIds
      .map((id) => byId.get(id))
      .filter((p): p is Project => Boolean(p))
      .slice(0, 5);
    const recentSet = new Set(recent.map((p) => p.id));
    return { recents: recent, rest: list.filter((p) => !recentSet.has(p.id)) };
  }, [list, recentIds]);

  const q = query.trim().toLowerCase();
  const match = (p: Project) =>
    !q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q);
  const matchedRecents = recents.filter(match);
  const matchedRest = rest.filter(match);
  const noResults = matchedRecents.length === 0 && matchedRest.length === 0;

  // Normal click selects + closes; modified clicks fall through to the browser
  // so ctrl/cmd-click and right-click can open the project in a new tab.
  const pick = (id: string) => (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    dispatch(setCurrentProject(id));
    setOpen(false);
  };

  // Enter selects the first match — quick keyboard switching.
  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const first = matchedRecents[0] ?? matchedRest[0];
    if (!first) return;
    e.preventDefault();
    dispatch(setCurrentProject(first.id));
    navigate(`/projects/${first.id}`);
    setOpen(false);
  };

  const row = (p: Project) => {
    const isActive = p.id === currentId;
    return (
      <Link
        key={p.id}
        to={`/projects/${p.id}`}
        onClick={pick(p.id)}
        className={cn(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none transition-colors',
          'hover:bg-primary/[0.08] focus-visible:bg-primary/[0.08]',
          isActive && 'bg-primary/[0.08] text-foreground',
        )}
      >
        <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-primary">
          {p.key}
        </span>
        <span className="flex-1 truncate">{p.name}</span>
        {isActive && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
      </Link>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          /*
           * Reserve a minimum trigger width so the project chip never collapses
           * to zero, and cap the maximum width so a long project name can't
           * push the search bar into the action cluster on narrow viewports.
           * Below the `lg` breakpoint the name is hidden and we render a
           * compact key-only chip — see RJ-9.
           */
          <Button
            variant="ghost"
            size="sm"
            aria-label="Project switcher"
            className="min-w-0 max-w-[260px] gap-2 text-sm font-medium lg:max-w-[320px]"
          >
            <FolderKanban className="h-4 w-4 shrink-0 text-primary" />
            {current ? (
              <span className="flex min-w-0 items-center">
                <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">
                  {current.key}
                </span>
                <span className="ml-1.5 hidden min-w-0 truncate lg:inline-block" title={current.name}>
                  {current.name}
                </span>
              </span>
            ) : (
              <span className="truncate text-muted-foreground">No project selected</span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        className="w-72 p-0"
        // Keep focus in the search field on open instead of the first item.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search projects…"
            aria-label="Search projects"
            // The search field sits inside its own bordered row, so the global
            // :focus-visible glow ring (globals.css) just looks like noise here
            // — suppress the box-shadow while keeping the field keyboard-focused.
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground focus:shadow-none focus-visible:shadow-none"
          />
        </div>

        {/* List */}
        <div className="max-h-72 overflow-y-auto p-1.5">
          {list.length === 0 ? (
            <div className="px-2.5 py-6 text-center text-sm text-muted-foreground">
              No projects yet
            </div>
          ) : noResults ? (
            <div className="px-2.5 py-6 text-center text-sm text-muted-foreground">
              No projects found
            </div>
          ) : (
            <>
              {matchedRecents.length > 0 && (
                <>
                  {!q && <SectionLabel>Recent</SectionLabel>}
                  {matchedRecents.map(row)}
                </>
              )}
              {matchedRest.length > 0 && (
                <>
                  {!q && matchedRecents.length > 0 && <SectionLabel>All projects</SectionLabel>}
                  {matchedRest.map(row)}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-1.5">
          <Link
            to="/projects"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none transition-colors hover:bg-primary/[0.08] focus-visible:bg-primary/[0.08]"
          >
            <FolderKanban className="h-4 w-4 !text-violet-600" />
            All projects
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
