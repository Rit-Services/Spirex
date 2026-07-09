// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';

export const reportService = {
  /**
   * Project overview insights for the dashboard, computed from ONE story fetch:
   *   - workload:     open vs done issue counts per assignee (team distribution)
   *   - epicProgress: total vs completed stories per epic
   *   - priority:     issue counts per priority
   * All counts are issue COUNTS (not points), scoped to the whole project.
   */
  async overview(projectId: string) {
    const [stories, epics] = await Promise.all([
      prisma.story.findMany({
        where: { projectId },
        select: {
          status: true,
          priority: true,
          assigneeId: true,
          epicId: true,
          assignee: { select: { id: true, name: true } },
        },
      }),
      prisma.epic.findMany({
        where: { projectId },
        select: { id: true, key: true, title: true, color: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Workload — issues per assignee, split done vs remaining. Unassigned
    // stories collapse into one bucket so the gap is visible, not hidden.
    const workMap = new Map<string, { userId: string; name: string; total: number; done: number }>();
    for (const s of stories) {
      const key = s.assigneeId ?? 'unassigned';
      let b = workMap.get(key);
      if (!b) {
        b = { userId: key, name: s.assignee?.name ?? 'Unassigned', total: 0, done: 0 };
        workMap.set(key, b);
      }
      b.total += 1;
      if (s.status === 'done') b.done += 1;
    }
    const workload = [...workMap.values()]
      .map((b) => ({ ...b, remaining: b.total - b.done }))
      .sort((a, b) => b.total - a.total);

    // Epic progress — stories vs completed per epic (real epics only; the
    // no-epic bucket is noise here). Epics with zero stories still show (0/0).
    const epicMap = new Map<string, { total: number; done: number }>();
    for (const s of stories) {
      if (!s.epicId) continue;
      let b = epicMap.get(s.epicId);
      if (!b) {
        b = { total: 0, done: 0 };
        epicMap.set(s.epicId, b);
      }
      b.total += 1;
      if (s.status === 'done') b.done += 1;
    }
    const epicProgress = epics
      .map((e) => {
        const c = epicMap.get(e.id) ?? { total: 0, done: 0 };
        return { epicId: e.id, key: e.key, title: e.title, color: e.color, total: c.total, done: c.done };
      })
      .sort((a, b) => b.total - a.total);

    // Priority distribution — fixed severity order, empties dropped.
    const prioMap = new Map<string, number>();
    for (const s of stories) prioMap.set(s.priority, (prioMap.get(s.priority) ?? 0) + 1);
    const priority = (['critical', 'high', 'medium', 'low'] as const)
      .map((p) => ({ priority: p, count: prioMap.get(p) ?? 0 }))
      .filter((p) => p.count > 0);

    return { totalStories: stories.length, workload, epicProgress, priority };
  },

  /**
   * Velocity for the last N completed sprints of a project.
   * Reported as STORY COUNTS — `committed` = end-of-sprint scope (stories
   * still in the sprint + stories carried out at completion via the
   * `sprint_moved` activity log), `completed` = stories that ended in `done`.
   * Point totals are surfaced for callers that still want them.
   */
  async velocity(projectId: string, last: number) {
    const sprints = await prisma.sprint.findMany({
      where: { projectId, status: 'completed' },
      orderBy: { completedAt: 'desc' },
      take: last,
    });
    const ordered = sprints.slice().reverse();
    const rows: {
      sprintId: string;
      sprintName: string;
      committedStories: number;
      completedStories: number;
      committedPoints: number;
      completedPoints: number;
    }[] = [];
    for (const s of ordered) {
      const stayed = await prisma.story.findMany({
        where: { sprintId: s.id },
        select: { id: true, storyPoints: true, status: true },
      });

      // Stories carried out at completion. Primary signal: sprint_moved logs
      // tagged with meta.reason='sprint_completed' (written by
      // sprintService.complete). Fallback for legacy logs (pre-marker): a
      // 5-minute window around completedAt — JS/DB clocks differ and the log
      // is written before completedAt in the same transaction, so a strict
      // comparison drops valid rows.
      const completionWindowStart = s.completedAt
        ? new Date(s.completedAt.getTime() - 5 * 60 * 1000)
        : null;
      const completionWindowEnd = s.completedAt
        ? new Date(s.completedAt.getTime() + 5 * 60 * 1000)
        : null;
      const carriedOut = await prisma.activityLog.findMany({
        where: {
          event: 'sprint_moved',
          fromValue: s.id,
          OR: [
            { meta: { path: ['reason'], equals: 'sprint_completed' } },
            ...(completionWindowStart && completionWindowEnd
              ? [{ createdAt: { gte: completionWindowStart, lte: completionWindowEnd } }]
              : []),
          ],
        },
        select: {
          storyId: true,
          story: { select: { storyPoints: true } },
        },
      });

      const stayedIds = new Set(stayed.map((st) => st.id));
      const carriedUnique = new Map<string, number>();
      for (const log of carriedOut) {
        if (stayedIds.has(log.storyId)) continue;
        if (!carriedUnique.has(log.storyId)) {
          carriedUnique.set(log.storyId, log.story?.storyPoints ?? 0);
        }
      }

      const committedStories = stayed.length + carriedUnique.size;
      const completedStories = stayed.filter((st) => st.status === 'done').length;
      const committedPoints =
        stayed.reduce((acc, st) => acc + (st.storyPoints ?? 0), 0) +
        Array.from(carriedUnique.values()).reduce((acc, p) => acc + p, 0);
      const completedPoints = stayed
        .filter((st) => st.status === 'done')
        .reduce((acc, st) => acc + (st.storyPoints ?? 0), 0);

      rows.push({
        sprintId: s.id,
        sprintName: s.name,
        committedStories,
        completedStories,
        committedPoints,
        completedPoints,
      });
    }
    return { sprints: rows };
  },

  /**
   * Time-logged per user in a given window.
   * range = { fromIso, toIso }. Sums Worklog.timeSpentMinutes for every story in the project.
   */
  async timePerUser(projectId: string, fromIso: string, toIso: string) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    const logs = await prisma.worklog.findMany({
      where: {
        startedAt: { gte: from, lte: to },
        story: { projectId },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const buckets: Record<string, { userId: string; name: string; email: string; minutes: number }> = {};
    for (const log of logs) {
      const key = log.userId;
      if (!buckets[key]) {
        buckets[key] = {
          userId: log.userId,
          name: log.user.name,
          email: log.user.email,
          minutes: 0,
        };
      }
      buckets[key].minutes += log.timeSpentMinutes;
    }
    return {
      from: fromIso,
      to: toIso,
      entries: Object.values(buckets).sort((a, b) => b.minutes - a.minutes),
    };
  },

  /**
   * Story counts grouped by status across the project, optionally limited
   * to a creation window and/or a single sprint. Drives the status pie chart on
   * the reports page.
   */
  async statusBreakdown(projectId: string, fromIso?: string, toIso?: string, sprintId?: string) {
    const where: { projectId: string; sprintId?: string; createdAt?: { gte?: Date; lte?: Date } } = { projectId };
    // Sprint scope filters by membership (which sprint the story is IN), NOT by
    // createdAt — a story can be created before the sprint it later joins.
    if (sprintId) where.sprintId = sprintId;
    if (fromIso || toIso) {
      where.createdAt = {};
      if (fromIso) where.createdAt.gte = new Date(fromIso);
      if (toIso) where.createdAt.lte = new Date(toIso);
    }
    const grouped = await prisma.story.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const total = grouped.reduce((acc, g) => acc + g._count._all, 0);
    return {
      total,
      entries: grouped.map((g) => ({ status: g.status, count: g._count._all })),
    };
  },

  /**
   * Story counts grouped by type, optionally scoped to a single sprint.
   * Drives the type pie chart.
   */
  async typeBreakdown(projectId: string, fromIso?: string, toIso?: string, sprintId?: string) {
    const where: { projectId: string; sprintId?: string; createdAt?: { gte?: Date; lte?: Date } } = { projectId };
    if (sprintId) where.sprintId = sprintId;
    if (fromIso || toIso) {
      where.createdAt = {};
      if (fromIso) where.createdAt.gte = new Date(fromIso);
      if (toIso) where.createdAt.lte = new Date(toIso);
    }
    const grouped = await prisma.story.groupBy({
      by: ['type'],
      where,
      _count: { _all: true },
    });
    const total = grouped.reduce((acc, g) => acc + g._count._all, 0);
    return {
      total,
      entries: grouped.map((g) => ({ type: g.type, count: g._count._all })),
    };
  },

  /**
   * Per-assignee estimate vs logged time across a project, optionally scoped to
   * a single sprint. Both totals come back in minutes.
   *
   * ATTRIBUTION:
   *   - Estimate follows the story's current ASSIGNEE — it's a planning property
   *     of the assignment.
   *   - Logged time is credited to the worklog's AUTHOR (who actually logged it),
   *     NEVER the current assignee. Worklogs are immutable historical records:
   *     reassigning a ticket must NOT shift its logged time to the new owner.
   *
   * CORRECTNESS: when scoped to a sprint, logged time is restricted to that
   * sprint's date window. Without this, a story that lived in several sprints
   * would dump ALL of its worklogs into whichever sprint you're viewing, making
   * "logged" wildly exceed "estimate".
   */
  async estimateVsLogged(projectId: string, sprintId?: string) {
    // Resolve the sprint window up-front (logged time is filtered to it).
    let window: { from: Date; to: Date } | null = null;
    if (sprintId) {
      const sprint = await prisma.sprint.findUnique({
        where: { id: sprintId },
        select: { startDate: true, endDate: true, completedAt: true, createdAt: true },
      });
      if (sprint) {
        window = {
          from: sprint.startDate ?? sprint.createdAt,
          to: sprint.endDate ?? sprint.completedAt ?? new Date(),
        };
      }
    }

    const stories = await prisma.story.findMany({
      where: {
        projectId,
        ...(sprintId ? { sprintId } : {}),
      },
      select: {
        id: true,
        originalEstimateMinutes: true,
        assigneeId: true,
        assignee: { select: { id: true, name: true, email: true } },
      },
    });

    type Bucket = { userId: string; name: string; email: string; estimateMinutes: number; loggedMinutes: number };
    const buckets: Record<string, Bucket> = {};
    const ensure = (userId: string, name: string, email: string): Bucket => {
      if (!buckets[userId]) {
        buckets[userId] = { userId, name, email, estimateMinutes: 0, loggedMinutes: 0 };
      }
      return buckets[userId];
    };

    // Estimate follows the story's current assignee (unassigned stories collapse
    // into one 'Unassigned' bucket).
    for (const s of stories) {
      const userId = s.assigneeId ?? 'unassigned';
      const name = s.assignee?.name ?? 'Unassigned';
      const email = s.assignee?.email ?? '';
      ensure(userId, name, email).estimateMinutes += s.originalEstimateMinutes ?? 0;
    }

    // Logged time is credited to the worklog's AUTHOR — immutable, independent of
    // who the ticket is assigned to now. Reassignment never moves logged time.
    const storyIds = stories.map((s) => s.id);
    if (storyIds.length > 0) {
      const logs = await prisma.worklog.findMany({
        where: {
          storyId: { in: storyIds },
          ...(window ? { startedAt: { gte: window.from, lte: window.to } } : {}),
        },
        select: { timeSpentMinutes: true, userId: true, user: { select: { name: true, email: true } } },
      });
      for (const log of logs) {
        ensure(log.userId, log.user.name, log.user.email).loggedMinutes += log.timeSpentMinutes;
      }
    }

    const entries = Object.values(buckets)
      .filter((b) => b.estimateMinutes > 0 || b.loggedMinutes > 0)
      .sort((a, b) => b.estimateMinutes + b.loggedMinutes - (a.estimateMinutes + a.loggedMinutes));

    const totalEstimateMinutes = entries.reduce((acc, e) => acc + e.estimateMinutes, 0);
    const totalLoggedMinutes = entries.reduce((acc, e) => acc + e.loggedMinutes, 0);

    return { totalEstimateMinutes, totalLoggedMinutes, entries };
  },

  /**
   * Unified time-tracking aggregation for a project window — powers the entire
   * "Time tracking" tab from ONE query so every panel (per-user, per-story,
   * daily) reflects exactly the same set of worklogs. All sums are actual
   * Worklog.timeSpentMinutes; nothing is estimated.
   */
  /**
   * The earliest worklog date in a project (by `startedAt`), or null if none.
   * Powers the "Whole project" time-tracking window so it starts at real data
   * rather than an arbitrary epoch that would pre-seed decades of empty days.
   */
  async firstWorklogDate(projectId: string): Promise<Date | null> {
    const first = await prisma.worklog.findFirst({
      where: { story: { projectId } },
      orderBy: { startedAt: 'asc' },
      select: { startedAt: true },
    });
    return first?.startedAt ?? null;
  },

  async projectTimeTracking(input: {
    projectId: string;
    fromIso: string;
    toIso: string;
    userId?: string;
  }) {
    const from = new Date(input.fromIso);
    const to = new Date(input.toIso);
    const logs = await prisma.worklog.findMany({
      where: {
        startedAt: { gte: from, lte: to },
        story: { projectId: input.projectId },
        ...(input.userId ? { userId: input.userId } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        story: { select: { id: true, key: true, title: true, type: true } },
      },
      orderBy: { startedAt: 'asc' },
    });

    const userBuckets: Record<string, { userId: string; name: string; email: string; minutes: number }> = {};
    const storyBuckets: Record<
      string,
      {
        storyId: string;
        storyKey: string;
        storyTitle: string;
        storyType: string;
        minutes: number;
        entries: number;
        // Per-contributor split WITHIN this story — drives the stacked bar. Each
        // segment is credited to the worklog author, never the assignee.
        byUser: Record<string, { userId: string; name: string; minutes: number }>;
      }
    > = {};

    // Pre-seed daily buckets across the whole window (UTC days) so gaps render
    // as zero-height bars instead of silently collapsing the time axis.
    const dailyMap: Record<string, number> = {};
    const msPerDay = 24 * 3600 * 1000;
    const startDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const endDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    for (let d = startDay.getTime(); d <= endDay.getTime(); d += msPerDay) {
      dailyMap[new Date(d).toISOString().slice(0, 10)] = 0;
    }

    for (const log of logs) {
      const u =
        userBuckets[log.userId] ??
        (userBuckets[log.userId] = { userId: log.userId, name: log.user.name, email: log.user.email, minutes: 0 });
      u.minutes += log.timeSpentMinutes;

      const sb =
        storyBuckets[log.storyId] ??
        (storyBuckets[log.storyId] = {
          storyId: log.storyId,
          storyKey: log.story.key,
          storyTitle: log.story.title,
          storyType: log.story.type,
          minutes: 0,
          entries: 0,
          byUser: {},
        });
      sb.minutes += log.timeSpentMinutes;
      sb.entries += 1;
      const su =
        sb.byUser[log.userId] ?? (sb.byUser[log.userId] = { userId: log.userId, name: log.user.name, minutes: 0 });
      su.minutes += log.timeSpentMinutes;

      const key = log.startedAt.toISOString().slice(0, 10);
      dailyMap[key] = (dailyMap[key] ?? 0) + log.timeSpentMinutes;
    }

    return {
      from: input.fromIso,
      to: input.toIso,
      totalMinutes: logs.reduce((acc, l) => acc + l.timeSpentMinutes, 0),
      perUser: Object.values(userBuckets).sort((a, b) => b.minutes - a.minutes),
      perStory: Object.values(storyBuckets)
        .map((s) => ({ ...s, byUser: Object.values(s.byUser).sort((a, b) => b.minutes - a.minutes) }))
        .sort((a, b) => b.minutes - a.minutes),
      daily: Object.entries(dailyMap)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, minutes]) => ({ date, minutes })),
    };
  },

  /**
   * Individual-user worklog explorer: daily buckets + per-story breakdown in a
   * window. Optional projectId scopes to one project; otherwise aggregates
   * across every project the user has logged against.
   */
  async worklogsByUser(input: {
    userId: string;
    fromIso: string;
    toIso: string;
    projectId?: string;
  }) {
    const from = new Date(input.fromIso);
    const to = new Date(input.toIso);
    const logs = await prisma.worklog.findMany({
      where: {
        userId: input.userId,
        startedAt: { gte: from, lte: to },
        ...(input.projectId ? { story: { projectId: input.projectId } } : {}),
      },
      include: {
        story: {
          select: {
            id: true,
            key: true,
            title: true,
            projectId: true,
            project: { select: { key: true, name: true } },
          },
        },
      },
      orderBy: { startedAt: 'asc' },
    });

    // Daily buckets keyed by YYYY-MM-DD (ISO date string, UTC-stable).
    const dailyMap: Record<string, number> = {};
    const msPerDay = 24 * 3600 * 1000;
    const startDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const endDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    for (let d = startDay.getTime(); d <= endDay.getTime(); d += msPerDay) {
      dailyMap[new Date(d).toISOString().slice(0, 10)] = 0;
    }
    for (const log of logs) {
      const key = log.startedAt.toISOString().slice(0, 10);
      dailyMap[key] = (dailyMap[key] ?? 0) + log.timeSpentMinutes;
    }
    const daily = Object.entries(dailyMap)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, minutes]) => ({ date, minutes }));

    // Per-story aggregation.
    const storyBuckets: Record<
      string,
      {
        storyId: string;
        storyKey: string;
        storyTitle: string;
        projectId: string;
        projectKey: string;
        projectName: string;
        minutes: number;
        entries: number;
      }
    > = {};
    for (const log of logs) {
      const id = log.storyId;
      if (!storyBuckets[id]) {
        storyBuckets[id] = {
          storyId: id,
          storyKey: log.story.key,
          storyTitle: log.story.title,
          projectId: log.story.projectId,
          projectKey: log.story.project.key,
          projectName: log.story.project.name,
          minutes: 0,
          entries: 0,
        };
      }
      storyBuckets[id].minutes += log.timeSpentMinutes;
      storyBuckets[id].entries += 1;
    }
    const perStory = Object.values(storyBuckets).sort((a, b) => b.minutes - a.minutes);

    const totalMinutes = logs.reduce((acc, l) => acc + l.timeSpentMinutes, 0);
    return {
      userId: input.userId,
      from: input.fromIso,
      to: input.toIso,
      totalMinutes,
      daily,
      perStory,
    };
  },
};
