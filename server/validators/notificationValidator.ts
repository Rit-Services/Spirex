// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

// Mirrors the Prisma NotificationType / NotificationChannel enums. Kept as a
// literal list (not z.nativeEnum) so the validator doesn't import @prisma/client.
export const notificationTypeEnum = z.enum([
  'story_assigned',
  'story_commented',
  'story_status_changed',
  'story_reporter_changed',
  'story_mentioned',
  'story_priority_changed',
  'story_updated',
  'weekly_digest',
]);

export const notificationChannelEnum = z.enum(['in_app', 'email']);

// PUT /notifications/preferences — the user sends the cells they want to
// persist. 14 = full grid (7 types × 2 channels); the cap leaves headroom.
export const updatePreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: notificationTypeEnum,
        channel: notificationChannelEnum,
        enabled: z.boolean(),
      }),
    )
    .max(20),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

// GET /notifications — optional filters for the full notifications page.
// Everything is optional so the bell's bare GET keeps its exact old behavior.
// `org_invite` is a valid stored type but not part of the preference enum
// above, so the list filter gets its own enum including it.
const listTypeEnum = z.enum([
  'story_assigned',
  'story_commented',
  'story_status_changed',
  'story_reporter_changed',
  'story_mentioned',
  'story_priority_changed',
  'story_updated',
  'org_invite',
]);

export const listNotificationsQuerySchema = z.object({
  /** Notification id to continue AFTER (exclusive) — newest-first pages. */
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  // Query strings carry booleans as text; only the literal 'true' opts in.
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  type: listTypeEnum.optional(),
  q: z.string().trim().min(1).max(200).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
