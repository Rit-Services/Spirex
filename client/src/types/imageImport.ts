// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { StoryType, Priority, ImportStatus } from './import';

export type AnnotationShape = 'rect' | 'arrow' | 'text';

export interface Annotation {
  id: string;
  shape: AnnotationShape;
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  text: string;
  color: string;
}

export interface ImageImportDraft {
  title: string;
  description: string;
  acceptanceCriteria: string;
  type: StoryType;
  priority: Priority;
}

export interface ImageImport {
  id: string;
  projectId: string;
  uploadedById: string;
  attachmentId: string;
  attachmentUrl: string;
  status: ImportStatus;
  annotations: Annotation[];
  draft: ImageImportDraft;
  createdAt: string;
  committedAt?: string | null;
  attachment?: { id: string; filename: string; mimetype: string };
  uploadedBy?: { id: string; name: string; email: string };
  stories?: { id: string; key: string; title: string }[];
}

export interface CreateImageImportResult {
  id: string;
  projectId: string;
  attachmentId: string;
  attachmentUrl: string;
  filename: string;
  annotations: Annotation[];
  draft: ImageImportDraft;
}

export interface CommitImageEdit {
  title?: string;
  description?: string;
  acceptanceCriteria?: string;
  type?: StoryType;
  priority?: Priority;
  epicId?: string | null;
  sprintId?: string | null;
}
