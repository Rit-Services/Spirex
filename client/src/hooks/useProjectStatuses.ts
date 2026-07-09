// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchWorkflowThunk } from '@/store/workflowSlice';
import { STORY_STATUS_LABEL, type StoryStatus, type WorkflowStatus } from '@/types/scrum';

export interface StatusDisplay {
  coreStatus: StoryStatus;
  label: string;
  color: string;
  order: number;
  category: 'todo' | 'in_progress' | 'done';
}

/**
 * Resolve a project's custom workflow labels/colors/order for every core
 * StoryStatus. Falls back to the built-in defaults when the workflow rows
 * haven't loaded yet — keeps selects functional during the initial render.
 *
 * Pass `undefined` for the projectId if the caller doesn't know it yet (e.g.
 * create-story dialog before a project is selected) — the hook returns the
 * default labels in that case.
 */
export function useProjectStatuses(projectId: string | undefined): {
  list: StatusDisplay[];
  byCore: Record<StoryStatus, StatusDisplay>;
  // The RAW, uncollapsed workflow rows (sorted by order). Use this — not `list`/
  // `byCore` — anywhere a SPECIFIC column matters (e.g. a story's actual status),
  // since a project can have several columns sharing one coreStatus and the
  // collapsed maps keep only the last one per core.
  rows: WorkflowStatus[];
} {
  const dispatch = useAppDispatch();
  const rows = useAppSelector((s) =>
    projectId ? s.workflow.byProject[projectId] ?? null : null,
  );

  useEffect(() => {
    if (projectId && rows == null) void dispatch(fetchWorkflowThunk(projectId));
  }, [dispatch, projectId, rows]);

  return useMemo(() => {
    const byCore = makeDisplayMap(rows);
    const list = (Object.keys(byCore) as StoryStatus[])
      .map((k) => byCore[k])
      .sort((a, b) => a.order - b.order);
    const sortedRows = [...(rows ?? [])].sort((a, b) => a.order - b.order);
    return { list, byCore, rows: sortedRows };
  }, [rows]);
}

function makeDisplayMap(rows: WorkflowStatus[] | null): Record<StoryStatus, StatusDisplay> {
  const DEFAULT_COLORS: Record<StoryStatus, string> = {
    todo: '#64748B',
    in_progress: '#3B82F6',
    in_review: '#8B5CF6',
    qa: '#F59E0B',
    done: '#10B981',
  };
  const DEFAULT_ORDER: Record<StoryStatus, number> = {
    todo: 0, in_progress: 1, in_review: 2, qa: 3, done: 4,
  };
  const DEFAULT_CATEGORY: Record<StoryStatus, StatusDisplay['category']> = {
    todo: 'todo', in_progress: 'in_progress',
    in_review: 'in_progress', qa: 'in_progress', done: 'done',
  };

  const keys: StoryStatus[] = ['todo', 'in_progress', 'in_review', 'qa', 'done'];
  const map = {} as Record<StoryStatus, StatusDisplay>;
  for (const k of keys) {
    map[k] = {
      coreStatus: k,
      label: STORY_STATUS_LABEL[k],
      color: DEFAULT_COLORS[k],
      order: DEFAULT_ORDER[k],
      category: DEFAULT_CATEGORY[k],
    };
  }
  if (rows) {
    for (const r of rows) {
      map[r.coreStatus] = {
        coreStatus: r.coreStatus,
        label: r.label,
        color: r.color,
        order: r.order,
        category: r.category,
      };
    }
  }
  return map;
}
