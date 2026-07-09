// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  expiresAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((v) => (v ? new Date(v) : null)),
});

export const apiKeyIdParamsSchema = z.object({
  id: z.string().min(1),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
