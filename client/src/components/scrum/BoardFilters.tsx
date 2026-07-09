// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter as FilterIcon, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAppSelector } from '@/store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isTextEditableTarget } from '@/utils/keyboard';
import { useCustomFields } from '@/hooks/useCustomFields';
import {
  CF_PARAM_PREFIX,
  clearCustomFieldFilters,
  countCustomFieldFilters,
} from '@/utils/customFieldFilters';
import { cn } from '@/lib/utils';

const FILTER_KEYS = ['epic', 'label', 'priority', 'type', 'assignee'] as const;

interface BoardFiltersProps {
  projectId: string;
  /** When provided, the filter dropdowns are hidden behind a Filter toggle
   *  the parent owns. When omitted, all filters render inline (legacy mode
   *  for any caller that hasn't adopted the toggle UX yet). */
  filtersOpen?: boolean;
  onToggleFilters?: () => void;
}

export function BoardFilters({ projectId, filtersOpen, onToggleFilters }: BoardFiltersProps) {
  const [params, setParams] = useSearchParams();
  const epics = useAppSelector((s) => s.epics.byProject[projectId] ?? []);
  const labels = useAppSelector((s) => s.labels.byProject[projectId] ?? []);
  const members = useAppSelector((s) => s.projects.currentMembers);
  const memberOptions = members.map((m) => ({ id: m.userId, name: m.user.name }));
  const assigneeFilter = params.get('assignee') ?? '';
  const { fields: customFields } = useCustomFields(projectId);
  // Only enumerable types make sense as exact-match dropdowns; text/number/
  // date fields are findable through global search instead.
  const filterableFields = customFields.filter(
    (f) => f.type === 'select' || f.type === 'checkbox',
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const set = (key: string, value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    setParams(p, { replace: true });
  };

  const clearAll = () => {
    const p = new URLSearchParams(params);
    for (const k of FILTER_KEYS) p.delete(k);
    clearCustomFieldFilters(p);
    p.delete('q');
    setParams(p, { replace: true });
  };

  // `/` focuses the board search box — same UX as Backlog. Self-contained so
  // it activates only on pages that actually mount BoardFilters.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== '/') return;
      if (isTextEditableTarget(e.target)) return;
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeFilterCount =
    FILTER_KEYS.filter((k) => params.get(k)).length + countCustomFieldFilters(params);
  const search = params.get('q') ?? '';
  // When the parent doesn't manage open-state, render in legacy "always
  // open" mode so existing call sites don't suddenly hide their filters.
  const isControlled = filtersOpen !== undefined;
  const showFilters = isControlled ? filtersOpen : true;

  return (
    <div className="border-b bg-card">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            aria-label="Search board"
            placeholder="Search title or key  ( / )"
            value={search}
            onChange={(e) => set('q', e.target.value)}
            className="pl-8"
          />
        </div>
        {/* Quick assignee filter — click an avatar to toggle "their issues",
            same UX as the Backlog header (also driven by Shift+A). */}
        {memberOptions.length > 0 ? (
          <div className="flex items-center -space-x-1.5">
            {memberOptions.slice(0, 5).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => set('assignee', assigneeFilter === m.id ? '' : m.id)}
                className={cn(
                  'inline-block rounded-full ring-2 ring-background transition-transform',
                  assigneeFilter === m.id
                    ? 'scale-110 ring-primary'
                    : 'opacity-70 hover:scale-105 hover:opacity-100',
                )}
                title={`Filter by ${m.name}`}
                aria-label={`Filter by ${m.name}`}
              >
                <Avatar name={m.name} />
              </button>
            ))}
            {memberOptions.length > 5 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'ml-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold ring-2 ring-background transition-colors hover:bg-muted/80',
                      memberOptions.slice(5).some((m) => m.id === assigneeFilter) &&
                        'bg-primary text-primary-foreground ring-primary',
                    )}
                    aria-label={`Show ${memberOptions.length - 5} more members`}
                    title={`${memberOptions.length - 5} more`}
                  >
                    +{memberOptions.length - 5}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
                  <DropdownMenuLabel>More members</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {memberOptions.slice(5).map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onSelect={() => set('assignee', assigneeFilter === m.id ? '' : m.id)}
                      className={cn(
                        'flex items-center gap-2',
                        assigneeFilter === m.id && 'bg-primary/10 text-primary',
                      )}
                    >
                      <Avatar name={m.name} />
                      <span className="truncate">{m.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        ) : null}
        {isControlled ? (
          <Button
            variant={filtersOpen || activeFilterCount > 0 ? 'default' : 'outline'}
            size="sm"
            onClick={onToggleFilters}
            className="h-9 gap-1.5 text-xs"
            title="Toggle filters (f)"
          >
            <FilterIcon className="h-3.5 w-3.5" />
            Filter
            {activeFilterCount > 0 ? (
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-foreground/20 px-1 font-mono text-[10px]">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        ) : null}
        {(activeFilterCount > 0 || search) && isControlled ? (
          <Button variant="ghost" size="sm" onClick={clearAll} className="h-9 gap-1 text-xs">
            <X className="h-3 w-3" />
            Clear all
          </Button>
        ) : null}
      </div>

      {showFilters ? (
        <div
          className={cn(
            'flex flex-wrap items-end gap-3 p-3',
            isControlled && 'border-t bg-muted/30',
          )}
        >
          <FilterSelect
            label="Epic"
            value={params.get('epic') ?? ''}
            onChange={(v) => set('epic', v)}
            options={[
              { value: '', label: 'All epics' },
              { value: 'null', label: 'No epic' },
              ...epics.map((e) => ({ value: e.id, label: `${e.key} · ${e.title}` })),
            ]}
          />
          <FilterSelect
            label="Label"
            value={params.get('label') ?? ''}
            onChange={(v) => set('label', v)}
            options={[
              { value: '', label: 'All labels' },
              ...labels.map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
          <FilterSelect
            label="Priority"
            value={params.get('priority') ?? ''}
            onChange={(v) => set('priority', v)}
            options={[
              { value: '', label: 'Any priority' },
              { value: 'critical', label: 'Critical' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
          />
          <FilterSelect
            label="Type"
            value={params.get('type') ?? ''}
            onChange={(v) => set('type', v)}
            options={[
              { value: '', label: 'Any type' },
              { value: 'story', label: 'Story' },
              { value: 'bug', label: 'Bug' },
              { value: 'task', label: 'Task' },
            ]}
          />
          {filterableFields.map((f) => (
            <FilterSelect
              key={f.id}
              label={f.name}
              value={params.get(`${CF_PARAM_PREFIX}${f.id}`) ?? ''}
              onChange={(v) => set(`${CF_PARAM_PREFIX}${f.id}`, v)}
              options={
                f.type === 'checkbox'
                  ? [
                      { value: '', label: 'Any' },
                      { value: 'true', label: 'Yes' },
                      { value: 'false', label: 'No' },
                    ]
                  : [
                      { value: '', label: 'Any' },
                      ...f.options.map((o) => ({ value: o, label: o })),
                    ]
              }
            />
          ))}
          {!isControlled && (activeFilterCount > 0 || search) ? (
            <Button variant="ghost" size="sm" onClick={clearAll} className="h-9 gap-1 text-xs">
              <X className="h-3 w-3" />
              Clear all
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const FILTER_ALL = '__all__';

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select
        value={value === '' ? FILTER_ALL : value}
        onValueChange={(v) => onChange(v === FILTER_ALL ? '' : v)}
      >
        <SelectTrigger className="h-9 min-w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value || FILTER_ALL} value={o.value || FILTER_ALL}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
