// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

export const projectNotificationEvent = z.enum([
  'status_changed',
  'ticket_completed',
  'sprint_completed',
]);

export const projectNotifParamsSchema = z.object({ projectId: z.string().min(1) });

export const projectNotifUserParamsSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
});

/** PUT body — the (up to 3) event cells for ONE user that the matrix saves. */
export const setProjectNotifSchema = z.object({
  entries: z
    .array(
      z.object({
        event: projectNotificationEvent,
        emailEnabled: z.boolean(),
      }),
    )
    .min(1)
    .max(3),
});
