// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a #RRGGBB hex string');

// WIP limit: a positive cap, or null to remove the cap. `undefined` (field
// omitted) leaves the existing value untouched — null vs undefined is load-bearing
// downstream, so keep `.nullable()` distinct from `.optional()`.
const wipLimit = z.number().int().min(1).max(99).nullable().optional();

export const updateWorkflowStatusSchema = z.object({
  label: z.string().min(1).max(40).optional(),
  color: hexColor.optional(),
  order: z.number().int().min(0).max(99).optional(),
  category: z.enum(['todo', 'in_progress', 'done']).optional(),
  wipLimit,
});

/** PUT /api/projects/:projectId/workflow — full reorder/rename in one call. */
export const bulkUpdateWorkflowSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1).max(40).optional(),
        color: hexColor.optional(),
        order: z.number().int().min(0).max(99).optional(),
        category: z.enum(['todo', 'in_progress', 'done']).optional(),
        wipLimit,
      }),
    )
    .min(1)
    .max(20),
});

export const createWorkflowColumnSchema = z.object({
  coreStatus: z.enum(['todo', 'in_progress', 'in_review', 'qa', 'done']),
  label: z.string().min(1).max(40),
  color: hexColor,
  category: z.enum(['todo', 'in_progress', 'done']),
  order: z.number().int().min(0).max(99).optional(),
});

export const projectIdParamsSchema = z.object({ projectId: z.string().min(1) });
export const workflowIdParamsSchema = z.object({ id: z.string().min(1) });
