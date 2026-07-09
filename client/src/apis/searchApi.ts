// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { SearchResponse, SearchType } from '@/types/search';

export interface SearchParams {
  q: string;
  type?: SearchType;
  projectId?: string;
  status?: string;
  storyType?: string;
  /** User id, or 'unassigned' to filter for stories with no assignee. */
  assigneeId?: string;
  reporterId?: string;
}

export const searchApi = {
  search: (params: SearchParams) =>
    httpClient
      .get<SearchResponse>(urls.search, { params })
      .then((r) => r.data),
};
