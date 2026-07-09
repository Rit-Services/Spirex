// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

export type ImportStatus = 'pending' | 'committed' | 'discarded';
export type StoryType = 'story' | 'bug' | 'task';
export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface DraftStory {
  localId: string;
  title: string;
  description: string;
  type: StoryType;
  priority: Priority;
  acceptanceCriteria?: string;
}

export interface CommitEdit {
  localId: string;
  title?: string;
  description?: string;
  acceptanceCriteria?: string;
  type?: StoryType;
  priority?: Priority;
  epicId?: string;
  sprintId?: string;
  skip?: boolean;
}

export interface DocumentImport {
  id: string;
  projectId: string;
  uploadedById: string;
  status: ImportStatus;
  draftPayload: DraftStory[];
  originalFilename: string;
  createdAt: string;
  committedAt?: string | null;
  uploadedBy?: { id: string; name: string; email: string };
  stories?: { id: string; key: string; title: string }[];
  _count?: { stories: number };
}
