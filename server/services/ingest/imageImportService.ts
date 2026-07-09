// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { storyService } from '../story/storyService.js';
import { activityService } from '../activity/activityService.js';
import { attachmentService } from '../attachment/attachmentService.js';
import { workflowService } from '../workflow/workflowService.js';
import { storage } from '../storage/index.js';
import { generateStoryFromImage } from '../ai/claudeRunner.js';
import type { StoryType, Priority } from '@prisma/client';

export type AnnotationShape = 'rect' | 'arrow' | 'text';

export interface Annotation {
  id: string;
  shape: AnnotationShape;
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  text: string;
  color: string;
}

export interface ImageImportDraft {
  title: string;
  description: string;
  acceptanceCriteria: string;
  type: StoryType;
  priority: Priority;
}

export interface CommitImageEdit {
  title?: string;
  description?: string;
  acceptanceCriteria?: string;
  type?: StoryType;
  priority?: Priority;
  epicId?: string | null;
  sprintId?: string | null;
}

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function defaultDraftFromFilename(filename: string): ImageImportDraft {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  return {
    title: base || 'Imported screenshot',
    description: '',
    acceptanceCriteria: '',
    type: 'bug',
    priority: 'medium',
  };
}

/**
 * Renders the annotation list as a markdown evidence block. Used both as the
 * default `description` seed when annotations change and as the persisted
 * footer that travels with the committed story.
 */
export function annotationsToMarkdown(annotations: Annotation[]): string {
  if (!annotations.length) return '';
  const lines = annotations.map((a, idx) => {
    const label = a.text.trim() || `Region ${idx + 1}`;
    const where = `(${Math.round(a.x)}, ${Math.round(a.y)})`;
    return `${idx + 1}. **${label}** — ${a.shape} at ${where}`;
  });
  return `**Annotations on the attached image:**\n\n${lines.join('\n')}`;
}

export const imageImportService = {
  async createDraft(input: {
    projectId: string;
    uploadedById: string;
    filename: string;
    mimetype: string;
    buffer: Buffer;
  }) {
    if (!ALLOWED_IMAGE_MIMES.has(input.mimetype)) {
      throw ErrorResponse.badRequest(`Unsupported image type: ${input.mimetype}`);
    }

    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw ErrorResponse.notFound('Project not found');

    const attachment = await attachmentService.create({
      projectId: input.projectId,
      uploadedById: input.uploadedById,
      filename: input.filename,
      mimetype: input.mimetype,
      buffer: input.buffer,
    });

    const draft = defaultDraftFromFilename(input.filename);

    const record = await prisma.imageImport.create({
      data: {
        projectId: input.projectId,
        uploadedById: input.uploadedById,
        attachmentId: attachment.id,
        status: 'pending',
        annotations: [],
        draft: draft as unknown as Parameters<typeof prisma.imageImport.create>[0]['data']['draft'],
      },
      include: {
        attachment: { select: { id: true, filename: true, mimetype: true } },
      },
    });

    return {
      id: record.id,
      projectId: record.projectId,
      attachmentId: record.attachmentId,
      attachmentUrl: `/api/attachments/${record.attachmentId}/file`,
      filename: attachment.filename,
      annotations: [] as Annotation[],
      draft,
    };
  },

  async getById(id: string) {
    const record = await prisma.imageImport.findUnique({
      where: { id },
      include: {
        attachment: { select: { id: true, filename: true, mimetype: true } },
        uploadedBy: { select: { id: true, name: true, email: true } },
        stories: { select: { id: true, key: true, title: true } },
      },
    });
    if (!record) throw ErrorResponse.notFound('Image import not found');
    return {
      ...record,
      attachmentUrl: `/api/attachments/${record.attachmentId}/file`,
      annotations: record.annotations as unknown as Annotation[],
      draft: record.draft as unknown as ImageImportDraft,
    };
  },

  async listByProject(projectId: string) {
    const rows = await prisma.imageImport.findMany({
      where: { projectId },
      include: {
        attachment: { select: { id: true, filename: true, mimetype: true } },
        uploadedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { stories: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      ...r,
      attachmentUrl: `/api/attachments/${r.attachmentId}/file`,
    }));
  },

  async updateAnnotations(id: string, annotations: Annotation[]) {
    const existing = await prisma.imageImport.findUnique({ where: { id } });
    if (!existing) throw ErrorResponse.notFound('Image import not found');
    if (existing.status !== 'pending') {
      throw ErrorResponse.badRequest('Image import is not in pending state');
    }

    return prisma.imageImport.update({
      where: { id },
      data: {
        annotations: annotations as unknown as Parameters<typeof prisma.imageImport.update>[0]['data']['annotations'],
      },
    });
  },

  async updateDraft(id: string, patch: Partial<ImageImportDraft>) {
    const existing = await prisma.imageImport.findUnique({ where: { id } });
    if (!existing) throw ErrorResponse.notFound('Image import not found');
    if (existing.status !== 'pending') {
      throw ErrorResponse.badRequest('Image import is not in pending state');
    }
    const merged: ImageImportDraft = {
      ...(existing.draft as unknown as ImageImportDraft),
      ...patch,
    };
    return prisma.imageImport.update({
      where: { id },
      data: {
        draft: merged as unknown as Parameters<typeof prisma.imageImport.update>[0]['data']['draft'],
      },
    });
  },

  async commit(id: string, edit: CommitImageEdit, actorId: string) {
    const record = await prisma.imageImport.findUnique({
      where: { id },
      include: { attachment: true },
    });
    if (!record) throw ErrorResponse.notFound('Image import not found');
    if (record.status !== 'pending') {
      throw ErrorResponse.badRequest('Image import is not in pending state');
    }

    const draft = record.draft as unknown as ImageImportDraft;
    const annotations = record.annotations as unknown as Annotation[];

    const title = (edit.title ?? draft.title).trim();
    if (!title) throw ErrorResponse.badRequest('Title is required to commit');

    const description = edit.description ?? draft.description ?? '';
    const acceptanceCriteria = edit.acceptanceCriteria ?? draft.acceptanceCriteria ?? '';
    const finalDescription = [description.trim(), annotationsToMarkdown(annotations)]
      .filter(Boolean)
      .join('\n\n');

    const story = await storyService.create(
      {
        projectId: record.projectId,
        title,
        description: finalDescription || null,
        acceptanceCriteria: acceptanceCriteria || null,
        type: (edit.type ?? draft.type) as StoryType,
        priority: (edit.priority ?? draft.priority) as Priority,
        epicId: edit.epicId ?? null,
        reporterId: actorId,
      },
      actorId,
    );
    if (!story) throw new Error('Story creation returned null unexpectedly');

    // Re-attach the original image to the new story so it shows up in the
    // story's Attachments list, AND tag the story with sourceImageImportId so
    // the detail panel can render the annotation overlay.
    await prisma.story.update({
      where: { id: story.id },
      data: {
        sourceImageImportId: record.id,
        attachments: { connect: { id: record.attachmentId } },
      },
    });

    if (edit.sprintId) {
      // A story placed on a sprint can't stay in `backlog` — lift it to To Do
      // and point statusId at that column (it's created as backlog by default).
      const todoStatusId = await workflowService.defaultStatusId(record.projectId, 'todo');
      await prisma.story.update({
        where: { id: story.id },
        data: { sprintId: edit.sprintId, status: 'todo', statusId: todoStatusId },
      });
    }

    await activityService.log({
      storyId: story.id,
      actorId,
      event: 'imported',
      toValue: record.attachment.filename,
      meta: { source: 'image-import', annotations: annotations.length },
    });

    await prisma.imageImport.update({
      where: { id },
      data: { status: 'committed', committedAt: new Date() },
    });

    return story;
  },

  /**
   * Read the stored image, hand it to Claude with the current annotation list,
   * persist the AI-generated title/description/AC into the draft, and return
   * the merged draft for the client to render. Type & priority are preserved
   * (Claude does not pick those — user keeps control).
   */
  async generateDraft(id: string) {
    const record = await prisma.imageImport.findUnique({
      where: { id },
      include: { attachment: true },
    });
    if (!record) throw ErrorResponse.notFound('Image import not found');
    if (record.status !== 'pending') {
      throw ErrorResponse.badRequest('Image import is not in pending state');
    }

    const annotations = record.annotations as unknown as Annotation[];
    if (!annotations.length) {
      throw ErrorResponse.badRequest('Add at least one annotation before generating');
    }

    const buffer = await storage.read(record.attachment.path);

    const generated = await generateStoryFromImage({
      imagePath: record.attachment.path,
      filename: record.attachment.filename,
      imageBuffer: buffer,
      mimetype: record.attachment.mimetype,
      annotations,
    });

    const existingDraft = record.draft as unknown as ImageImportDraft;
    const merged: ImageImportDraft = {
      ...existingDraft,
      title: generated.title || existingDraft.title,
      description: generated.description,
      acceptanceCriteria: generated.acceptanceCriteria,
    };

    await prisma.imageImport.update({
      where: { id },
      data: {
        draft: merged as unknown as Parameters<typeof prisma.imageImport.update>[0]['data']['draft'],
      },
    });

    return merged;
  },

  async discard(id: string) {
    const record = await prisma.imageImport.findUnique({
      where: { id },
      include: { attachment: true },
    });
    if (!record) return { ok: true };
    if (record.status === 'committed') {
      throw ErrorResponse.badRequest('Cannot discard a committed image import');
    }
    await storage.remove(record.attachment.path);
    await prisma.attachment.delete({ where: { id: record.attachmentId } });
    return { ok: true };
  },
};
