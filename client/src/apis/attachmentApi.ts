// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { Attachment } from '@/types/attachment';

export const attachmentApi = {
  async listByStory(storyId: string): Promise<Attachment[]> {
    const { data } = await httpClient.get<{ attachments: Attachment[] }>(
      urls.attachments.byStory(storyId),
    );
    return data.attachments;
  },

  async upload(input: {
    file: File;
    projectId: string;
    storyId?: string | null;
    /** Receives upload completion 0–100 as bytes leave the browser. Fires
     *  `null` once the body is fully sent but the server is still processing
     *  (i.e. switch the UI to an indeterminate "finishing…" state). */
    onProgress?: (percent: number | null) => void;
  }): Promise<Attachment> {
    const fd = new FormData();
    fd.append('file', input.file);
    fd.append('projectId', input.projectId);
    if (input.storyId) fd.append('storyId', input.storyId);
    const { data } = await httpClient.post<{ attachment: Attachment }>(
      urls.attachments.create,
      fd,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: input.onProgress
          ? (e) => {
              if (!e.total) return;
              const pct = Math.round((e.loaded / e.total) * 100);
              // At 100% the bytes are sent but the server still has to persist
              // the file — hand back `null` so callers can show "finishing…".
              input.onProgress?.(pct >= 100 ? null : pct);
            }
          : undefined,
      },
    );
    return data.attachment;
  },

  async remove(id: string): Promise<void> {
    await httpClient.delete(urls.attachments.detail(id));
  },

  fileUrl(id: string): string {
    return urls.attachments.file(id);
  },
};
