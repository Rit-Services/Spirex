// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

const dateLike = z
  .union([z.string().datetime(), z.string().date(), z.null()])
  .optional();

export const createSprintSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  goal: z.string().max(2000).optional().nullable(),
  startDate: dateLike,
  endDate: dateLike,
});

export const updateSprintSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  goal: z.string().max(2000).optional().nullable(),
  startDate: dateLike,
  endDate: dateLike,
});

export const completeSprintSchema = z.object({
  incompleteTarget: z.string().min(1).optional(),
});

export const moveStoryToSprintSchema = z.object({
  sprintId: z.string().nullable(),
});

export const sprintIdParamsSchema = z.object({ id: z.string().min(1) });
