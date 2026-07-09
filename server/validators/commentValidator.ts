// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

export const createCommentSchema = z.object({
  storyId: z.string().min(1),
  body: z.string().min(1).max(10_000),
});

export const updateCommentSchema = z.object({
  body: z.string().min(1).max(10_000),
});

export const commentIdParamsSchema = z.object({ id: z.string().min(1) });
