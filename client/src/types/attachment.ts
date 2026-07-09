// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

export type AttachmentKind = 'image' | 'document' | 'audio' | 'video';

export interface Attachment {
  id: string;
  projectId: string;
  storyId: string | null;
  uploadedById: string;
  filename: string;
  mimetype: string;
  sizeBytes: number;
  path: string;
  kind: AttachmentKind;
  createdAt: string;
  /** Convenience added by the API response — not a DB column. */
  url?: string;
  uploadedBy?: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}
