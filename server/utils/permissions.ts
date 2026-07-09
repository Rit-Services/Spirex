// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

// Tiny role→actions map. Intentionally small and auditable — NOT a full RBAC engine.

export type GlobalRole = 'admin' | 'member' | 'external';
export type ProjectRole = 'lead' | 'developer' | 'reporter' | 'viewer';

export type Action =
  // phase 1
  | 'user:manage'
  // phase 13 — org self-service settings (org admin edits name/url/logo)
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
  // phase 5 — worklogs + comments
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
  // custom fields — defining/editing a project's field schema (values on a
  // story are governed by story:edit)
  | 'customfield:manage';

export interface ActorContext {
  userId: string;
  // Phase 13: platform operator — bypasses every tenant permission check.
  isSuperAdmin?: boolean;
  // Phase 13 (Step 6 cutover): the org-scoped role is now the authoritative
  // source, resolved from OrgMembership via req.orgContext.role. Undefined when
  // the actor has no active org (e.g. an orphaned user) → denied by default.
  // The legacy `globalRole` is no longer consulted here.
  orgRole?: GlobalRole;
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

export function can(actor: ActorContext, action: Action): boolean {
  // Platform superadmin governs everything (Phase 13).
  if (actor.isSuperAdmin) return true;
  // Org-scoped role (membership-resolved) is authoritative after the Step-6 cutover.
  if (actor.orgRole && GLOBAL_ACTIONS[actor.orgRole]?.includes(action)) return true;
  if (actor.projectRole && PROJECT_ACTIONS[actor.projectRole]?.includes(action)) return true;
  return false;
}
