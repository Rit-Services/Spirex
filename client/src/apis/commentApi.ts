// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { Comment } from '@/types/scrum';

export const commentApi = {
  async listByStory(storyId: string): Promise<Comment[]> {
    const { data } = await httpClient.get<{ comments: Comment[] }>(urls.comments.byStory(storyId));
    return data.comments;
  },
  async create(input: { storyId: string; body: string }): Promise<Comment> {
    const { data } = await httpClient.post<{ comment: Comment }>(urls.comments.create, input);
    return data.comment;
  },
  async update(id: string, body: string): Promise<Comment> {
    const { data } = await httpClient.patch<{ comment: Comment }>(urls.comments.detail(id), { body });
    return data.comment;
  },
  async remove(id: string): Promise<void> {
    await httpClient.delete(urls.comments.detail(id));
  },
};
