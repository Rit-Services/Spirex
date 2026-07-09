// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

export const feedbackWebhookSchema = z.object({
  feedbackId: z.string().min(1),
  createdAt: z.string().datetime(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5_000),
  project: z.object({
    key: z.string().min(1),
    name: z.string().min(1),
  }),
  page: z.object({
    url: z.string().url(),
    path: z.string(),
    viewportWidth: z.number().int().optional(),
    viewportHeight: z.number().int().optional(),
    userAgent: z.string().optional(),
  }),
  user: z.object({
    email: z.string().email(),
    fullName: z.string().min(1),
  }),
  organization: z
    .object({
      name: z.string(),
      slug: z.string(),
    })
    .optional(),
  screenshot: z
    .object({
      filename: z.string().default('feedback.png'),
      contentType: z.string().regex(/^image\//),
      base64: z.string().min(1),
    })
    .optional(),
});

export type FeedbackWebhookPayload = z.infer<typeof feedbackWebhookSchema>;
