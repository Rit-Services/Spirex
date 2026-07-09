// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import type { Prisma, StatusCategory, StoryStatus } from '@prisma/client';

/**
 * Per-project workflow metadata. Each WorkflowStatus row is pinned to a core
 * `StoryStatus` enum value (one row per enum per project) so the enum remains
 * the system source of truth while admins can rename/recolor/reorder columns.
 */

interface DefaultRow {
  coreStatus: StoryStatus;
  label: string;
  color: string;
  order: number;
  category: StatusCategory;
}

export const DEFAULT_WORKFLOW: DefaultRow[] = [
  { coreStatus: 'todo',        label: 'To Do',       color: '#64748B', order: 0, category: 'todo' },
  { coreStatus: 'in_progress', label: 'In Progress', color: '#3B82F6', order: 1, category: 'in_progress' },
  { coreStatus: 'in_review',   label: 'In Review',   color: '#8B5CF6', order: 2, category: 'in_progress' },
  { coreStatus: 'qa',          label: 'QA',          color: '#F59E0B', order: 3, category: 'in_progress' },
  { coreStatus: 'done',        label: 'Done',        color: '#10B981', order: 4, category: 'done' },
];

export const workflowService = {
  /**
   * Resolve the WorkflowStatus id a story should carry for a given core status:
   * its default row (falling back to ANY row for that core if no row is flagged
   * `isDefault`, then `null` as a last resort). Centralised so create /
   * changeStatus / sprint transitions never leave a stale or null `statusId`
   * behind. Pass a `tx` when calling inside one.
   */
  async defaultStatusId(
    projectId: string,
    coreStatus: StoryStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    const client = tx ?? prisma;
    const def = await client.workflowStatus.findFirst({
      where: { projectId, coreStatus, isDefault: true },
      orderBy: { order: 'asc' },
    });
    if (def) return def.id;
    const any = await client.workflowStatus.findFirst({
      where: { projectId, coreStatus },
      orderBy: { order: 'asc' },
    });
    return any?.id ?? null;
  },

  /** List a project's workflow rows, ordered by `order` asc. */
  list(projectId: string) {
    return prisma.workflowStatus.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  },

  /**
   * Seed the six default rows for a project. Idempotent — runs inside an
   * existing transaction when passed one (e.g. during projectService.create).
   */
  async seedDefaults(projectId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    for (const row of DEFAULT_WORKFLOW) {
      // With the composite-unique dropped (see 9A.2), findFirst+create gives
      // idempotent behaviour — only insert if there's no default row yet for
      // this coreStatus.
      const existing = await client.workflowStatus.findFirst({
        where: { projectId, coreStatus: row.coreStatus, isDefault: true },
      });
      if (existing) continue;
      await client.workflowStatus.create({
        data: {
          projectId,
          coreStatus: row.coreStatus,
          label: row.label,
          color: row.color,
          order: row.order,
          category: row.category,
          isDefault: true,
        },
      });
    }
  },

  /**
   * Update a single workflow row. Caller is expected to have `workflow:edit`.
   * `coreStatus` is immutable — we never remap an enum value to a different
   * category/row because existing stories would silently reclassify.
   */
  async update(
    id: string,
    input: {
      label?: string;
      color?: string;
      order?: number;
      category?: StatusCategory;
      // null clears the limit, a number sets it, undefined leaves it as-is.
      wipLimit?: number | null;
    },
  ) {
    const existing = await prisma.workflowStatus.findUnique({ where: { id } });
    if (!existing) throw ErrorResponse.notFound('Workflow status not found');
    if (input.label != null && !input.label.trim()) {
      throw ErrorResponse.badRequest('Label cannot be empty');
    }
    // NOTE: never touch `isDefault` here. Editing a column's label/color/order
    // must NOT strip its default flag — doing so leaves a core with zero default
    // rows, which breaks changeStatus/removeColumn/reset fallbacks and lets
    // seedDefaults insert a duplicate default. `isDefault` is owned solely by
    // seedDefaults (true) and createColumn (false).
    return prisma.workflowStatus.update({
      where: { id },
      data: {
        label: input.label?.trim() ?? undefined,
        color: input.color ?? undefined,
        order: input.order ?? undefined,
        category: input.category ?? undefined,
        // Pass null through (clears the limit); only `undefined` is a no-op.
        wipLimit: input.wipLimit === undefined ? undefined : input.wipLimit,
      },
    });
  },

  /**
   * Add a new custom column to a project's workflow. Caller picks the
   * underlying coreStatus the column maps to (that keeps activity-log writes
   * and legacy enum reads coherent) plus a category, label, color, and order.
   */
  async createColumn(input: {
    projectId: string;
    coreStatus: StoryStatus;
    label: string;
    color: string;
    category: StatusCategory;
    order?: number;
  }) {
    if (!input.label.trim()) throw ErrorResponse.badRequest('Label cannot be empty');
    const current = await prisma.workflowStatus.findMany({
      where: { projectId: input.projectId },
      orderBy: { order: 'desc' },
      take: 1,
    });
    const nextOrder = input.order ?? (current[0]?.order ?? -1) + 1;
    return prisma.workflowStatus.create({
      data: {
        projectId: input.projectId,
        coreStatus: input.coreStatus,
        label: input.label.trim(),
        color: input.color,
        category: input.category,
        order: nextOrder,
        isDefault: false,
      },
    });
  },

  /**
   * Remove a custom (non-default) column. Default rows can't be deleted —
   * the system needs one row per coreStatus as a fallback target. Any stories
   * pointing at the removed row are reassigned to the default row for the
   * same coreStatus so they don't float (Story.statusId is ON DELETE SET NULL
   * at the DB level — this just makes the reassignment explicit).
   */
  async removeColumn(id: string) {
    const row = await prisma.workflowStatus.findUnique({ where: { id } });
    if (!row) throw ErrorResponse.notFound('Workflow status not found');
    if (row.isDefault) {
      throw ErrorResponse.badRequest('Default columns cannot be deleted — edit their label instead');
    }
    const fallback = await prisma.workflowStatus.findFirst({
      where: { projectId: row.projectId, coreStatus: row.coreStatus, isDefault: true },
    });
    return prisma.$transaction(async (tx) => {
      if (fallback) {
        await tx.story.updateMany({
          where: { statusId: row.id },
          data: { statusId: fallback.id },
        });
      }
      await tx.workflowStatus.delete({ where: { id: row.id } });
      return { ok: true };
    });
  },

  /**
   * Reset a project's workflow back to the factory defaults. Used by the
   * settings UI's "reset" button — deletes custom rows and re-applies labels,
   * colors, order, and category on the defaults.
   */
  async resetToDefaults(projectId: string) {
    return prisma.$transaction(async (tx) => {
      // 1. Guarantee a canonical default row exists for EACH default coreStatus,
      //    updating its presentation. Create-if-missing is what makes reset truly
      //    "factory restore": it self-heals projects whose default rows were
      //    deleted or wrongly flagged isDefault:false by the old bulkUpdate bug.
      const canonical = new Map<StoryStatus, string>();
      for (const row of DEFAULT_WORKFLOW) {
        const existing = await tx.workflowStatus.findFirst({
          where: { projectId, coreStatus: row.coreStatus, isDefault: true },
        });
        if (existing) {
          await tx.workflowStatus.update({
            where: { id: existing.id },
            data: {
              label: row.label,
              color: row.color,
              order: row.order,
              category: row.category,
            },
          });
          canonical.set(row.coreStatus, existing.id);
        } else {
          const created = await tx.workflowStatus.create({
            data: {
              projectId,
              coreStatus: row.coreStatus,
              label: row.label,
              color: row.color,
              order: row.order,
              category: row.category,
              isDefault: true,
            },
          });
          canonical.set(row.coreStatus, created.id);
        }
      }

      // 2. Every row that ISN'T one of the canonical defaults (real custom
      //    columns AND any corrupted ex-defaults) gets its stories moved onto the
      //    canonical default for the same coreStatus, then deleted. Reassigning
      //    before delete keeps stories attached instead of floating to null.
      const canonicalIds = [...canonical.values()];
      const others = await tx.workflowStatus.findMany({
        where: { projectId, id: { notIn: canonicalIds } },
      });
      for (const other of others) {
        const fallbackId = canonical.get(other.coreStatus);
        if (fallbackId) {
          await tx.story.updateMany({
            where: { statusId: other.id },
            data: { statusId: fallbackId },
          });
        }
      }
      if (others.length > 0) {
        await tx.workflowStatus.deleteMany({
          where: { id: { in: others.map((r) => r.id) } },
        });
      }

      return tx.workflowStatus.findMany({
        where: { projectId },
        orderBy: { order: 'asc' },
      });
    });
  },
};
