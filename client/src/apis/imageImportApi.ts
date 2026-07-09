// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type {
  Annotation,
  CommitImageEdit,
  CreateImageImportResult,
  ImageImport,
  ImageImportDraft,
} from '@/types/imageImport';
import type { Story } from '@/types/scrum';

export const imageImportApi = {
  async create(projectId: string, file: File): Promise<CreateImageImportResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('projectId', projectId);
    const { data } = await httpClient.post(urls.imageImports.create, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async getById(id: string): Promise<ImageImport> {
    const { data } = await httpClient.get(urls.imageImports.detail(id));
    return data;
  },

  async listByProject(projectId: string): Promise<ImageImport[]> {
    const { data } = await httpClient.get(urls.imageImports.list, { params: { projectId } });
    return data;
  },

  async saveAnnotations(id: string, annotations: Annotation[]): Promise<void> {
    await httpClient.patch(urls.imageImports.annotations(id), { annotations });
  },

  async saveDraft(id: string, draft: Partial<ImageImportDraft>): Promise<void> {
    await httpClient.patch(urls.imageImports.draft(id), { draft });
  },

  async generate(id: string): Promise<{ draft: ImageImportDraft }> {
    const { data } = await httpClient.post(urls.imageImports.generate(id));
    return data;
  },

  async commit(id: string, edit: CommitImageEdit): Promise<{ story: Story }> {
    const { data } = await httpClient.post(urls.imageImports.commit(id), { edit });
    return data;
  },

  async discard(id: string): Promise<void> {
    await httpClient.delete(urls.imageImports.discard(id));
  },
};
