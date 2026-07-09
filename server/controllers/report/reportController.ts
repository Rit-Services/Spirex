// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { reportService } from '../../services/report/reportService.js';
import { sprintService } from '../../services/sprint/sprintService.js';
import { projectService } from '../../services/project/projectService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { can, type ProjectRole } from '../../utils/permissions.js';

async function assertReadAccess(req: Request, projectId: string) {
  if (!req.user) throw ErrorResponse.unauthorized();
  const membership = await projectService.getMembership(projectId, req.user.id);
  const allowed = can(
    {
      userId: req.user.id,
      isSuperAdmin: req.user.isSuperAdmin,
      orgRole: req.orgContext?.role,
      projectRole: membership?.projectRole as ProjectRole | undefined,
    },
    'report:view',
  );
  if (!allowed) throw ErrorResponse.forbidden();
}

export const reportController = {
  async overview(req: Request, res: Response) {
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw ErrorResponse.badRequest('projectId is required');
    await assertReadAccess(req, projectId);
    const data = await reportService.overview(projectId);
    res.json(data);
  },

  async burndown(req: Request, res: Response) {
    const sprintId = String(req.query.sprintId || '');
    if (!sprintId) throw ErrorResponse.badRequest('sprintId is required');
    const sprint = await sprintService.get(sprintId);
    await assertReadAccess(req, sprint.projectId);
    const data = await sprintService.burndown(sprintId);
    res.json(data);
  },

  async velocity(req: Request, res: Response) {
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw ErrorResponse.badRequest('projectId is required');
    await assertReadAccess(req, projectId);
    const last = Number(req.query.last ?? 5);
    const data = await reportService.velocity(projectId, Math.min(Math.max(1, last), 20));
    res.json(data);
  },

  async timePerUser(req: Request, res: Response) {
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw ErrorResponse.badRequest('projectId is required');
    await assertReadAccess(req, projectId);
    const range = String(req.query.range ?? 'week');
    const now = new Date();
    const endOfToday = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999,
    ));
    let from: Date;
    let to = endOfToday;

    if (range === 'custom' && req.query.from && req.query.to) {
      from = new Date(String(req.query.from));
      to = new Date(String(req.query.to));
    } else if (range === 'sprint') {
      const active = await sprintService.getActive(projectId);
      from = active?.startDate ?? new Date(now.getTime() - 14 * 24 * 3600 * 1000);
    } else if (range === 'month') {
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    } else if (range === 'last-month') {
      from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59));
    } else {
      // week — from last Monday 00:00 UTC.
      const d = new Date(now);
      const day = d.getUTCDay();
      const offsetToMon = (day + 6) % 7;
      d.setUTCDate(d.getUTCDate() - offsetToMon);
      d.setUTCHours(0, 0, 0, 0);
      from = d;
    }

    const data = await reportService.timePerUser(projectId, from.toISOString(), to.toISOString());
    res.json({ range, ...data });
  },

  async statusBreakdown(req: Request, res: Response) {
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw ErrorResponse.badRequest('projectId is required');
    await assertReadAccess(req, projectId);
    const fromIso = req.query.from ? String(req.query.from) : undefined;
    const toIso = req.query.to ? String(req.query.to) : undefined;
    const sprintId = req.query.sprintId ? String(req.query.sprintId) : undefined;
    const data = await reportService.statusBreakdown(projectId, fromIso, toIso, sprintId);
    res.json(data);
  },

  async typeBreakdown(req: Request, res: Response) {
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw ErrorResponse.badRequest('projectId is required');
    await assertReadAccess(req, projectId);
    const fromIso = req.query.from ? String(req.query.from) : undefined;
    const toIso = req.query.to ? String(req.query.to) : undefined;
    const sprintId = req.query.sprintId ? String(req.query.sprintId) : undefined;
    const data = await reportService.typeBreakdown(projectId, fromIso, toIso, sprintId);
    res.json(data);
  },

  async estimateVsLogged(req: Request, res: Response) {
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw ErrorResponse.badRequest('projectId is required');
    await assertReadAccess(req, projectId);
    const sprintId = req.query.sprintId ? String(req.query.sprintId) : undefined;
    const data = await reportService.estimateVsLogged(projectId, sprintId);
    res.json(data);
  },

  /**
   * Unified time-tracking feed for a project's "Time tracking" tab.
   * The window is EITHER a sprint (resolved from its dates) OR a date range —
   * never a confusing mix. Returns per-user, per-story and daily breakdowns from
   * a single set of worklogs so the whole tab is internally consistent.
   */
  async timeTracking(req: Request, res: Response) {
    const projectId = String(req.query.projectId || '');
    if (!projectId) throw ErrorResponse.badRequest('projectId is required');
    await assertReadAccess(req, projectId);

    const userId = req.query.userId ? String(req.query.userId) : undefined;
    const sprintId = req.query.sprintId ? String(req.query.sprintId) : undefined;

    const now = new Date();
    const endOfToday = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999,
    ));
    let from: Date;
    let to = endOfToday;
    let scope: { kind: 'sprint' | 'range'; label: string };

    if (sprintId) {
      const sprint = await sprintService.get(sprintId);
      if (sprint.projectId !== projectId) {
        throw ErrorResponse.badRequest('Sprint does not belong to this project');
      }
      from = sprint.startDate ?? sprint.createdAt;
      to = sprint.endDate ?? sprint.completedAt ?? endOfToday;
      scope = { kind: 'sprint', label: sprint.name };
    } else {
      const range = String(req.query.range ?? 'week');
      if (range === 'custom' && req.query.from && req.query.to) {
        from = new Date(String(req.query.from));
        to = new Date(String(req.query.to));
        scope = { kind: 'range', label: 'Custom range' };
      } else if (range === 'month') {
        from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        scope = { kind: 'range', label: 'This month' };
      } else if (range === 'last-month') {
        from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59));
        scope = { kind: 'range', label: 'Last month' };
      } else if (range === 'all') {
        // Whole project — span from the FIRST worklog (incl. imported history)
        // to today. Anchored on real data, not epoch, so the daily series
        // doesn't pre-seed decades of empty days. No worklogs → just today.
        const first = await reportService.firstWorklogDate(projectId);
        from = first ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        scope = { kind: 'range', label: 'Whole project' };
      } else {
        // week — from last Monday 00:00 UTC.
        const d = new Date(now);
        const day = d.getUTCDay();
        const offsetToMon = (day + 6) % 7;
        d.setUTCDate(d.getUTCDate() - offsetToMon);
        d.setUTCHours(0, 0, 0, 0);
        from = d;
        scope = { kind: 'range', label: 'This week' };
      }
    }

    const data = await reportService.projectTimeTracking({
      projectId,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
      userId,
    });
    res.json({ scope, ...data });
  },

  /**
   * Admin-oriented per-user worklog explorer.
   * Admins can query any userId; non-admins are restricted to their own.
   */
  async worklogExplorer(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const requestedUserId = String(req.query.userId || req.user.id);
    if (req.orgContext?.role !== 'admin' && requestedUserId !== req.user.id) {
      throw ErrorResponse.forbidden('Only admins can inspect other users');
    }

    const now = new Date();
    const rangeKey = String(req.query.range ?? 'week');
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;

    // For current-period ranges (week/month), use end-of-today UTC as the upper
    // bound so worklogs anchored to "today" in any timezone (e.g. noon local
    // time, which can be a future UTC instant in the morning) still match.
    const endOfToday = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999,
    ));
    let from: Date;
    let to = endOfToday;
    if (req.query.from && req.query.to) {
      from = new Date(String(req.query.from));
      to = new Date(String(req.query.to));
    } else {
      switch (rangeKey) {
        case 'last-week': {
          const d = new Date(now);
          const day = d.getUTCDay();
          const offsetToMon = (day + 6) % 7;
          d.setUTCDate(d.getUTCDate() - offsetToMon - 7);
          d.setUTCHours(0, 0, 0, 0);
          from = d;
          to = new Date(d.getTime() + 7 * 24 * 3600 * 1000 - 1);
          break;
        }
        case 'month': {
          from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
          break;
        }
        case 'last-month': {
          from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
          to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59));
          break;
        }
        case 'week':
        default: {
          const d = new Date(now);
          const day = d.getUTCDay();
          const offsetToMon = (day + 6) % 7;
          d.setUTCDate(d.getUTCDate() - offsetToMon);
          d.setUTCHours(0, 0, 0, 0);
          from = d;
        }
      }
    }

    // If the caller scopes to a projectId they still need report:view there.
    if (projectId) await assertReadAccess(req, projectId);

    const data = await reportService.worklogsByUser({
      userId: requestedUserId,
      fromIso: from.toISOString(),
      toIso: to.toISOString(),
      projectId,
    });
    res.json({ range: rangeKey, ...data });
  },
};
