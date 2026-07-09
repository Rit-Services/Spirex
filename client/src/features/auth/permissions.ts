// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

// Client mirror of server/utils/permissions.ts. Kept small and deliberate;
// any change here must mirror the server. See PLAN.md for rationale.

export type GlobalRole = 'admin' | 'member' | 'external';
export type ProjectRole = 'lead' | 'developer' | 'reporter' | 'viewer';

export type Action =
  // phase 1
  | 'user:manage'
  // phase 13 — org self-service settings
  | 'org:manage'
  // phase 2
  | 'project:create'
  | 'project:view'
  | 'project:edit'
  | 'project:delete'
  | 'member:manage'
  // phase 3 — epics
  | 'epic:create'
  | 'epic:edit'
  | 'epic:delete'
  // phase 3 — stories
  | 'story:create'
  | 'story:edit'
  | 'story:status'
  | 'story:assign'
  | 'story:delete'
  // phase 4 — sprints
  | 'sprint:create'
  | 'sprint:start'
  | 'sprint:complete'
  | 'sprint:edit'
  | 'sprint:delete'
  | 'story:sprint-move'
  // phase 5 — worklogs + comments + reports
  | 'worklog:create'
  | 'comment:create'
  | 'report:view'
  // phase 8 — attachments
  | 'attachment:upload'
  | 'attachment:delete'
  // phase 9 — custom workflows
  | 'workflow:edit'
  // phase 10 — document import
  | 'import:create'
  // custom fields — defining/editing a project's field schema
  | 'customfield:manage';

interface Actor {
  globalRole: GlobalRole;
  projectRole?: ProjectRole;
}

const GLOBAL_ACTIONS: Record<GlobalRole, Action[]> = {
  admin: [
    'user:manage',
    'org:manage',
    'project:create', 'project:view', 'project:edit', 'project:delete', 'member:manage',
    'epic:create', 'epic:edit', 'epic:delete',
    'story:create', 'story:edit', 'story:status', 'story:assign', 'story:delete',
    'sprint:create', 'sprint:start', 'sprint:complete', 'sprint:edit', 'sprint:delete',
    'story:sprint-move',
    'worklog:create', 'comment:create', 'report:view',
    'attachment:upload', 'attachment:delete',
    'workflow:edit',
    'import:create',
    'customfield:manage',
  ],
  member: ['project:create', 'project:view', 'import:create'],
  // External / client role: can see projects they're a member of, but cannot
  // start new projects or run JIRA imports at the global level. All other
  // permissions come from their per-project role assignment.
  external: ['project:view'],
};

const PROJECT_ACTIONS: Record<ProjectRole, Action[]> = {
  lead: [
    'project:view', 'project:edit', 'project:delete', 'member:manage',
    'epic:create', 'epic:edit', 'epic:delete',
    'story:create', 'story:edit', 'story:status', 'story:assign', 'story:delete',
    'sprint:create', 'sprint:start', 'sprint:complete', 'sprint:edit', 'sprint:delete',
    'story:sprint-move',
    'worklog:create', 'comment:create', 'report:view',
    'attachment:upload', 'attachment:delete',
    'workflow:edit',
    'import:create',
    'customfield:manage',
  ],
  developer: [
    'project:view', 'member:manage',
    'epic:create', 'epic:edit',
    'story:create', 'story:edit', 'story:status', 'story:assign',
    'story:sprint-move',
    'worklog:create', 'comment:create', 'report:view',
    'attachment:upload',
    'import:create',
  ],
  reporter: [
    'project:view', 'member:manage',
    'story:create',
    'comment:create',
    'report:view',
    'attachment:upload',
  ],
  viewer: [
    'project:view', 'member:manage',
    'report:view',
  ],
};

export const PROJECT_ROLE_LEVEL: Record<ProjectRole, number> = {
  lead: 4,
  developer: 3,
  reporter: 2,
  viewer: 1,
};

/**
 * Maximum project-role level the actor is allowed to assign or modify.
 * Global admins bypass and can assign any role.
 */
export function maxAssignableProjectLevel(
  globalRole: GlobalRole,
  projectRole: ProjectRole | undefined,
): number {
  if (globalRole === 'admin') return PROJECT_ROLE_LEVEL.lead;
  return projectRole ? PROJECT_ROLE_LEVEL[projectRole] : 0;
}

export function can(actor: Actor, action: Action): boolean {
  if (GLOBAL_ACTIONS[actor.globalRole]?.includes(action)) return true;
  if (actor.projectRole && PROJECT_ACTIONS[actor.projectRole]?.includes(action)) return true;
  return false;
}
