// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const isoDate = z.string().datetime().or(z.string().date()).nullable().optional();

export const createEpicSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  color: hexColor.optional(),
  status: z.enum(['open', 'in_progress', 'done']).optional(),
  startDate: isoDate,
  targetDate: isoDate,
});

export const updateEpicSchema = createEpicSchema.partial();

export const epicIdParamsSchema = z.object({ id: z.string().min(1) });
