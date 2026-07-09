// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import type { ProjectNotificationEvent } from '@prisma/client';

/**
 * CRUD for the project-scoped EMAIL notification opt-ins (Phase 14). The
 * delivery-side resolution (union with the personal grid + dedupe ledger) lives
 * in notificationService — this service only reads/writes the preference rows
 * the Project Settings matrix edits. A missing row means OFF (no project
 * amplification); we only persist explicit choices.
 */

// Canonical column order for the settings matrix.
export const PROJECT_NOTIFICATION_EVENTS: ProjectNotificationEvent[] = [
  'status_changed',
  'ticket_completed',
  'sprint_completed',
];

export interface ProjectPrefEntry {
  userId: string;
  event: ProjectNotificationEvent;
  emailEnabled: boolean;
}

export const projectNotificationService = {
  /** Every stored opt-in row for a project. The UI composes the member×event
   *  grid and treats unstored cells as OFF. */
  list(projectId: string): Promise<ProjectPrefEntry[]> {
    return prisma.projectNotificationPreference.findMany({
      where: { projectId },
      select: { userId: true, event: true, emailEnabled: true },
    });
  },

  /** Just one user's rows — used when a non-lead member edits only their own. */
  listForUser(projectId: string, userId: string): Promise<ProjectPrefEntry[]> {
    return prisma.projectNotificationPreference.findMany({
      where: { projectId, userId },
      select: { userId: true, event: true, emailEnabled: true },
    });
  },

  /** Upsert a single (project, user, event) cell. */
  set(
    projectId: string,
    userId: string,
    event: ProjectNotificationEvent,
    emailEnabled: boolean,
  ) {
    return prisma.projectNotificationPreference.upsert({
      where: { projectId_userId_event: { projectId, userId, event } },
      update: { emailEnabled },
      create: { projectId, userId, event, emailEnabled },
    });
  },

  /** Upsert several cells for ONE user (the row the Settings matrix saves), then
   *  return the project's full stored set for the client to re-render. */
  async setMany(
    projectId: string,
    userId: string,
    entries: { event: ProjectNotificationEvent; emailEnabled: boolean }[],
  ): Promise<ProjectPrefEntry[]> {
    if (entries.length > 0) {
      await prisma.$transaction(
        entries.map((e) =>
          prisma.projectNotificationPreference.upsert({
            where: { projectId_userId_event: { projectId, userId, event: e.event } },
            update: { emailEnabled: e.emailEnabled },
            create: { projectId, userId, event: e.event, emailEnabled: e.emailEnabled },
          }),
        ),
      );
    }
    return projectNotificationService.list(projectId);
  },
};
