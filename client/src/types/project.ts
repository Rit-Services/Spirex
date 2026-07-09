// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { User } from './user';
import type { ProjectRole } from '@/features/auth/permissions';

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  projectRole: ProjectRole;
  createdAt: string;
  user: User;
}

/** Project methodology, chosen at creation and fixed thereafter. */
export type ProjectType = 'scrum' | 'kanban';

export interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: ProjectType;
  createdById: string;
  defaultSprintLengthWeeks: number;
  createdAt: string;
  updatedAt: string;
  members?: ProjectMember[];
}
