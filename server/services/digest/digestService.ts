// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import { mailer } from '../mailer/mailer.js';
import logger from '../../utils/logger.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface ProjectRollup {
  key: string;
  name: string;
  createdThisWeek: number;
  completedThisWeek: number;
  inProgressNow: number;
}

export interface DigestTicket {
  key: string;
  title: string;
  status: string;
  role: 'Assignee' | 'Reporter';
  /** Project the ticket lives in — lets the digest link to the full-page ticket. */
  projectId: string;
}

export interface WeeklyDigestResult {
  usersConsidered: number;
  emailsSent: number;
  skipped: number;
}

export const digestService = {
  /**
   * Build and email one weekly digest per active user. Triggered by the k8s
   * CronJob hitting POST /api/internal/digest/weekly — never by an interval
   * inside the server, so it runs exactly once regardless of replica count.
   *
   * Each digest has two parts: a per-project rollup (created / completed /
   * in-progress this week) for every project the user belongs to, and the
   * user's own open tickets (assigned to or reported by them).
   */
  async runWeekly(): Promise<WeeklyDigestResult> {
    const since = new Date(Date.now() - WEEK_MS);

    // Project rollups are identical for every member, so compute them once.
    const projects = await prisma.project.findMany({
      select: { id: true, key: true, name: true },
    });
    const rollups = new Map<string, ProjectRollup>();
    for (const p of projects) {
      const [createdThisWeek, inProgressNow, completedStories] = await Promise.all([
        prisma.story.count({ where: { projectId: p.id, createdAt: { gte: since } } }),
        prisma.story.count({ where: { projectId: p.id, status: 'in_progress' } }),
        // "Completed" = a status_changed→done activity entry this week. Both
        // changeStatus and changeStatusRow log this with toValue 'done'.
        prisma.activityLog.findMany({
          where: {
            event: 'status_changed',
            toValue: 'done',
            createdAt: { gte: since },
            story: { projectId: p.id },
          },
          select: { storyId: true },
          distinct: ['storyId'],
        }),
      ]);
      rollups.set(p.id, {
        key: p.key,
        name: p.name,
        createdThisWeek,
        inProgressNow,
        completedThisWeek: completedStories.length,
      });
    }

    const users = await prisma.user.findMany({
      where: { disabledAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        memberships: { select: { projectId: true } },
      },
    });

    // weekly_digest is ON by default — only a stored `enabled: false` row opts
    // a user out (same "missing = on" rule as the rest of the grid).
    const optedOutRows = await prisma.notificationPreference.findMany({
      where: { type: 'weekly_digest', channel: 'email', enabled: false },
      select: { userId: true },
    });
    const optedOut = new Set(optedOutRows.map((r) => r.userId));

    let emailsSent = 0;
    let skipped = 0;

    for (const u of users) {
      if (!u.email || optedOut.has(u.id)) {
        skipped++;
        continue;
      }

      const userProjects = u.memberships
        .map((m) => rollups.get(m.projectId))
        .filter((r): r is ProjectRollup => Boolean(r));

      const ownStories = await prisma.story.findMany({
        where: {
          status: { not: 'done' },
          OR: [{ assigneeId: u.id }, { reporterId: u.id }],
        },
        select: { key: true, title: true, status: true, assigneeId: true, projectId: true },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });
      const tickets: DigestTicket[] = ownStories.map((s) => ({
        key: s.key,
        title: s.title,
        status: s.status.replace(/_/g, ' '),
        role: s.assigneeId === u.id ? 'Assignee' : 'Reporter',
        projectId: s.projectId,
      }));

      // A digest with no projects and no open tickets says nothing — skip it
      // rather than mail an empty summary.
      if (userProjects.length === 0 && tickets.length === 0) {
        skipped++;
        continue;
      }

      const result = await mailer.sendWeeklyDigest({
        to: u.email,
        name: u.name,
        projects: userProjects,
        tickets,
      });
      if (result.sent) emailsSent++;
      else skipped++;
    }

    logger.info(
      `weekly digest: ${emailsSent} sent, ${skipped} skipped, ${users.length} users considered`,
    );
    return { usersConsidered: users.length, emailsSent, skipped };
  },
};
