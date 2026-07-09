// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

const customFieldType = z.enum(['text', 'number', 'date', 'select', 'checkbox']);

export const createCustomFieldSchema = z.object({
  name: z.string().min(1).max(60),
  type: customFieldType,
  // Only meaningful for type=select; service enforces non-empty there.
  options: z.array(z.string().min(1).max(100)).max(50).optional(),
  isRequired: z.boolean().optional(),
});

// Type is immutable after creation — converting stored values between types
// (e.g. text→number) is a data-migration problem v1 deliberately avoids.
export const updateCustomFieldSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  options: z.array(z.string().min(1).max(100)).max(50).optional(),
  isRequired: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export const customFieldIdParamsSchema = z.object({ id: z.string().min(1) });

export const customFieldProjectParamsSchema = z.object({ projectId: z.string().min(1) });
