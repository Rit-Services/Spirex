// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

export const createAttachmentSchema = z.object({
  projectId: z.string().min(1),
  storyId: z.string().optional().nullable(),
});

export const attachmentIdParamsSchema = z.object({ id: z.string().min(1) });
