// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import {
  notificationModel,
  type NotificationListFilters,
} from '../../models/notification/notification.js';
import { mailer } from '../mailer/mailer.js';
import { config, isMailerConfigured } from '../../config/index.js';
import logger from '../../utils/logger.js';
import type { NotificationType, NotificationChannel, ProjectNotificationEvent } from '@prisma/client';

// Canonical ordering for the preference grid. Rows of the profile-page grid
// are rendered in exactly this order.
export const NOTIFICATION_TYPES: NotificationType[] = [
  'story_assigned',
  'story_commented',
  'story_status_changed',
  'story_reporter_changed',
  'story_mentioned',
  'story_priority_changed',
  'story_updated',
  'weekly_digest',
];

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ['in_app', 'email'];

// Some types only make sense on a subset of channels. The weekly digest is a
// summary email — there is no in-app equivalent, so it offers only `email`.
const EMAIL_ONLY_TYPES = new Set<NotificationType>(['weekly_digest']);

/** Channels a given notification type can actually be delivered on. */
export function channelsFor(type: NotificationType): NotificationChannel[] {
  return EMAIL_ONLY_TYPES.has(type) ? ['email'] : NOTIFICATION_CHANNELS;
}

// Email is OPT-IN for watcher-fanout events (comments, status/priority moves,
// field edits) — they arrive in-app only until the user enables the email
// channel on the profile grid. Only events aimed at the user personally
// (assigned, made reporter, @-mentioned) and the weekly digest email default ON.
const EMAIL_DEFAULT_ON = new Set<NotificationType>([
  'story_assigned',
  'story_reporter_changed',
  'story_mentioned',
  'weekly_digest',
]);

/** Default for a cell with no stored preference row. In-app is always ON. */
export function defaultEnabled(type: NotificationType, channel: NotificationChannel): boolean {
  return channel === 'in_app' || EMAIL_DEFAULT_ON.has(type);
}

export interface PreferenceEntry {
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface WatchState {
  isWatching: boolean;
  watcherCount: number;
}

interface DispatchPayload {
  storyId: string;
  storyKey: string;
  storyTitle: string;
  actorId: string;
  actorName: string;
  type: NotificationType;
  /** In-app notification title — phrased third-person so every watcher reads cleanly. */
  title: string;
  /** Optional in-app body line. */
  body?: string;
  /** Human sentence for the email ("moved this story to In Review"). */
  emailHeadline: string;
  // ── Phase 14: project-scoped email layer ────────────────────────────────
  // When BOTH are set, the EMAIL channel becomes the UNION of the personal grid
  // and this project's per-user opt-in (project ON adds an email; it can never
  // suppress a personal ON), and every email send is deduped + logged under
  // this event. Absent → legacy behaviour, untouched (personal grid only, no
  // ledger). In-app is NEVER affected by these.
  projectId?: string;
  projectEvent?: ProjectNotificationEvent;
  /** Makes the dedupeKey unique per logical occurrence of the event — e.g. the
   *  destination status for a status change, so two different moves both send
   *  but the same move never sends twice. */
  dedupeToken?: string;
  /** When the event originates from a specific comment (comment / @-mention),
   *  the link anchors straight to it via `?comment=<id>` so the recipient lands
   *  on the exact comment, not just the story. */
  commentId?: string;
  /** Plain-text of the comment, shown as a quote in the email so the recipient
   *  reads what was said without opening the app. */
  commentExcerpt?: string;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  );
}

/**
 * Claim the "email this user for this event" slot by inserting the ledger row.
 * Returns true if WE claimed it (caller should send) or false if it was already
 * taken (a prior send for this exact event → skip, no double). The UNIQUE
 * dedupeKey makes the claim atomic even across concurrent dispatches. On an
 * UNEXPECTED db error we fail OPEN (return true): the product rule "never miss a
 * notification" outranks "never double" for surprises.
 */
async function claimEmailSlot(entry: {
  userId: string;
  projectId?: string | null;
  event: ProjectNotificationEvent;
  storyId?: string | null;
  sprintId?: string | null;
  dedupeKey: string;
}): Promise<boolean> {
  try {
    await prisma.emailDeliveryLog.create({
      data: {
        userId: entry.userId,
        projectId: entry.projectId ?? null,
        event: entry.event,
        storyId: entry.storyId ?? null,
        sprintId: entry.sprintId ?? null,
        dedupeKey: entry.dedupeKey,
      },
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    logger.error('notification: email ledger claim failed', err);
    return true;
  }
}

/** Release a claimed slot when the send itself failed, so the ledger never
 *  records an email that didn't actually go out — keeps the "no missed" audit
 *  honest and leaves the slot open for a future retry. Best-effort. */
async function releaseEmailSlot(dedupeKey: string): Promise<void> {
  await prisma.emailDeliveryLog
    .deleteMany({ where: { dedupeKey } })
    .catch((err) => logger.error('notification: email ledger release failed', err));
}

/**
 * The one place a story notification actually gets written/sent. Resolves every
 * recipient against their preference grid and writes the in-app row and/or
 * sends the email per channel. The actor is never notified of their own action.
 *
 * Phase 14: for a project-tracked event (payload carries projectId+projectEvent)
 * the EMAIL channel is the UNION of the personal grid and the project opt-in,
 * resolved HERE — the single place each recipient is touched exactly once — so a
 * watcher who is ALSO a project opt-in still receives exactly one email, and the
 * dedupe ledger guards against any cross-dispatch repeat. In-app is unchanged.
 */
async function deliver(recipientIds: Set<string>, p: DispatchPayload): Promise<void> {
  const tag = `[notif] ${p.type}${p.projectEvent ? `/${p.projectEvent}` : ''} ${p.storyKey}`;
  const hadActor = recipientIds.has(p.actorId);
  recipientIds.delete(p.actorId);
  if (recipientIds.size === 0) {
    logger.info(
      `${tag}: 0 recipients (actor ${p.actorId} ${hadActor ? 'excluded — nobody is emailed about their OWN action' : 'not in recipient set'}); nothing to send`,
    );
    return;
  }

  // Disabled users never receive anything.
  const users = await prisma.user.findMany({
    where: { id: { in: [...recipientIds] }, disabledAt: null },
    select: { id: true, name: true, email: true },
  });
  if (users.length === 0) {
    logger.info(`${tag}: all ${recipientIds.size} recipient(s) disabled or missing; nothing to send`);
    return;
  }

  // Phase 2: resolve the story's org once so every in-app row is stamped with
  // it. The bell uses this to filter per-org and to switch context before the
  // click deep-links into the ticket. Null (story gone) degrades to "all orgs".
  const story = await prisma.story.findUnique({
    where: { id: p.storyId },
    select: { projectId: true, project: { select: { organizationId: true } } },
  });
  const organizationId = story?.project?.organizationId ?? undefined;
  // The project the ticket lives in — used to build a full-page deep link.
  const linkProjectId = story?.projectId ?? undefined;

  // A stored row is an explicit user choice (either direction) and always
  // wins; a missing row falls back to the per-type/channel default — in-app
  // ON for everything, email ON only for personal events + weekly digest.
  const prefRows = await prisma.notificationPreference.findMany({
    where: { userId: { in: users.map((u) => u.id) }, type: p.type },
  });
  const stored = new Map(prefRows.map((r) => [`${r.userId}:${r.channel}`, r.enabled]));
  const wants = (userId: string, channel: NotificationChannel) =>
    stored.get(`${userId}:${channel}`) ?? defaultEnabled(p.type, channel);

  // Project opt-ins for this event (email only). Empty unless this is a
  // project-tracked event. This is the OTHER half of the union.
  let projectOptIn = (_userId: string) => false;
  if (p.projectId && p.projectEvent) {
    const optRows = await prisma.projectNotificationPreference.findMany({
      where: {
        projectId: p.projectId,
        event: p.projectEvent,
        emailEnabled: true,
        userId: { in: users.map((u) => u.id) },
      },
      select: { userId: true },
    });
    const optedIn = new Set(optRows.map((r) => r.userId));
    projectOptIn = (userId: string) => optedIn.has(userId);
    logger.info(
      `${tag}: ${users.length} recipient(s) (= watchers of this story); project email opt-ins among them: ${
        optedIn.size ? [...optedIn].join(', ') : 'none — note a project opt-in only emails people who WATCH the story'
      }`,
    );
    if (!isMailerConfigured()) {
      logger.warn(`${tag}: SMTP is NOT configured (SMTP_HOST is empty) — the mailer will skip every send`);
    }
  }

  // Deep-link to the full-page ticket — the SAME destination the in-app bell
  // prefers — so the link lands on a REAL route. The old `/?story=KEY` bounced
  // through `/` → RoleLanding, whose <Navigate to="/dashboard"> DROPS the query
  // string, stranding the recipient on the dashboard. No project (story deleted)
  // falls back to the global drawer on /dashboard, which DOES keep ?story. A
  // commentId, when present, anchors the exact comment.
  const storyBase = linkProjectId
    ? `${config.clientUrl}/projects/${linkProjectId}/stories/${encodeURIComponent(p.storyKey)}`
    : `${config.clientUrl}/dashboard?story=${encodeURIComponent(p.storyKey)}`;
  const storyUrl = p.commentId
    ? `${storyBase}${storyBase.includes('?') ? '&' : '?'}comment=${encodeURIComponent(p.commentId)}`
    : storyBase;

  for (const u of users) {
    if (wants(u.id, 'in_app')) {
      await notificationModel
        .create({
          userId: u.id,
          organizationId,
          type: p.type,
          title: p.title,
          body: p.body,
          storyId: p.storyId,
          storyKey: p.storyKey,
        })
        .catch((err) => logger.error('notification: in-app write failed', err));
    }

    // Email = personal grid OR project opt-in (union — project ON only ADDS).
    const personalEmail = wants(u.id, 'email');
    const projOpt = projectOptIn(u.id);
    const wantsEmail = personalEmail || projOpt;
    logger.info(
      `${tag}: user=${u.id} addr=${u.email ?? 'NONE'} personalEmail=${personalEmail} projectOptIn=${projOpt} → ${
        wantsEmail ? (u.email ? 'will send' : 'wants email but has NO ADDRESS') : 'skip'
      }`,
    );
    if (!wantsEmail || !u.email) continue;

    const mailOpts = {
      to: u.email,
      recipientName: u.name ?? 'there',
      actorName: p.actorName,
      storyKey: p.storyKey,
      storyTitle: p.storyTitle,
      storyUrl,
      headline: p.emailHeadline,
      commentExcerpt: p.commentExcerpt,
    };

    // Legacy (non-project) emails keep their original fire-and-forget path —
    // no ledger. Only project-tracked events are deduped + recorded.
    if (!p.projectId || !p.projectEvent) {
      const res = await mailer.sendStoryUpdate(mailOpts).catch((err) => {
        logger.error('notification: email send failed', err);
        return { sent: false as const, reason: 'exception' };
      });
      logger.info(
        `${tag}: legacy email to ${u.email} → ${res.sent ? 'SENT' : `NOT sent (${res.reason ?? 'unknown'})`}`,
      );
      continue;
    }

    const dedupeKey = `${p.projectEvent}:${p.storyId}:${p.dedupeToken ?? ''}:${u.id}`;
    const claimed = await claimEmailSlot({
      userId: u.id,
      projectId: p.projectId,
      event: p.projectEvent,
      storyId: p.storyId,
      dedupeKey,
    });
    if (!claimed) {
      logger.info(`${tag}: dedupe — already emailed ${u.email} for this event (key=${dedupeKey}); skipping`);
      continue; // already emailed for this exact event → no double
    }
    const res = await mailer.sendStoryUpdate(mailOpts).catch((err) => {
      logger.error('notification: email send failed', err);
      return { sent: false as const, reason: 'exception' };
    });
    if (!res.sent) {
      logger.warn(`${tag}: email to ${u.email} NOT sent (${res.reason ?? 'unknown'}) — releasing ledger slot`);
      await releaseEmailSlot(dedupeKey);
    } else {
      logger.info(`${tag}: email SENT to ${u.email} (key=${dedupeKey})`);
    }
  }
}

/** Build the full type×channel grid, filling unstored cells with the default
 *  (in-app ON everywhere; email ON only for personal events + weekly digest). */
async function buildGrid(userId: string): Promise<PreferenceEntry[]> {
  const rows = await prisma.notificationPreference.findMany({ where: { userId } });
  const stored = new Map(rows.map((r) => [`${r.type}:${r.channel}`, r.enabled]));
  const grid: PreferenceEntry[] = [];
  for (const type of NOTIFICATION_TYPES) {
    for (const channel of channelsFor(type)) {
      grid.push({
        type,
        channel,
        enabled: stored.get(`${type}:${channel}`) ?? defaultEnabled(type, channel),
      });
    }
  }
  return grid;
}

export const notificationService = {
  // ---- reads ----
  listByUser: (userId: string, filters?: NotificationListFilters) =>
    notificationModel.listByUser(userId, filters),
  countUnread: (userId: string) => notificationModel.countUnread(userId),
  markRead: (id: string, userId: string) => notificationModel.markRead(id, userId),
  markAllRead: (userId: string) => notificationModel.markAllRead(userId),

  // ---- dispatch ----
  /**
   * Fan a story event out to every watcher (∪ extraRecipientIds), minus
   * excludeUserIds and the actor. Each recipient is then trimmed per channel
   * by their preference grid inside `deliver`.
   */
  async dispatch(
    payload: DispatchPayload & { extraRecipientIds?: string[]; excludeUserIds?: string[] },
  ): Promise<void> {
    const watchers = await prisma.storyWatcher.findMany({
      where: { storyId: payload.storyId },
      select: { userId: true },
    });
    const ids = new Set<string>([
      ...watchers.map((w) => w.userId),
      ...(payload.extraRecipientIds ?? []),
    ]);
    for (const id of payload.excludeUserIds ?? []) ids.delete(id);
    logger.info(
      `[notif] dispatch ${payload.type}${payload.projectEvent ? `/${payload.projectEvent}` : ''} ${payload.storyKey}: ${watchers.length} watcher(s)${
        watchers.length === 0 ? ' — status/completion emails only go to watchers, so this story will email no one' : ''
      }`,
    );
    await deliver(ids, payload);
  },

  /** Targeted delivery to an exact recipient set — used for @-mentions, which
   * must NOT fan out to all watchers. */
  async dispatchToUsers(recipientIds: string[], payload: DispatchPayload): Promise<void> {
    await deliver(new Set(recipientIds), payload);
  },

  /**
   * Phase 14: sprint-completion email. A sprint has no watchers, so recipients
   * are exactly the project's CURRENT members who opted into `sprint_completed`
   * (email-only event — no personal-grid fallback exists for it). Same dedupe
   * ledger discipline as the story path: claim → send → release-on-failure, so
   * each member is emailed at most once per sprint completion.
   */
  async dispatchSprintCompleted(payload: {
    projectId: string;
    sprintId: string;
    sprintName: string;
    actorId: string;
    actorName: string;
  }): Promise<void> {
    const optRows = await prisma.projectNotificationPreference.findMany({
      where: { projectId: payload.projectId, event: 'sprint_completed', emailEnabled: true },
      select: { userId: true },
    });
    const tag = `[notif:sprint] ${payload.sprintName} (${payload.sprintId})`;
    const hadActor = optRows.some((r) => r.userId === payload.actorId);
    const optedIds = new Set(optRows.map((r) => r.userId));
    optedIds.delete(payload.actorId);
    logger.info(
      `${tag}: ${optRows.length} opt-in row(s); ${optedIds.size} after excluding the actor ${payload.actorId}${
        hadActor ? ' (the person completing the sprint is never emailed about it)' : ''
      }`,
    );
    if (!isMailerConfigured()) {
      logger.warn(`${tag}: SMTP is NOT configured (SMTP_HOST is empty) — the mailer will skip every send`);
    }
    if (optedIds.size === 0) return;

    // Intersect with current membership — a lingering pref from someone who
    // left the project must not keep emailing them.
    const members = await prisma.projectMember.findMany({
      where: { projectId: payload.projectId, userId: { in: [...optedIds] } },
      select: { userId: true },
    });
    const memberIds = members.map((m) => m.userId);
    if (memberIds.length === 0) {
      logger.info(`${tag}: none of the opt-ins are current project members; nothing to send`);
      return;
    }

    const users = await prisma.user.findMany({
      where: { id: { in: memberIds }, disabledAt: null },
      select: { id: true, name: true, email: true },
    });
    logger.info(`${tag}: emailing ${users.length} member(s)`);

    const boardUrl = `${config.clientUrl}/projects/${payload.projectId}/board`;
    for (const u of users) {
      if (!u.email) continue;
      const dedupeKey = `sprint_completed:${payload.sprintId}:${u.id}`;
      const claimed = await claimEmailSlot({
        userId: u.id,
        projectId: payload.projectId,
        event: 'sprint_completed',
        sprintId: payload.sprintId,
        dedupeKey,
      });
      if (!claimed) {
        logger.info(`${tag}: dedupe — already emailed ${u.email}; skipping`);
        continue;
      }
      const res = await mailer
        .sendSprintCompleted({
          to: u.email,
          recipientName: u.name ?? 'there',
          actorName: payload.actorName,
          sprintName: payload.sprintName,
          boardUrl,
        })
        .catch((err) => {
          logger.error('notification: sprint email send failed', err);
          return { sent: false as const, reason: 'exception' };
        });
      if (!res.sent) {
        logger.warn(`${tag}: email to ${u.email} NOT sent (${res.reason ?? 'unknown'}) — releasing slot`);
        await releaseEmailSlot(dedupeKey);
      } else {
        logger.info(`${tag}: email SENT to ${u.email}`);
      }
    }
  },

  // ---- watchers ----
  /** Idempotent — used by auto-watch on create / assign / reporter change. */
  async ensureWatcher(storyId: string, userId: string): Promise<void> {
    await prisma.storyWatcher.upsert({
      where: { storyId_userId: { storyId, userId } },
      update: {},
      create: { storyId, userId },
    });
  },

  async watch(storyId: string, userId: string): Promise<WatchState> {
    await notificationService.ensureWatcher(storyId, userId);
    return notificationService.getWatchState(storyId, userId);
  },

  async unwatch(storyId: string, userId: string): Promise<WatchState> {
    await prisma.storyWatcher.deleteMany({ where: { storyId, userId } });
    return notificationService.getWatchState(storyId, userId);
  },

  async getWatchState(storyId: string, userId: string): Promise<WatchState> {
    const [watcherCount, mine] = await Promise.all([
      prisma.storyWatcher.count({ where: { storyId } }),
      prisma.storyWatcher.findUnique({
        where: { storyId_userId: { storyId, userId } },
        select: { id: true },
      }),
    ]);
    return { watcherCount, isWatching: !!mine };
  },

  /** The watchers of a story, oldest-first — so reporter/assignee lead the list. */
  async listWatchers(storyId: string) {
    const rows = await prisma.storyWatcher.findMany({
      where: { storyId },
      select: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => r.user);
  },

  // ---- preferences ----
  getPreferences: (userId: string) => buildGrid(userId),

  /** Upsert the entries the user toggled. Returns the freshly-built grid. */
  async setPreferences(userId: string, entries: PreferenceEntry[]): Promise<PreferenceEntry[]> {
    if (entries.length > 0) {
      await prisma.$transaction(
        entries.map((e) =>
          prisma.notificationPreference.upsert({
            where: { userId_type_channel: { userId, type: e.type, channel: e.channel } },
            update: { enabled: e.enabled },
            create: { userId, type: e.type, channel: e.channel, enabled: e.enabled },
          }),
        ),
      );
    }
    return buildGrid(userId);
  },
};
