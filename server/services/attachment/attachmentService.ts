// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import crypto from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { attachmentModel } from '../../models/attachment/attachment.js';
import { storage } from '../storage/index.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { activityService } from '../activity/activityService.js';
import type { AttachmentKind } from '@prisma/client';

function slugify(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  return (
    base
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 48) || 'file'
  );
}

function monthBucket(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function kindFromMime(mimetype: string): AttachmentKind {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.startsWith('video/')) return 'video';
  return 'document';
}

/**
 * Short, URL-safe random segment used in the stored filename. Independent of
 * the DB row's `id` (which Prisma generates via `@default(cuid())` at create
 * time). Keeps the on-disk filename unguessable without adding a dependency.
 */
function randomSlug(): string {
  return crypto.randomBytes(9).toString('base64url');
}

export const attachmentService = {
  listByStory: (storyId: string) => attachmentModel.listByStory(storyId),
  listByProject: (projectId: string) => attachmentModel.listByProject(projectId),
  findById: (id: string) => attachmentModel.findById(id),

  async create(input: {
    projectId: string;
    storyId?: string | null;
    uploadedById: string;
    filename: string;
    mimetype: string;
    buffer: Buffer;
    /** Preserve an original creation time (e.g. a JIRA attachment's upload date).
     *  Omit for fresh uploads — Prisma defaults to now(). */
    createdAt?: Date;
  }) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw ErrorResponse.notFound('Project not found');
    if (input.storyId) {
      const story = await prisma.story.findUnique({ where: { id: input.storyId } });
      if (!story || story.projectId !== input.projectId) {
        throw ErrorResponse.badRequest('Story does not belong to that project');
      }
    }

    const slug = slugify(input.filename);
    const ext = input.filename.includes('.') ? input.filename.split('.').pop() : '';
    const destKey = [
      project.key,
      monthBucket(new Date()),
      `${randomSlug()}-${slug}${ext ? '.' + ext : ''}`,
    ].join('/');

    await storage.save({ buffer: input.buffer, destKey });

    return attachmentModel.create({
      project: { connect: { id: input.projectId } },
      story: input.storyId ? { connect: { id: input.storyId } } : undefined,
      uploadedBy: { connect: { id: input.uploadedById } },
      filename: input.filename,
      mimetype: input.mimetype,
      sizeBytes: input.buffer.byteLength,
      path: destKey,
      kind: kindFromMime(input.mimetype),
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    });
  },

  /**
   * Link the attachments referenced inline in a story's description to that
   * story. Inline media uploads before the story exists (storyId = null); once
   * the story is saved we bind the still-referenced files to it so they show as
   * the story's own and get cleaned up when the story is deleted.
   *
   * Strictly additive — only claims rows that are still unlinked
   * (`storyId IS NULL`) and belong to the same project, so it can never steal
   * another story's attachment or touch gallery files.
   */
  async linkDescriptionAttachments(storyId: string, projectId: string, description: string | null) {
    if (!description) return;
    const ids = [...description.matchAll(/\/api\/attachments\/([A-Za-z0-9_-]+)\/file/g)].map(
      (m) => m[1],
    );
    if (ids.length === 0) return;
    await prisma.attachment.updateMany({
      where: { id: { in: ids }, projectId, storyId: null },
      data: { storyId },
    });
  },

  async remove(id: string, actorId?: string) {
    const existing = await attachmentModel.findById(id);
    if (!existing) throw ErrorResponse.notFound('Attachment not found');
    await storage.remove(existing.path);
    const deleted = await attachmentModel.delete(id);
    // Log to the story's activity feed — but only for story-attached files.
    // Inline description/comment media uploaded before a story exists carry a
    // null storyId (and are cleaned up silently), so there's nothing to log.
    if (existing.storyId && actorId) {
      await activityService.log({
        storyId: existing.storyId,
        actorId,
        event: 'attachment_deleted',
        toValue: existing.filename,
      });
    }
    return deleted;
  },
};
