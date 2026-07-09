// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAppSelector } from '@/store';
import type { ProjectType } from '@/types/project';

/**
 * Gate a route to a project methodology. A scrum-only route (board, sprints) on
 * a kanban project — or a kanban board on a scrum project — bounces to that
 * project's natural board, so hidden sections can't be reached via a deep link.
 *
 * While the project isn't in the store yet we render through (the child view
 * shows its own loading); the redirect kicks in once the type is known.
 */
export function ProjectTypeGuard({ allow, children }: { allow: ProjectType; children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const project = useAppSelector((s) => s.projects.list.find((p) => p.id === id));

  if (project && project.type !== allow) {
    const home = project.type === 'kanban' ? 'kanban' : 'board';
    return <Navigate to={`/projects/${id}/${home}`} replace />;
  }
  return <>{children}</>;
}
