// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request } from 'express';
import { ErrorResponse } from './errorResponse.js';
import { projectService } from '../services/project/projectService.js';
import { can, type Action, type ActorContext, type ProjectRole } from './permissions.js';

// ─────────────────────────────────────────────────────────────────────────────
// THE tenant boundary for project-scoped resources.
//
// Every by-id project access a tenant user makes MUST pass through here. The
// rule: a non-superadmin can only ever resolve a project that belongs to their
// ACTIVE organization (`req.orgContext.orgId`). A project in another org 404s —
// identical to "does not exist" — so ids can't be enumerated across tenants.
//
// This lives in ONE place on purpose. The cross-tenant IDOR it closes was born
// from every controller carrying its OWN copy of an "authorize by can()" helper
// that resolved membership and role but never compared the resource's org. Route
// all controllers through this and the org check can't be forgotten in the next
// endpoint the way it was in the last dozen.
//
// Superadmins (platform operators) legitimately act across tenants and carry no
// org context, so they bypass the scoping and load by raw id.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load the project the caller is permitted to SEE AT ALL under tenant isolation,
 * and build their permission-actor context for it. Throws 401 (no user), 403 (no
 * active org for a tenant user), or 404 (project missing or in another org).
 *
 * Does NOT check a specific action — use this only when the caller runs several
 * `can()` checks against the same project (e.g. project-notification's own-row vs
 * manage-all split). For a single action, prefer `assertProjectAction`.
 */
export async function resolveProjectActor(req: Request, projectId: string) {
  if (!req.user) throw ErrorResponse.unauthorized();

  const project = req.user.isSuperAdmin
    ? await projectService.getById(projectId)
    : await loadProjectInActiveOrg(req, projectId);

  const membership = await projectService.getMembership(project.id, req.user.id);
  const actor: ActorContext = {
    userId: req.user.id,
    isSuperAdmin: req.user.isSuperAdmin,
    orgRole: req.orgContext?.role,
    projectRole: membership?.projectRole as ProjectRole | undefined,
  };
  return { project, membership, actor };
}

/**
 * Tenant-scoped authorization gate for a single action. Verifies the project is
 * in the caller's org (404 otherwise), THEN that their role grants `action` (403
 * otherwise). Returns the loaded project + membership + actor for callers that
 * need the hydrated project (e.g. to return it in the response).
 */
export async function assertProjectAction(req: Request, projectId: string, action: Action) {
  const ctx = await resolveProjectActor(req, projectId);
  if (!can(ctx.actor, action)) throw ErrorResponse.forbidden();
  return ctx;
}

async function loadProjectInActiveOrg(req: Request, projectId: string) {
  const orgId = req.orgContext?.orgId;
  // No active org → no tenant resource is visible to this user. Mirrors can()
  // denying an actor with no orgRole; surfaced as 403 (not 404) because the
  // failure is "you have no tenant to look in", not "this project is missing".
  if (!orgId) throw ErrorResponse.forbidden();
  return projectService.getByIdInOrg(projectId, orgId);
}
