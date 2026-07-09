// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { searchService } from '../../services/search/searchService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import type {
  SearchType,
  StoryStatusFilter,
  StoryTypeFilter,
} from '../../services/search/searchService.js';

const VALID_TYPES = new Set<SearchType>(['story', 'epic', 'project', 'comment']);
const VALID_STATUSES = new Set<StoryStatusFilter>([
  'todo', 'in_progress', 'in_review', 'qa', 'done',
]);
const VALID_STORY_TYPES = new Set<StoryTypeFilter>(['story', 'bug', 'task']);

function strParam(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export const search = asyncHandler(async (req: Request, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length > 200) {
    throw new ErrorResponse('Query too long', 400);
  }

  const type = strParam(req.query.type);
  if (type && !VALID_TYPES.has(type as SearchType)) {
    throw new ErrorResponse('Invalid type filter', 400);
  }

  const status = strParam(req.query.status);
  if (status && !VALID_STATUSES.has(status as StoryStatusFilter)) {
    throw new ErrorResponse('Invalid status filter', 400);
  }

  const storyType = strParam(req.query.storyType);
  if (storyType && !VALID_STORY_TYPES.has(storyType as StoryTypeFilter)) {
    throw new ErrorResponse('Invalid storyType filter', 400);
  }

  const projectId = strParam(req.query.projectId);
  const assigneeId = strParam(req.query.assigneeId);
  const reporterId = strParam(req.query.reporterId);

  // Allow filter-only browsing (no q) as long as ANY filter is provided.
  // Otherwise reject — we don't want to dump the entire dataset on a bare GET.
  const hasFilter = !!(type || status || storyType || projectId || assigneeId || reporterId);
  const hasQuery = q.length >= 2;
  if (!hasQuery && !hasFilter) {
    throw new ErrorResponse('Provide a query (2+ chars) or at least one filter', 400);
  }

  const results = await searchService.search({
    q: hasQuery ? q : '',
    type: type as SearchType | undefined,
    projectId,
    status: status as StoryStatusFilter | undefined,
    storyType: storyType as StoryTypeFilter | undefined,
    assigneeId,
    reporterId,
    actorUserId: req.user!.id,
    // Phase 13: admin-wide search visibility now follows the org role.
    actorGlobalRole: req.orgContext?.role === 'admin' ? 'admin' : 'member',
    // Phase 2: scope every search to the caller's active org.
    organizationId: req.orgContext?.orgId,
  });

  res.json(results);
});
