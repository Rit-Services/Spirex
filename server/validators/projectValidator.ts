// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  defaultSprintLengthWeeks: z.number().int().min(1).max(4).optional(),
  key: z.string().regex(/^[A-Z0-9]{2,10}$/, 'Key must be 2-10 uppercase alphanumerics').optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).optional().nullable(),
  defaultSprintLengthWeeks: z.number().int().min(1).max(4).optional(),
});

export const projectIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const projectMemberParamsSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
});

export const upsertMemberSchema = z.object({
  userId: z.string().min(1),
  projectRole: z.enum(['lead', 'developer', 'reporter', 'viewer']),
});

export const linkUnlinkedUserParamsSchema = z.object({
  id: z.string().min(1),
  ghostId: z.string().min(1),
});

export const linkUnlinkedUserSchema = z.object({
  targetUserId: z.string().min(1),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type UpsertMemberInput = z.infer<typeof upsertMemberSchema>;
