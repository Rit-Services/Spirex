// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, FileText, Layers, FolderKanban, MessageSquare, ArrowRight } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/store';
import { searchThunk, clearResults } from '@/store/searchSlice';
import type { SearchHit, SearchType } from '@/types/search';
import { cn } from '@/lib/utils';

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

const TYPE_ICON: Record<SearchType, React.ReactNode> = {
  story:   <FileText className="h-3.5 w-3.5 shrink-0" />,
  epic:    <Layers className="h-3.5 w-3.5 shrink-0" />,
  project: <FolderKanban className="h-3.5 w-3.5 shrink-0" />,
  comment: <MessageSquare className="h-3.5 w-3.5 shrink-0" />,
};

const TYPE_LABEL: Record<SearchType, string> = {
  story: 'Stories', epic: 'Epics', project: 'Projects', comment: 'Comments',
};

function hitUrl(hit: SearchHit): string {
  switch (hit.type) {
    case 'story':   return `/projects/${hit.projectId}/backlog?story=${hit.key}`;
    case 'epic':    return `/projects/${hit.projectId}/epics/${hit.id}`;
    case 'project': return `/projects/${hit.projectId}`;
    case 'comment': return `/projects/${hit.projectId}/backlog?story=${hit.storyKey}`;
  }
}

function SnippetHtml({ html }: { html: string }) {
  return (
    <span
      className="mt-0.5 text-xs text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function HitRow({ hit, active, onClick }: { hit: SearchHit; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors',
        active ? 'bg-accent' : 'hover:bg-accent/50',
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('shrink-0', active ? 'text-primary' : 'text-muted-foreground')}>
          {TYPE_ICON[hit.type]}
        </span>
        {hit.key ? (
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {hit.key}
          </span>
        ) : null}
        <span className="truncate text-sm font-medium">{hit.title}</span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{hit.projectKey}</span>
      </div>
      {hit.snippet ? <SnippetHtml html={hit.snippet} /> : null}
    </button>
  );
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { results, loading } = useAppSelector((s) => s.search);
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActiveIdx(0);
      dispatch(clearResults());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, dispatch]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const doSearch = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (value.trim().length < 2) { dispatch(clearResults()); return; }
      debounceRef.current = setTimeout(() => {
        void dispatch(searchThunk({ q: value.trim() }));
      }, 250);
    },
    [dispatch],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQ(e.target.value);
    setActiveIdx(0);
    doSearch(e.target.value);
  };

  const allHits: SearchHit[] = results
    ? [...results.stories, ...results.epics, ...results.projects, ...results.comments]
    : [];

  const goToFull = () => {
    const trimmed = q.trim();
    const path = trimmed.length >= 2 ? `/search?q=${encodeURIComponent(trimmed)}` : '/search';
    navigate(path);
    onClose();
  };

  const selectHit = (hit: SearchHit) => {
    navigate(hitUrl(hit));
    onClose();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, allHits.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (allHits[activeIdx]) selectHit(allHits[activeIdx]);
      else goToFull();
    }
  };

  if (!open) return null;

  const sections: { type: SearchType; hits: SearchHit[] }[] = (
    ['story', 'epic', 'project', 'comment'] as SearchType[]
  )
    .map((t) => ({ type: t, hits: allHits.filter((h) => h.type === t) }))
    .filter((s) => s.hits.length > 0);

  let cursor = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 w-full max-w-xl overflow-hidden rounded-2xl border bg-card shadow-float duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Global search"
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
            placeholder="Search stories, epics, projects…"
            aria-label="Search query"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading ? (
            <span className="text-xs text-muted-foreground">Searching…</span>
          ) : q ? (
            <button
              type="button"
              onClick={() => { setQ(''); dispatch(clearResults()); }}
              aria-label="Clear search"
              className="rounded-md p-0.5 hover:bg-muted"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : null}
        </div>

        {/* Results */}
        {sections.length > 0 ? (
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {sections.map(({ type, hits }) => (
              <div key={type}>
                <div className="flex items-center gap-2 px-4 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {TYPE_LABEL[type]}
                  </span>
                  <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold text-muted-foreground">
                    {hits.length}
                  </span>
                </div>
                {hits.map((hit) => {
                  const idx = cursor++;
                  return (
                    <HitRow
                      key={`${hit.type}-${hit.id}`}
                      hit={hit}
                      active={idx === activeIdx}
                      onClick={() => selectHit(hit)}
                    />
                  );
                })}
              </div>
            ))}
            {q.trim().length >= 2 ? (
              <button
                type="button"
                onClick={goToFull}
                className="flex w-full items-center gap-2 border-t px-4 py-3 text-sm text-primary hover:bg-accent/50"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                View all results for{' '}
                <strong className="font-semibold">"{q}"</strong>
              </button>
            ) : null}
          </div>
        ) : q.trim().length >= 2 && !loading ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            <p>No results for <strong className="text-foreground">"{q}"</strong></p>
            <button
              type="button"
              onClick={goToFull}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
            >
              Try advanced search <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : q.trim().length < 2 && q.length > 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            <p>Type at least 2 characters to search</p>
            <button
              type="button"
              onClick={goToFull}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
            >
              Or browse with filters <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            <p>Start typing to search across stories, epics, projects, and comments</p>
            <button
              type="button"
              onClick={goToFull}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
            >
              Or open advanced search <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">↑↓</kbd> navigate
            <kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">↵</kbd> select
            <kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">Esc</kbd> close
          </span>
          <button type="button" onClick={goToFull} className="hover:text-primary">
            Advanced search →
          </button>
        </div>
      </div>
    </div>
  );
}
