// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import { ErrorResponse } from '../../utils/errorResponse.js';

/**
 * Project-scoped labels. Created on-the-fly from the ticket label picker and
 * reused across the project's tickets (many-to-many via StoryLabel). Colors are
 * auto-assigned from a fixed palette on create — the same palette epics draw
 * from — so badges read consistently with epic chips without asking the user
 * to pick a color. Mirrors the WorkflowStatus service shape (per-project rows).
 */

// Same hexes EpicDialog / jiraImportService use, so labels and epics share a
// visual language. Auto-assignment cycles through these by current label count.
export const LABEL_COLORS = [
  '#0052CC', '#00875A', '#6554C0', '#DE350B', '#FF8B00',
  '#00B8D9', '#FFAB00', '#5243AA', '#36B37E',
];

const hexColor = /^#[0-9A-Fa-f]{6}$/;

export const labelService = {
  /** List a project's labels, alphabetical. */
  list(projectId: string) {
    return prisma.label.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Create a label in a project. Name is required and unique within the project
   * (case-insensitive — "Bug" and "bug" are the same label, returns the existing
   * one rather than 409ing so the on-the-fly picker is idempotent). When no color
   * is given, auto-assign the next palette color by current label count.
   */
  async create(projectId: string, input: { name: string; color?: string }) {
    const name = input.name.trim();
    if (!name) throw ErrorResponse.badRequest('Label name cannot be empty');
    if (input.color && !hexColor.test(input.color)) {
      throw ErrorResponse.badRequest('Color must be a #RRGGBB hex string');
    }

    // Case-insensitive existing-name check: reuse rather than duplicate.
    const existing = await prisma.label.findFirst({
      where: { projectId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return existing;

    const count = await prisma.label.count({ where: { projectId } });
    const color = input.color ?? LABEL_COLORS[count % LABEL_COLORS.length];
    return prisma.label.create({ data: { projectId, name, color } });
  },

  /** Rename / recolor a label. */
  async update(id: string, input: { name?: string; color?: string }) {
    const existing = await prisma.label.findUnique({ where: { id } });
    if (!existing) throw ErrorResponse.notFound('Label not found');
    const name = input.name?.trim();
    if (input.name != null && !name) {
      throw ErrorResponse.badRequest('Label name cannot be empty');
    }
    if (input.color && !hexColor.test(input.color)) {
      throw ErrorResponse.badRequest('Color must be a #RRGGBB hex string');
    }
    if (name && name.toLowerCase() !== existing.name.toLowerCase()) {
      // Guard the project-unique name (case-insensitive) before writing.
      const clash = await prisma.label.findFirst({
        where: {
          projectId: existing.projectId,
          name: { equals: name, mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (clash) throw ErrorResponse.badRequest('A label with that name already exists');
    }
    return prisma.label.update({
      where: { id },
      data: { name: name ?? undefined, color: input.color ?? undefined },
    });
  },

  /** Delete a label entirely (also detaches it from every story via cascade). */
  async remove(id: string) {
    const existing = await prisma.label.findUnique({ where: { id } });
    if (!existing) throw ErrorResponse.notFound('Label not found');
    await prisma.label.delete({ where: { id } });
    return { ok: true };
  },

  /**
   * Attach a label to a story. Both must live in the SAME project — refuse a
   * cross-project attach so one project's labels can't leak onto another's
   * tickets. Idempotent: re-attaching an already-attached label is a no-op.
   */
  async attachToStory(storyId: string, labelId: string) {
    const [story, label] = await Promise.all([
      prisma.story.findUnique({ where: { id: storyId }, select: { projectId: true } }),
      prisma.label.findUnique({ where: { id: labelId }, select: { projectId: true } }),
    ]);
    if (!story) throw ErrorResponse.notFound('Story not found');
    if (!label) throw ErrorResponse.notFound('Label not found');
    if (story.projectId !== label.projectId) {
      throw ErrorResponse.badRequest('Label belongs to a different project');
    }
    // Composite PK makes this a safe upsert — re-attach is a no-op.
    await prisma.storyLabel.upsert({
      where: { storyId_labelId: { storyId, labelId } },
      create: { storyId, labelId },
      update: {},
    });
    return { ok: true };
  },

  /** Detach a label from a story. No-op if it wasn't attached. */
  async detachFromStory(storyId: string, labelId: string) {
    await prisma.storyLabel.deleteMany({ where: { storyId, labelId } });
    return { ok: true };
  },
};
