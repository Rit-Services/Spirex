// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { DraftStory, CommitEdit, DocumentImport } from '@/types/import';

export const importApi = {
  async create(projectId: string, file: File): Promise<{ id: string; drafts: DraftStory[]; originalFilename: string }> {
    const form = new FormData();
    form.append('file', file);
    form.append('projectId', projectId);
    const { data } = await httpClient.post(urls.imports.create, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async getById(id: string): Promise<DocumentImport> {
    const { data } = await httpClient.get(urls.imports.detail(id));
    return data;
  },

  async listByProject(projectId: string): Promise<DocumentImport[]> {
    const { data } = await httpClient.get(urls.imports.list, { params: { projectId } });
    return data;
  },

  async commit(id: string, edits: CommitEdit[]): Promise<{ committed: number }> {
    const { data } = await httpClient.post(urls.imports.commit(id), { edits });
    return data;
  },

  async discard(id: string): Promise<void> {
    await httpClient.delete(urls.imports.discard(id));
  },
};
