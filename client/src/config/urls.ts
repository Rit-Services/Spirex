// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

// Requests go to the SAME origin the app is served from, so the browser never
// crosses an origin boundary (cookies ride along, no CORS):
//   • dev  → '' (relative). The Vite dev server proxies /api to the backend
//            (see vite.config.ts); point dev elsewhere via VITE_API_PROXY_TARGET.
//            Forced relative here so a stale absolute VITE_API_URL in .env can't
//            reintroduce the split-origin setup the proxy exists to remove.
//   • prod → VITE_API_URL if set, else '' (app + API already share an origin).
export const API_BASE = import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL || '';

export const urls = {
  health: `${API_BASE}/api/health`,
  search: `${API_BASE}/api/search`,
  auth: {
    login: `${API_BASE}/api/auth/login`,
    logout: `${API_BASE}/api/auth/logout`,
    me: `${API_BASE}/api/auth/me`,
    changePassword: `${API_BASE}/api/auth/change-password`,
    invite: (token: string) => `${API_BASE}/api/auth/invite/${encodeURIComponent(token)}`,
    acceptInvite: (token: string) => `${API_BASE}/api/auth/invite/${encodeURIComponent(token)}/accept`,
    sso: {
      providers: `${API_BASE}/api/auth/sso/providers`,
      identities: `${API_BASE}/api/auth/sso/identities`,
      identity: (provider: string) => `${API_BASE}/api/auth/sso/identities/${encodeURIComponent(provider)}`,
      // Full-page navigation target (NOT an XHR) — kicks off the OIDC redirect.
      // `intent` declares login-vs-link server-side: the login page omits it
      // ('login' — authenticate only, never link to an ambient session), the
      // profile "Connect" button passes 'link'.
      start: (provider: string, intent?: 'login' | 'link') =>
        `${API_BASE}/api/auth/sso/${provider}${intent === 'link' ? '?intent=link' : ''}`,
    },
  },
  users: {
    list: `${API_BASE}/api/users`,
    directory: `${API_BASE}/api/users/directory`,
    create: `${API_BASE}/api/users`,
    invite: `${API_BASE}/api/users/invite`,
    pendingInvites: `${API_BASE}/api/users/pending-invites`,
    resendInvite: (id: string) => `${API_BASE}/api/users/pending-invites/${id}/resend`,
    lookup: (email: string) => `${API_BASE}/api/users/lookup?email=${encodeURIComponent(email)}`,
    detail: (id: string) => `${API_BASE}/api/users/${id}`,
    update: (id: string) => `${API_BASE}/api/users/${id}`,
    disable: (id: string) => `${API_BASE}/api/users/${id}/disable`,
    enable: (id: string) => `${API_BASE}/api/users/${id}/enable`,
    resetPassword: (id: string) => `${API_BASE}/api/users/${id}/reset-password`,
    globalRole: (id: string) => `${API_BASE}/api/users/${id}/global-role`,
  },
  invites: {
    mine: `${API_BASE}/api/invites`,
    accept: (id: string) => `${API_BASE}/api/invites/${id}/accept`,
    decline: (id: string) => `${API_BASE}/api/invites/${id}/decline`,
  },
  projects: {
    list: `${API_BASE}/api/projects`,
    create: `${API_BASE}/api/projects`,
    detail: (id: string) => `${API_BASE}/api/projects/${id}`,
    update: (id: string) => `${API_BASE}/api/projects/${id}`,
    remove: (id: string) => `${API_BASE}/api/projects/${id}`,
    members: (id: string) => `${API_BASE}/api/projects/${id}/members`,
    member: (id: string, userId: string) => `${API_BASE}/api/projects/${id}/members/${userId}`,
    unlinkedUsers: (id: string) => `${API_BASE}/api/projects/${id}/unlinked-users`,
    linkUnlinkedUser: (id: string, ghostId: string) =>
      `${API_BASE}/api/projects/${id}/unlinked-users/${ghostId}/link`,
  },
  epics: {
    list: `${API_BASE}/api/epics`,
    create: `${API_BASE}/api/epics`,
    detail: (id: string) => `${API_BASE}/api/epics/${id}`,
  },
  stories: {
    list: `${API_BASE}/api/stories`,
    assignedToMe: `${API_BASE}/api/stories/assigned-to-me`,
    create: `${API_BASE}/api/stories`,
    detail: (id: string) => `${API_BASE}/api/stories/${id}`,
    byKey: (key: string) => `${API_BASE}/api/stories/by-key/${encodeURIComponent(key)}`,
    status: (id: string) => `${API_BASE}/api/stories/${id}/status`,
    statusRow: (id: string) => `${API_BASE}/api/stories/${id}/status-row`,
    sprint: (id: string) => `${API_BASE}/api/stories/${id}/sprint`,
    rank: (id: string) => `${API_BASE}/api/stories/${id}/rank`,
    activity: (id: string) => `${API_BASE}/api/stories/${id}/activity`,
    links: (id: string) => `${API_BASE}/api/stories/${id}/links`,
    link: (id: string, linkId: string) => `${API_BASE}/api/stories/${id}/links/${linkId}`,
    reiterate: (id: string) => `${API_BASE}/api/stories/${id}/reiterate`,
    watch: (id: string) => `${API_BASE}/api/stories/${id}/watch`,
    watchers: (id: string) => `${API_BASE}/api/stories/${id}/watchers`,
    labels: (id: string) => `${API_BASE}/api/stories/${id}/labels`,
    label: (id: string, labelId: string) => `${API_BASE}/api/stories/${id}/labels/${labelId}`,
    aiEnhance: (id: string) => `${API_BASE}/api/stories/${id}/ai/enhance`,
    aiAcceptanceCriteria: (id: string) => `${API_BASE}/api/stories/${id}/ai/acceptance-criteria`,
  },
  sprints: {
    list: `${API_BASE}/api/sprints`,
    create: `${API_BASE}/api/sprints`,
    detail: (id: string) => `${API_BASE}/api/sprints/${id}`,
    start: (id: string) => `${API_BASE}/api/sprints/${id}/start`,
    complete: (id: string) => `${API_BASE}/api/sprints/${id}/complete`,
    burndown: (id: string) => `${API_BASE}/api/sprints/${id}/burndown`,
  },
  worklogs: {
    byStory: (storyId: string) => `${API_BASE}/api/worklogs/by-story/${storyId}`,
    create: `${API_BASE}/api/worklogs`,
    detail: (id: string) => `${API_BASE}/api/worklogs/${id}`,
  },
  comments: {
    byStory: (storyId: string) => `${API_BASE}/api/comments/by-story/${storyId}`,
    create: `${API_BASE}/api/comments`,
    detail: (id: string) => `${API_BASE}/api/comments/${id}`,
  },
  reports: {
    overview: `${API_BASE}/api/reports/overview`,
    burndown: (sprintId: string) => `${API_BASE}/api/reports/burndown?sprintId=${sprintId}`,
    velocity: (projectId: string, last = 5) =>
      `${API_BASE}/api/reports/velocity?projectId=${projectId}&last=${last}`,
    timePerUser: `${API_BASE}/api/reports/time-per-user`,
    timeTracking: `${API_BASE}/api/reports/time-tracking`,
    statusBreakdown: `${API_BASE}/api/reports/status-breakdown`,
    typeBreakdown: `${API_BASE}/api/reports/type-breakdown`,
    estimateVsLogged: `${API_BASE}/api/reports/estimate-vs-logged`,
    worklogExplorer: `${API_BASE}/api/reports/worklog-explorer`,
  },
  attachments: {
    byStory: (storyId: string) => `${API_BASE}/api/attachments/by-story/${storyId}`,
    create: `${API_BASE}/api/attachments`,
    file: (id: string) => `${API_BASE}/api/attachments/${id}/file`,
    detail: (id: string) => `${API_BASE}/api/attachments/${id}`,
  },
  imports: {
    create: `${API_BASE}/api/imports`,
    list: `${API_BASE}/api/imports`,
    detail: (id: string) => `${API_BASE}/api/imports/${id}`,
    commit: (id: string) => `${API_BASE}/api/imports/${id}/commit`,
    discard: (id: string) => `${API_BASE}/api/imports/${id}`,
  },
  imageImports: {
    create: `${API_BASE}/api/image-imports`,
    list: `${API_BASE}/api/image-imports`,
    detail: (id: string) => `${API_BASE}/api/image-imports/${id}`,
    annotations: (id: string) => `${API_BASE}/api/image-imports/${id}/annotations`,
    draft: (id: string) => `${API_BASE}/api/image-imports/${id}/draft`,
    generate: (id: string) => `${API_BASE}/api/image-imports/${id}/generate`,
    commit: (id: string) => `${API_BASE}/api/image-imports/${id}/commit`,
    discard: (id: string) => `${API_BASE}/api/image-imports/${id}`,
  },
  notifications: {
    list: `${API_BASE}/api/notifications`,
    unreadCount: `${API_BASE}/api/notifications/unread-count`,
    markRead: (id: string) => `${API_BASE}/api/notifications/${id}/read`,
    markAllRead: `${API_BASE}/api/notifications/read-all`,
    preferences: `${API_BASE}/api/notifications/preferences`,
  },
  jira: {
    validate: `${API_BASE}/api/jira/validate`,
    projects: `${API_BASE}/api/jira/projects`,
    preview: `${API_BASE}/api/jira/preview`,
    import: `${API_BASE}/api/jira/import`,
    connection: `${API_BASE}/api/jira/connection`,
  },
  apiKeys: {
    list: `${API_BASE}/api/api-keys`,
    create: `${API_BASE}/api/api-keys`,
    revoke: (id: string) => `${API_BASE}/api/api-keys/${id}`,
  },
  superadmin: {
    search: `${API_BASE}/api/superadmin/search`,
    organizations: `${API_BASE}/api/superadmin/organizations`,
    organization: (id: string) => `${API_BASE}/api/superadmin/organizations/${id}`,
    suspend: (id: string) => `${API_BASE}/api/superadmin/organizations/${id}/suspend`,
    reactivate: (id: string) => `${API_BASE}/api/superadmin/organizations/${id}/reactivate`,
    members: (id: string) => `${API_BASE}/api/superadmin/organizations/${id}/members`,
    member: (id: string, userId: string) =>
      `${API_BASE}/api/superadmin/organizations/${id}/members/${userId}`,
    memberLookup: (id: string, email: string) =>
      `${API_BASE}/api/superadmin/organizations/${id}/members/lookup?email=${encodeURIComponent(email)}`,
    invites: (id: string) => `${API_BASE}/api/superadmin/organizations/${id}/invites`,
    orgLogo: (id: string) => `${API_BASE}/api/superadmin/organizations/${id}/logo`,
    admins: `${API_BASE}/api/superadmin/admins`,
    admin: (id: string) => `${API_BASE}/api/superadmin/admins/${id}`,
  },
  org: {
    current: `${API_BASE}/api/org`,
    update: `${API_BASE}/api/org`,
    logo: `${API_BASE}/api/org/logo`,
    logoFor: (id: string) => `${API_BASE}/api/org/logo/${id}`,
  },
  customFields: {
    byProject: (projectId: string) => `${API_BASE}/api/projects/${projectId}/custom-fields`,
    detail: (id: string) => `${API_BASE}/api/custom-fields/${id}`,
  },
  projectNotifications: {
    byProject: (projectId: string) =>
      `${API_BASE}/api/projects/${projectId}/notification-preferences`,
    setForUser: (projectId: string, userId: string) =>
      `${API_BASE}/api/projects/${projectId}/notification-preferences/${userId}`,
  },
  labels: {
    byProject: (projectId: string) => `${API_BASE}/api/projects/${projectId}/labels`,
    create: (projectId: string) => `${API_BASE}/api/projects/${projectId}/labels`,
    update: (id: string) => `${API_BASE}/api/labels/${id}`,
    remove: (id: string) => `${API_BASE}/api/labels/${id}`,
  },
  workflow: {
    byProject: (projectId: string) => `${API_BASE}/api/projects/${projectId}/workflow`,
    bulkUpdate: (projectId: string) => `${API_BASE}/api/projects/${projectId}/workflow`,
    reset: (projectId: string) => `${API_BASE}/api/projects/${projectId}/workflow/reset`,
    createColumn: (projectId: string) => `${API_BASE}/api/projects/${projectId}/workflow/columns`,
    patch: (id: string) => `${API_BASE}/api/workflow-statuses/${id}`,
    remove: (id: string) => `${API_BASE}/api/workflow-statuses/${id}`,
  },
} as const;
