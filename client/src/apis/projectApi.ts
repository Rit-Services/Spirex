// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { Project, ProjectMember, ProjectType } from '@/types/project';
import type { ProjectRole } from '@/features/auth/permissions';

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  defaultSprintLengthWeeks?: number;
  key?: string;
  type?: ProjectType;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string | null;
  defaultSprintLengthWeeks?: number;
}

/** An external/ghost user (e.g. "Maria (unlinked)") with work in a project. */
export interface UnlinkedUser {
  id: string;
  name: string;
  externalSource: string | null;
  externalId: string | null;
  /** How many items in this project are attributed to the ghost. */
  itemCount: number;
}

export const projectApi = {
  async list(): Promise<Project[]> {
    const { data } = await httpClient.get<{ projects: Project[] }>(urls.projects.list);
    return data.projects;
  },

  async get(id: string): Promise<Project> {
    const { data } = await httpClient.get<{ project: Project }>(urls.projects.detail(id));
    return data.project;
  },

  async create(input: CreateProjectInput): Promise<Project> {
    const { data } = await httpClient.post<{ project: Project }>(urls.projects.create, input);
    return data.project;
  },

  async update(id: string, input: UpdateProjectInput): Promise<Project> {
    const { data } = await httpClient.patch<{ project: Project }>(urls.projects.update(id), input);
    return data.project;
  },

  async remove(id: string): Promise<void> {
    await httpClient.delete(urls.projects.remove(id));
  },

  async listMembers(id: string): Promise<ProjectMember[]> {
    const { data } = await httpClient.get<{ members: ProjectMember[] }>(urls.projects.members(id));
    return data.members;
  },

  async upsertMember(
    id: string,
    input: { userId: string; projectRole: ProjectRole },
  ): Promise<ProjectMember> {
    const { data } = await httpClient.put<{ member: ProjectMember }>(urls.projects.members(id), input);
    return data.member;
  },

  async removeMember(id: string, userId: string): Promise<void> {
    await httpClient.delete(urls.projects.member(id, userId));
  },

  async listUnlinkedUsers(id: string): Promise<UnlinkedUser[]> {
    const { data } = await httpClient.get<{ users: UnlinkedUser[] }>(
      urls.projects.unlinkedUsers(id),
    );
    return data.users;
  },

  async linkUnlinkedUser(
    id: string,
    ghostId: string,
    targetUserId: string,
  ): Promise<{ reassigned: number }> {
    const { data } = await httpClient.post<{ reassigned: number }>(
      urls.projects.linkUnlinkedUser(id, ghostId),
      { targetUserId },
    );
    return data;
  },
};
