// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { asyncHandler } from '../../middlewares/asyncHandler.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { jiraClient, type JiraCredentials } from '../../services/jira/jiraClient.js';
import { jiraImportService, type ProgressCallback } from '../../services/jira/jiraImportService.js';
import { jiraConnectionService } from '../../services/jira/jiraConnectionService.js';
import { prisma } from '../../db/prisma.js';

/** Parse creds from the body, or return null if any field is missing — so the
 *  caller can fall back to the user's saved connection. */
function parseCredsOptional(body: Record<string, unknown>): JiraCredentials | null {
  const domain = typeof body.domain === 'string' ? body.domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const apiToken = typeof body.apiToken === 'string' ? body.apiToken.trim() : '';
  if (!domain || !email || !apiToken) return null;
  return { domain, email, apiToken };
}

/**
 * Resolve the credentials for a request: prefer creds supplied in the body
 * (a fresh connect / "use a different account"), otherwise fall back to the
 * caller's saved connection so they never have to re-enter the token. Throws a
 * clear 400 if neither is available.
 */
async function resolveCreds(req: Request): Promise<JiraCredentials> {
  const fromBody = parseCredsOptional(req.body as Record<string, unknown>);
  if (fromBody) return fromBody;
  const saved = await jiraConnectionService.getCredentials(req.user!.id);
  if (saved) return saved;
  throw ErrorResponse.badRequest('No JIRA connection — provide domain, email and apiToken');
}

// Map a raw JIRA client error (plain Error with a status in the message) to a
// clear, client-facing message. Shared by the JSON path (which throws) and the
// SSE path (which can't throw once headers are sent — it emits an error event).
function jiraErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('401')) return 'JIRA credentials invalid — check your email and API token';
  if (msg.includes('403')) return 'Your JIRA account does not have access to this resource';
  if (msg.includes('404')) return 'JIRA project or resource not found';
  if (err instanceof ErrorResponse) return err.message;
  return msg || 'Import failed';
}

// Convert raw JIRA client errors into proper ErrorResponse so the error handler
// returns structured JSON, not 500.
function wrapJiraError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('401')) throw ErrorResponse.badRequest('JIRA credentials invalid — check your email and API token');
  if (msg.includes('403')) throw ErrorResponse.forbidden('Your JIRA account does not have access to this resource');
  if (msg.includes('404')) throw ErrorResponse.notFound('JIRA project or resource not found');
  // Pass through ErrorResponse instances unchanged
  if (err instanceof ErrorResponse) throw err;
  throw new ErrorResponse(msg, 502);
}

export const validateCredentials = asyncHandler(async (req: Request, res: Response) => {
  const creds = await resolveCreds(req);
  const fromBody = parseCredsOptional(req.body as Record<string, unknown>) != null;
  try {
    const myself = await jiraClient.validateCredentials(creds);
    // Auto-save on a successful fresh connect, so the next import reuses it.
    // Reusing an already-saved connection (no creds in body) is a no-op here.
    if (fromBody) {
      await jiraConnectionService.save(req.user!.id, creds, {
        accountId: myself.accountId,
        displayName: myself.displayName,
      });
    }
    res.json({ ok: true, accountId: myself.accountId, displayName: myself.displayName, saved: fromBody });
  } catch (err) {
    wrapJiraError(err);
  }
});

export const listJiraProjects = asyncHandler(async (req: Request, res: Response) => {
  const creds = await resolveCreds(req);
  try {
    const projects = await jiraClient.listProjects(creds);
    res.json(projects.map((p) => ({ id: p.id, key: p.key, name: p.name, type: p.projectTypeKey })));
  } catch (err) {
    wrapJiraError(err);
  }
});

export const previewImport = asyncHandler(async (req: Request, res: Response) => {
  const creds = await resolveCreds(req);
  const jiraProjectKey = typeof req.body.jiraProjectKey === 'string' ? req.body.jiraProjectKey.trim() : '';
  if (!jiraProjectKey) throw ErrorResponse.badRequest('jiraProjectKey is required');
  try {
    const result = await jiraImportService.preview(creds, jiraProjectKey);
    res.json(result);
  } catch (err) {
    wrapJiraError(err);
  }
});

export const importJira = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const creds = await resolveCreds(req);
  const jiraProjectKey = typeof body.jiraProjectKey === 'string' ? body.jiraProjectKey.trim() : '';
  const mode = typeof body.mode === 'string' ? body.mode : 'tickets';

  if (!jiraProjectKey) throw ErrorResponse.badRequest('jiraProjectKey is required');

  // Resolve the import call up-front so ALL validation (org context, membership)
  // throws normal JSON errors BEFORE we commit to an SSE response. `onProgress`
  // is undefined for the legacy JSON path and wired to SSE for the stream path.
  let runImport: (onProgress?: ProgressCallback) => Promise<unknown>;

  if (mode === 'project') {
    // Phase 13: the imported project belongs to the importer's ACTIVE org, so
    // it shows up in the console (listForUser/listForOrg are org-scoped). No
    // active org → refuse rather than create an invisible org-less project.
    const organizationId = req.orgContext?.orgId;
    if (!organizationId) {
      throw ErrorResponse.badRequest('No active organization to import the project into');
    }
    const jiraProjectName = typeof body.jiraProjectName === 'string' ? body.jiraProjectName.trim() : jiraProjectKey;
    runImport = (onProgress) =>
      jiraImportService.importFullProject({
        creds,
        jiraProjectKey,
        jiraProjectName,
        actorId: req.user!.id,
        organizationId,
        onProgress,
      });
  } else {
    const targetProjectId = typeof body.targetProjectId === 'string' ? body.targetProjectId.trim() : '';
    if (!targetProjectId) throw ErrorResponse.badRequest('targetProjectId is required for issue import mode');

    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: targetProjectId, userId: req.user!.id } },
    });
    if (!membership) throw ErrorResponse.forbidden('Not a member of the target project');

    runImport = (onProgress) =>
      jiraImportService.importTickets({
        creds,
        jiraProjectKey,
        targetProjectId,
        actorId: req.user!.id,
        onProgress,
      });
  }

  // ── SSE path: stream weighted progress, then a final `done`/`error` event ──
  const wantsStream =
    req.query.stream === '1' || (req.headers.accept ?? '').includes('text/event-stream');

  if (wantsStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable proxy/nginx buffering
    res.flushHeaders?.();

    let closed = false;
    // Heartbeat comment keeps idle proxies from dropping the connection between
    // slow phases (e.g. the initial JIRA fetch before any tick).
    const heartbeat = setInterval(() => {
      if (!closed && !res.writableEnded) res.write(': ping\n\n');
    }, 15000);
    res.on('close', () => { closed = true; clearInterval(heartbeat); });

    const send = (event: string, data: unknown) => {
      if (closed || res.writableEnded) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await runImport((e) => send('progress', e));
      send('done', result);
    } catch (err) {
      send('error', { message: jiraErrorMessage(err) });
    } finally {
      clearInterval(heartbeat);
      if (!closed && !res.writableEnded) res.end();
    }
    return;
  }

  // ── Legacy JSON path (single blocking response) ──
  try {
    const result = await runImport();
    res.status(201).json(result);
  } catch (err) {
    wrapJiraError(err);
  }
});

/** Return the caller's saved connection (masked, no token) or `{ connected: false }`. */
export const getConnection = asyncHandler(async (req: Request, res: Response) => {
  const masked = await jiraConnectionService.getMasked(req.user!.id);
  res.json(masked ?? { connected: false });
});

/** Forget the caller's saved connection — the "use a different account" path. */
export const deleteConnection = asyncHandler(async (req: Request, res: Response) => {
  await jiraConnectionService.remove(req.user!.id);
  res.status(204).end();
});
