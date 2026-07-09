// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import { getActiveOrgId } from '@/config/activeOrg';

export interface JiraCreds {
  domain: string;
  email: string;
  apiToken: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  type: string;
}

export interface ImportPreview {
  epicCount: number;
  sprintCount: number;
  issueCount: number;
  /** Total files attached across all issues — all will be imported. */
  attachmentCount: number;
  unmatchedUsers: Array<{ email: string; displayName: string }>;
  matchedUsers: Array<{ email: string; displayName: string }>;
  /** Debug: every person JIRA exposed and whether they matched a SPIREX user. */
  peopleFound: Array<{
    displayName: string;
    email: string | null;
    accountId: string | null;
    roles: string[];
    matched: boolean;
    matchMethod: 'email' | 'name' | null;
  }>;
  /** Planned workflow columns with their core status + JIRA statuses each holds. */
  workflowPlan: Array<{ name: string; coreStatus: string; category: string; statuses: string[] }>;
  workflowColumns: string[];
  /** The project key a full-project import would create (JIRA key, or suffixed). */
  projectKey: string;
  /** True when the JIRA key was taken and a new one was assigned. */
  projectKeyChanged: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  projectId?: string;
  projectKey?: string;
  epicCount?: number;
  sprintCount?: number;
  workflowColumns?: string[];
  membersLinked?: number;
  /** Count of files (issue + inline-image) pulled into SPIREX storage. */
  attachmentsImported?: number;
  /** Count of issue comments imported across all stories. */
  commentsImported?: number;
  /** Sub-tasks whose JIRA parent couldn't be resolved — imported as top-level
   *  instead of dropped (lossless). */
  subtasksReparented?: number;
  /** Files that couldn't be pulled from JIRA — never fatal, listed for review. */
  attachmentFailures?: Array<{ issueKey: string; filename: string; reason: string }>;
}

/** A weighted progress event streamed over SSE while an import runs. */
export interface ImportProgressEvent {
  phase: 'setup' | 'workflow' | 'epics' | 'sprints' | 'issues' | 'subtasks' | 'attachments' | 'members' | 'done';
  message: string;
  current?: number;
  total?: number;
  percent: number;
}

export type ImportProgressCallback = (e: ImportProgressEvent) => void;

/** Saved connection as the server exposes it — never includes the API token. */
export type SavedConnection =
  | { connected: true; domain: string; email: string; displayName: string | null; updatedAt: string }
  | { connected: false };

// `creds` is optional everywhere: pass them on a fresh connect, omit them to
// reuse the saved (server-side) connection so the token never leaves the server.
const withCreds = (creds: JiraCreds | null | undefined) => (creds ? { ...creds } : {});

/** Parse one SSE block ("event: x\ndata: {…}") into { event, data }. */
function parseSseBlock(raw: string): { event: string; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith(':')) continue;             // comment / heartbeat
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

/**
 * Run an import over SSE. We use `fetch` (not axios) so we can read the response
 * body as a stream: the session cookie rides `credentials: 'include'`, and we
 * replay the `X-Org-Id` header the axios interceptor would normally add. Progress
 * events fire `onProgress`; resolves with the final result, rejects on error.
 */
async function importStream(
  body: Record<string, unknown>,
  onProgress: ImportProgressCallback,
): Promise<ImportResult> {
  const orgId = getActiveOrgId();
  const res = await fetch(`${urls.jira.import}?stream=1`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(orgId ? { 'X-Org-Id': orgId } : {}),
    },
    body: JSON.stringify(body),
  });

  // A validation error (bad org, not a member, …) is sent as JSON BEFORE the
  // stream starts — surface its message instead of trying to read a stream.
  if (!res.ok || !res.body) {
    let message = 'Import failed';
    try {
      const j = await res.json();
      message = j?.error ?? message;
    } catch { /* non-JSON body — keep the default */ }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let result: ImportResult | null = null;
  let errMessage: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const evt = parseSseBlock(block);
      if (!evt) continue;
      if (evt.event === 'progress') onProgress(evt.data as ImportProgressEvent);
      else if (evt.event === 'done') result = evt.data as ImportResult;
      else if (evt.event === 'error') errMessage = (evt.data as { message?: string })?.message ?? 'Import failed';
    }
  }

  if (errMessage) throw new Error(errMessage);
  if (!result) throw new Error('Import ended without a result');
  return result;
}

export const jiraApi = {
  async validate(creds?: JiraCreds): Promise<{ ok: boolean; displayName: string; saved?: boolean }> {
    const { data } = await httpClient.post(urls.jira.validate, withCreds(creds));
    return data;
  },

  async listProjects(creds?: JiraCreds): Promise<JiraProject[]> {
    const { data } = await httpClient.post(urls.jira.projects, withCreds(creds));
    return data;
  },

  async preview(creds: JiraCreds | null, jiraProjectKey: string): Promise<ImportPreview> {
    const { data } = await httpClient.post(urls.jira.preview, { ...withCreds(creds), jiraProjectKey });
    return data;
  },

  async importTickets(
    creds: JiraCreds | null,
    jiraProjectKey: string,
    targetProjectId: string,
  ): Promise<ImportResult> {
    const { data } = await httpClient.post(urls.jira.import, {
      ...withCreds(creds),
      jiraProjectKey,
      targetProjectId,
      mode: 'tickets',
    });
    return data;
  },

  async importFullProject(
    creds: JiraCreds | null,
    jiraProjectKey: string,
    jiraProjectName: string,
  ): Promise<ImportResult> {
    const { data } = await httpClient.post(urls.jira.import, {
      ...withCreds(creds),
      jiraProjectKey,
      jiraProjectName,
      mode: 'project',
    });
    return data;
  },

  /** Ticket import with live progress over SSE. */
  importTicketsStream(
    creds: JiraCreds | null,
    jiraProjectKey: string,
    targetProjectId: string,
    onProgress: ImportProgressCallback,
  ): Promise<ImportResult> {
    return importStream(
      { ...withCreds(creds), jiraProjectKey, targetProjectId, mode: 'tickets' },
      onProgress,
    );
  },

  /** Full-project import with live progress over SSE. */
  importFullProjectStream(
    creds: JiraCreds | null,
    jiraProjectKey: string,
    jiraProjectName: string,
    onProgress: ImportProgressCallback,
  ): Promise<ImportResult> {
    return importStream(
      { ...withCreds(creds), jiraProjectKey, jiraProjectName, mode: 'project' },
      onProgress,
    );
  },

  /** Fetch the caller's saved JIRA connection (masked, no token). */
  async getConnection(): Promise<SavedConnection> {
    const { data } = await httpClient.get(urls.jira.connection);
    return data;
  },

  /** Forget the saved connection — the "use a different account" path. */
  async deleteConnection(): Promise<void> {
    await httpClient.delete(urls.jira.connection);
  },
};
