// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import { worklogApi } from '@/apis/worklogApi';
import { extractError } from '@/config/httpClient';
import { parseTimeToMinutes, TimeParseError, formatMinutes } from '@/utils/timeParser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { LogWorkDialog } from './LogWorkDialog';
import { Trash2, Clock, Pencil, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { Story, Worklog } from '@/types/scrum';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  story: Story;
  onEstimateChange: (minutes: number | null) => void;
}

export function TimeTrackingPanel({ story, onEstimateChange }: Props) {
  const { user, activeOrg } = useAuth();
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [logOpen, setLogOpen] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState(false);
  const [estimateDraft, setEstimateDraft] = useState('');

  const resetEstimateDraft = () => {
    setEstimateDraft(
      formatMinutes(story.originalEstimateMinutes) === '—'
        ? ''
        : formatMinutes(story.originalEstimateMinutes),
    );
  };

  useEffect(() => {
    resetEstimateDraft();
    setEditingEstimate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.originalEstimateMinutes]);

  const refresh = async () => {
    try {
      const r = await worklogApi.listByStory(story.id);
      setWorklogs(r.worklogs);
      setTotalMinutes(r.totalMinutes);
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id]);

  const saveEstimate = async () => {
    try {
      const minutes = parseTimeToMinutes(estimateDraft);
      onEstimateChange(minutes);
      setEditingEstimate(false);
    } catch (err) {
      toast.error(err instanceof TimeParseError ? err.message : 'Invalid duration');
    }
  };

  const cancelEstimateEdit = () => {
    resetEstimateDraft();
    setEditingEstimate(false);
  };

  const onDeleteWorklog = async (w: Worklog) => {
    try {
      await worklogApi.remove(w.id);
      toast.success('Worklog deleted');
      await refresh();
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  // Group worklogs by author so the panel reads as "who logged what", with a
  // per-person subtotal. Heaviest contributor first; entries keep their order.
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { userId: string; user: Worklog['user']; total: number; items: Worklog[] }
    >();
    for (const w of worklogs) {
      let g = map.get(w.userId);
      if (!g) {
        g = { userId: w.userId, user: w.user, total: 0, items: [] };
        map.set(w.userId, g);
      }
      g.total += w.timeSpentMinutes;
      g.items.push(w);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [worklogs]);

  const canDelete = (w: Worklog) => user?.id === w.userId || activeOrg?.role === 'admin';

  // Collapsed author groups (by userId). Default = all expanded.
  const [collapsedUsers, setCollapsedUsers] = useState<Set<string>>(new Set());
  const toggleGroup = (userId: string) =>
    setCollapsedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const estimate = story.originalEstimateMinutes ?? 0;
  const remaining = Math.max(0, estimate - totalMinutes);
  const pct = estimate > 0 ? Math.min(999, Math.round((totalMinutes / estimate) * 100)) : 0;
  const overrun = estimate > 0 && totalMinutes > estimate;

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Clock className="h-4 w-4" />
        Time tracking
      </h3>

      <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/40 p-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Estimate</div>
          <div className="font-mono">{formatMinutes(story.originalEstimateMinutes)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Logged</div>
          <div className="font-mono">{formatMinutes(totalMinutes)}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Remaining</div>
          <div className="font-mono">{formatMinutes(remaining)}</div>
        </div>
      </div>

      {estimate > 0 ? (
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Progress</span>
            <span>{pct}%{overrun ? ' · over estimate' : ''}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                overrun ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
      ) : null}

      {editingEstimate ? (
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label htmlFor="story-estimate" className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Edit estimate
            </label>
            <Input
              id="story-estimate"
              autoFocus
              value={estimateDraft}
              onChange={(e) => setEstimateDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void saveEstimate();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEstimateEdit();
                }
              }}
              placeholder="e.g. 2h 30m, 1d, 45m"
              aria-label="Original estimate"
            />
          </div>
          <Button variant="ghost" type="button" onClick={cancelEstimateEdit}>
            Cancel
          </Button>
          <Button variant="outline" type="button" onClick={saveEstimate}>
            Save
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => setEditingEstimate(true)}
            aria-label="Edit estimate"
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Edit estimate
          </Button>
          <Button type="button" className="ml-auto" onClick={() => setLogOpen(true)}>
            Log work
          </Button>
        </div>
      )}

      <div className="mt-4">
        {worklogs.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">No time logged yet.</p>
        ) : (
          // Grouped by author. bg-muted/30 (not bg-card): the panel behind is
          // already card-colored, so card-on-card reads as transparent.
          <div className="max-h-[24rem] space-y-3 overflow-y-auto">
            {groups.map((g) => {
              const collapsed = collapsedUsers.has(g.userId);
              return (
              <div
                key={g.userId}
                className="overflow-hidden rounded-md border bg-muted/30"
              >
                {/* Per-user header — click to collapse/expand this author's
                    entries. Keeps the subtotal + count visible when collapsed. */}
                <button
                  type="button"
                  onClick={() => toggleGroup(g.userId)}
                  aria-expanded={!collapsed}
                  className="flex w-full items-center gap-2 border-b border-border/60 bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted/70"
                >
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
                      collapsed && '-rotate-90',
                    )}
                    aria-hidden
                  />
                  <Avatar name={g.user?.name ?? null} />
                  <span className="text-sm font-medium">{g.user?.name ?? 'Unknown'}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {formatMinutes(g.total)} · {g.items.length}{' '}
                    {g.items.length === 1 ? 'entry' : 'entries'}
                  </span>
                </button>
                {collapsed ? null : (
                <ul className="divide-y divide-border/60">
                  {g.items.map((w) => (
                    <li
                      key={w.id}
                      className="flex items-start gap-3 p-3 text-sm transition-colors hover:bg-muted/40"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {formatMinutes(w.timeSpentMinutes)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            · {new Date(w.startedAt).toLocaleDateString()}
                          </span>
                        </div>
                        {w.description ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">{w.description}</p>
                        ) : null}
                      </div>
                      {canDelete(w) ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onDeleteWorklog(w)}
                          aria-label={`Delete worklog by ${w.user?.name ?? 'user'}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      <LogWorkDialog
        storyId={story.id}
        open={logOpen}
        onOpenChange={setLogOpen}
        onLogged={refresh}
      />
    </section>
  );
}
