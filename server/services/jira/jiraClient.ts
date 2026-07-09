// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import https from 'node:https';
import http from 'node:http';

export interface JiraCredentials {
  domain: string;   // e.g. "myteam.atlassian.net"
  email: string;
  apiToken: string;
}

function basicAuth(email: string, token: string) {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

async function jiraFetch<T>(
  creds: JiraCredentials,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const url = `https://${creds.domain}${path}`;
  const headers: Record<string, string> = {
    Authorization: basicAuth(creds.email, creds.apiToken),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : undefined;
    if (body) headers['Content-Length'] = Buffer.byteLength(body).toString();

    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.request(
      {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method ?? 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (!res.statusCode || res.statusCode >= 400) {
            let message = `JIRA API error ${res.statusCode}`;
            try {
              const json = JSON.parse(text);
              message = json.message ?? json.errorMessages?.[0] ?? message;
            } catch { /* ignore */ }
            return reject(new Error(message));
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch {
            reject(new Error('JIRA returned non-JSON response'));
          }
        });
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Download a binary resource (an attachment's content) as a Buffer. Unlike
 * `jiraFetch` this never parses JSON and it FOLLOWS REDIRECTS — JIRA's
 * `/attachment/content/{id}` URL answers with a 302 to a signed media host
 * (media.atlassian.com / S3). The Basic-auth header is dropped the moment the
 * host changes, because the redirect target is pre-signed and rejects (or is
 * confused by) a second set of credentials.
 */
function fetchBinary(
  url: string,
  headers: Record<string, string>,
  redirectCount: number,
): Promise<Buffer> {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers,
      },
      (res) => {
        const status = res.statusCode ?? 0;

        // Follow redirects; shed auth on a cross-host hop (signed media URL).
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume(); // drain so the socket can be reused
          const next = new URL(res.headers.location, url);
          const nextHeaders = { ...headers };
          if (next.hostname !== parsed.hostname) delete nextHeaders.Authorization;
          resolve(fetchBinary(next.toString(), nextHeaders, redirectCount + 1));
          return;
        }

        if (status >= 400) {
          res.resume();
          return reject(new Error(`Attachment download failed (HTTP ${status})`));
        }

        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.end();
  });
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface JiraMyself {
  accountId: string;
  emailAddress: string;
  displayName: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;
  location?: { projectId?: number; projectKey?: string };
}

/** A single column on a JIRA board, with the status ids it contains. */
export interface JiraBoardColumn {
  name: string;
  statuses: Array<{ id: string }>;
}

export interface JiraBoardConfiguration {
  id: number;
  name: string;
  columnConfig?: { columns: JiraBoardColumn[] };
}

/** Flattened status metadata for a project — id, display name and category. */
export interface JiraProjectStatusInfo {
  id: string;
  name: string;
  statusCategory: { key: string };
}

/** A JIRA user as returned by the user-search endpoints. `emailAddress` is often
 *  absent on JIRA Cloud — it's only exposed when the user's profile visibility
 *  (or the caller's permissions) allow it. */
export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  active?: boolean;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  goal?: string;
  startDate?: string;
  endDate?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: unknown;   // ADF or null
    issuetype: { name: string };
    status: { name: string; statusCategory: { key: string } };
    priority: { name: string } | null;
    assignee: { accountId?: string; emailAddress?: string; displayName: string } | null;
    reporter: { accountId?: string; emailAddress?: string; displayName: string } | null;
    story_points?: number | null;
    customfield_10016?: number | null;   // SP — most common field
    customfield_10028?: number | null;   // Story points (next-gen)
    parent?: { key: string; fields: { issuetype: { name: string } } };
    epic?: { key: string; summary: string; color?: { key: string } } | null;
    // Jira Epic Link (classic boards)
    customfield_10014?: string | null;
    // Sprint custom field — array of sprints the issue has been in (closed + active + future).
    // Field id varies by JIRA instance; most common is customfield_10020 (next-gen) or 10010 (classic).
    customfield_10020?: Array<{
      id: number;
      name: string;
      state: 'active' | 'closed' | 'future';
      startDate?: string;
      endDate?: string;
      completeDate?: string;
    }> | null;
    customfield_10010?: Array<{
      id: number;
      name: string;
      state: 'active' | 'closed' | 'future';
      startDate?: string;
      endDate?: string;
      completeDate?: string;
    }> | null;
    subtasks?: Array<{ key: string; fields: { summary: string; issuetype: { name: string } } }>;
    // Files attached to the issue. Only present when 'attachment' is requested in
    // the search `fields`. `content` is the authenticated download URL (redirects
    // to a signed media host). Inline images embedded in the description are ALSO
    // listed here — their `id` matches the ADF `media` node's `attrs.id`.
    attachment?: JiraAttachment[];
    // Comments on the issue. Only present when 'comment' is requested. The search
    // endpoint returns a PAGE of comments (see `total` vs `comments.length`); the
    // remainder is fetched with getIssueComments when truncated.
    comment?: {
      comments: JiraComment[];
      total?: number;
      maxResults?: number;
      startAt?: number;
    };
    created: string;
    updated: string;
  };
}

/** A file attached to a JIRA issue (or referenced inline by a media node). */
export interface JiraAttachment {
  id: string;
  filename: string;
  mimeType: string;
  /** Authenticated download URL — 302-redirects to a signed media host. */
  content: string;
  size: number;
  created?: string;
  author?: { accountId?: string; emailAddress?: string; displayName: string } | null;
}

/** A comment on a JIRA issue. `body` is ADF (or a plain string on older data). */
export interface JiraComment {
  id: string;
  body?: unknown;
  created?: string;
  updated?: string;
  author?: { accountId?: string; emailAddress?: string; displayName: string } | null;
}

// ── Client methods ───────────────────────────────────────────────────────────

export const jiraClient = {
  async validateCredentials(creds: JiraCredentials): Promise<JiraMyself> {
    return jiraFetch<JiraMyself>(creds, '/rest/api/3/myself');
  },

  async listProjects(creds: JiraCredentials): Promise<JiraProject[]> {
    const results: JiraProject[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const page = await jiraFetch<{
        values: JiraProject[];
        isLast: boolean;
        total: number;
      }>(creds, `/rest/api/3/project/search?maxResults=${maxResults}&startAt=${startAt}&expand=description`);

      results.push(...page.values);
      if (page.isLast || results.length >= page.total) break;
      startAt += maxResults;
    }

    return results;
  },

  async listBoards(creds: JiraCredentials, projectKey: string): Promise<JiraBoard[]> {
    const data = await jiraFetch<{ values: JiraBoard[] }>(
      creds,
      `/rest/agile/1.0/board?projectKeyOrId=${projectKey}&maxResults=50`,
    );
    return data.values ?? [];
  },

  /**
   * Fetch a board's column layout — the ordered columns (To Do / In Progress /
   * Done / custom) and which JIRA status ids map into each. This is the source
   * of truth for recreating the project's workflow in RitJira.
   */
  async getBoardConfiguration(creds: JiraCredentials, boardId: number): Promise<JiraBoardConfiguration> {
    return jiraFetch<JiraBoardConfiguration>(creds, `/rest/agile/1.0/board/${boardId}/configuration`);
  },

  /**
   * List every status defined for a project (across all issue types), flattened
   * and de-duplicated by status id. Used to resolve the status ids referenced by
   * a board's column config into names + categories.
   */
  async listProjectStatuses(creds: JiraCredentials, projectKey: string): Promise<JiraProjectStatusInfo[]> {
    const groups = await jiraFetch<Array<{ statuses?: JiraProjectStatusInfo[] }>>(
      creds,
      `/rest/api/3/project/${projectKey}/statuses`,
    );
    const byId = new Map<string, JiraProjectStatusInfo>();
    for (const group of groups) {
      for (const status of group.statuses ?? []) {
        if (!byId.has(status.id)) byId.set(status.id, status);
      }
    }
    return [...byId.values()];
  },

  /**
   * List users assignable to issues in a project — the fuller team roster, not
   * just people who happen to be on an issue. Emails may still be absent due to
   * JIRA Cloud privacy settings.
   */
  async listAssignableUsers(creds: JiraCredentials, projectKey: string): Promise<JiraUser[]> {
    return jiraFetch<JiraUser[]>(
      creds,
      `/rest/api/3/user/assignable/search?project=${encodeURIComponent(projectKey)}&maxResults=200`,
    ).catch(() => []);
  },

  async listSprints(creds: JiraCredentials, boardId: number): Promise<JiraSprint[]> {
    const results: JiraSprint[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const page = await jiraFetch<{
        values: JiraSprint[];
        isLast: boolean;
        total: number;
      }>(creds, `/rest/agile/1.0/board/${boardId}/sprint?maxResults=${maxResults}&startAt=${startAt}`);

      results.push(...page.values);
      if (page.isLast || results.length >= page.total) break;
      startAt += maxResults;
    }

    return results;
  },

  async searchIssues(
    creds: JiraCredentials,
    jql: string,
    fields: string[],
  ): Promise<JiraIssue[]> {
    const results: JiraIssue[] = [];
    const maxResults = 100;
    let nextPageToken: string | undefined;

    while (true) {
      const body: Record<string, unknown> = { jql, fields, maxResults };
      if (nextPageToken) body.nextPageToken = nextPageToken;

      const page = await jiraFetch<{
        issues: JiraIssue[];
        nextPageToken?: string;
        isLast?: boolean;
      }>(creds, '/rest/api/3/search/jql', {
        method: 'POST',
        body,
      });

      results.push(...(page.issues ?? []));
      if (page.isLast || !page.nextPageToken) break;
      nextPageToken = page.nextPageToken;
    }

    return results;
  },

  /**
   * Fetch ALL comments for an issue, following pagination. Used when the search
   * endpoint truncated the inline `comment` field (issue has more comments than
   * one page), so no comment is ever lost on busy issues.
   */
  async getIssueComments(creds: JiraCredentials, issueKey: string): Promise<JiraComment[]> {
    const all: JiraComment[] = [];
    let startAt = 0;
    const maxResults = 100;

    while (true) {
      const page = await jiraFetch<{
        comments: JiraComment[];
        total: number;
        startAt: number;
        maxResults: number;
      }>(creds, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?startAt=${startAt}&maxResults=${maxResults}`);

      all.push(...(page.comments ?? []));
      const fetched = page.comments?.length ?? 0;
      if (fetched === 0 || all.length >= (page.total ?? all.length)) break;
      startAt += maxResults;
    }

    return all;
  },

  /**
   * Download an attachment's bytes. Pass the attachment's `content` URL; auth is
   * applied for the JIRA hop and shed automatically when it redirects to the
   * signed media host. Returns the full file in memory.
   */
  async downloadAttachment(creds: JiraCredentials, contentUrl: string): Promise<Buffer> {
    return fetchBinary(
      contentUrl,
      {
        Authorization: basicAuth(creds.email, creds.apiToken),
        Accept: '*/*',
      },
      0,
    );
  },
};
