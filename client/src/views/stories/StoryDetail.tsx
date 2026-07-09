// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchProjectsThunk, setCurrentProject } from '@/store/projectSlice';
import { StoryDetailContent } from '@/components/scrum/StoryDetailContent';

/**
 * Full-page story view — the route counterpart of the `StoryDetailPanel`
 * drawer. Reached by clicking a story key in the drawer or by opening that
 * link in a new tab. Establishes the project context (current project +
 * project list) so a cold deep-link load resolves edit permissions, which
 * `useCurrentProject` derives from `s.projects.currentId`.
 */
export function StoryDetail() {
  const { id, storyKey } = useParams<{ id: string; storyKey: string }>();
  const dispatch = useAppDispatch();
  const projects = useAppSelector((s) => s.projects.list);

  useEffect(() => {
    if (id) dispatch(setCurrentProject(id));
    if (projects.length === 0) void dispatch(fetchProjectsThunk());
  }, [dispatch, id, projects.length]);

  if (!storyKey) return null;
  return <StoryDetailContent storyKey={storyKey} mode="page" />;
}
