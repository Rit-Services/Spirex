// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

export type SearchType = 'story' | 'epic' | 'project' | 'comment';

export interface SearchHit {
  type: SearchType;
  id: string;
  key?: string;
  title: string;
  snippet: string;
  rank: number;
  projectId: string;
  projectKey: string;
  /** Field the query hit ('title' | 'description' | 'comment' | 'acceptance criteria' | 'custom field') — powers the "matched in …" badge. */
  matchedIn?: string;
  // story extras
  status?: string;
  priority?: string;
  // comment extras
  storyId?: string;
  storyKey?: string;
}

export interface SearchResponse {
  stories: SearchHit[];
  epics: SearchHit[];
  projects: SearchHit[];
  comments: SearchHit[];
  total: number;
}
