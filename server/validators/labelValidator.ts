// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a #RRGGBB hex string');

export const createLabelSchema = z.object({
  name: z.string().min(1).max(40),
  // Optional — omit to let the service auto-assign the next palette color.
  color: hexColor.optional(),
});

export const updateLabelSchema = z
  .object({
    name: z.string().min(1).max(40).optional(),
    color: hexColor.optional(),
  })
  .refine((b) => b.name !== undefined || b.color !== undefined, {
    message: 'Provide a name or a color to update',
  });

export const attachLabelSchema = z.object({ labelId: z.string().min(1) });

export const projectIdParamsSchema = z.object({ projectId: z.string().min(1) });
export const labelIdParamsSchema = z.object({ id: z.string().min(1) });
export const storyLabelParamsSchema = z.object({
  id: z.string().min(1),
  labelId: z.string().min(1),
});
