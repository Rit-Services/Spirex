// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

export const createWorklogSchema = z.object({
  storyId: z.string().min(1),
  timeSpent: z.string().min(1), // "2h 30m" grammar — parsed server-side
  startedAt: z.string().datetime().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export const updateWorklogSchema = z.object({
  timeSpent: z.string().min(1).optional(),
  startedAt: z.string().datetime().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export const worklogIdParamsSchema = z.object({ id: z.string().min(1) });
