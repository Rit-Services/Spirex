// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchProjectsThunk } from '@/store/projectSlice';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/EmptyState';
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog';
import { useAuth } from '@/hooks/useAuth';
import { Search, Users, Zap } from 'lucide-react';

const PROJECT_COLORS = [
  'from-blue-500/20 to-indigo-500/10',
  'from-emerald-500/20 to-teal-500/10',
  'from-violet-500/20 to-purple-500/10',
  'from-rose-500/20 to-pink-500/10',
  'from-amber-500/20 to-orange-500/10',
  'from-cyan-500/20 to-sky-500/10',
];

function projectColor(key: string) {
  const code = key.charCodeAt(0) + (key.charCodeAt(1) ?? 0);
  return PROJECT_COLORS[code % PROJECT_COLORS.length];
}

export function Projects() {
  const dispatch = useAppDispatch();
  const { list, loading, error } = useAppSelector((s) => s.projects);
  const { can } = useAuth();
  const canCreate = can('project:create');
  const [query, setQuery] = useState('');

  useEffect(() => {
    void dispatch(fetchProjectsThunk());
  }, [dispatch]);

  // Always alphabetical by name (the API returns createdAt order, which buried
  // newly-imported projects at the bottom), then filtered by the quick search.
  const visible = useMemo(() => {
    const sorted = [...list].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
    const needle = query.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter(
      (p) => p.name.toLowerCase().includes(needle) || p.key.toLowerCase().includes(needle),
    );
  }, [list, query]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Projects you're a member of.</p>
        </div>
        {canCreate ? <CreateProjectDialog /> : null}
      </div>

      {error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      {loading && list.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description={
            canCreate
              ? 'Create your first project to start tracking work.'
              : 'You have not been added to any projects yet. Ask a project lead to invite you.'
          }
          action={canCreate ? <CreateProjectDialog /> : undefined}
        />
      ) : (
        <div className="space-y-4">
          {/* Quick client-side search over the projects already loaded. */}
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="pl-8"
              aria-label="Search projects"
            />
          </div>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
              No projects match “{query}”.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((p, i) => (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="group block h-full animate-slide-up motion-reduce:animate-none"
                  // Stagger each card's entrance so the grid cascades in instead of
                  // snapping in all at once. Capped so a large grid never feels slow.
                  style={{ animationDelay: `${Math.min(i, 12) * 55}ms` }}
                >
                  <Card className="flex h-full flex-col overflow-hidden transition-all duration-200 hover:shadow-elevated hover:-translate-y-0.5">
                    {/* Gradient accent strip */}
                    <div className={`h-1.5 w-full bg-gradient-to-r ${projectColor(p.key)}`} />
                    <CardHeader className="pb-2 pt-4">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-bold text-primary">
                          {p.key}
                        </span>
                        <CardTitle className="truncate text-base">{p.name}</CardTitle>
                      </div>
                      {p.description ? (
                        <CardDescription className="mt-1 line-clamp-2">{p.description}</CardDescription>
                      ) : null}
                    </CardHeader>
                    <CardContent className="mt-auto flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {p.members?.length ?? 0} member{(p.members?.length ?? 0) !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="h-3.5 w-3.5" />
                        {p.defaultSprintLengthWeeks}-week sprints
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
