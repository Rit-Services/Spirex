// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { storyService } from '../story/storyService.js';
import { activityService } from '../activity/activityService.js';
import { extractText } from './textExtractor.js';
import { parseSections } from './sectionParser.js';
import type { DraftStory } from './sectionParser.js';
import type { StoryType, Priority } from '@prisma/client';

export type { DraftStory };

export interface CommitEdit {
  localId: string;
  title?: string;
  description?: string;
  acceptanceCriteria?: string;
  type?: StoryType;
  priority?: Priority;
  epicId?: string;
  sprintId?: string;
  skip?: boolean;
}

export const importService = {
  async createDraft(input: {
    projectId: string;
    uploadedById: string;
    filename: string;
    mimetype: string;
    buffer: Buffer;
  }) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw ErrorResponse.notFound('Project not found');

    const text = await extractText(input.buffer, input.mimetype);
    const drafts = parseSections(text);

    if (!drafts.length) {
      throw ErrorResponse.badRequest('No content sections found in the document');
    }

    const record = await prisma.documentImport.create({
      data: {
        projectId: input.projectId,
        uploadedById: input.uploadedById,
        status: 'pending',
        draftPayload: drafts as unknown as Parameters<typeof prisma.documentImport.create>[0]['data']['draftPayload'],
        originalFilename: input.filename,
      },
    });

    return { id: record.id, drafts, originalFilename: input.filename };
  },

  async getById(id: string) {
    const record = await prisma.documentImport.findUnique({
      where: { id },
      include: {
        stories: { select: { id: true, key: true, title: true } },
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!record) throw ErrorResponse.notFound('Import not found');
    return record;
  },

  async listByProject(projectId: string) {
    return prisma.documentImport.findMany({
      where: { projectId },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { stories: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async commit(id: string, edits: CommitEdit[], actorId: string) {
    const record = await prisma.documentImport.findUnique({ where: { id } });
    if (!record) throw ErrorResponse.notFound('Import not found');
    if (record.status !== 'pending') {
      throw ErrorResponse.badRequest('Import is not in pending state');
    }

    const drafts = record.draftPayload as unknown as DraftStory[];

    const toCreate = drafts
      .map((draft) => {
        const edit = edits.find((e) => e.localId === draft.localId);
        if (edit?.skip) return null;
        return {
          ...draft,
          title: edit?.title ?? draft.title,
          description: edit?.description ?? draft.description,
          acceptanceCriteria:
            edit?.acceptanceCriteria !== undefined
              ? edit.acceptanceCriteria
              : draft.acceptanceCriteria,
          type: (edit?.type ?? draft.type) as StoryType,
          priority: (edit?.priority ?? draft.priority) as Priority,
          epicId: edit?.epicId ?? undefined,
          sprintId: edit?.sprintId ?? undefined,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    if (!toCreate.length) {
      throw ErrorResponse.badRequest('All drafts were skipped — nothing to commit');
    }

    const created = [];
    for (const draft of toCreate) {
      const story = await storyService.create(
        {
          projectId: record.projectId,
          title: draft.title,
          description: draft.description || null,
          acceptanceCriteria: draft.acceptanceCriteria || null,
          type: draft.type,
          priority: draft.priority,
          epicId: draft.epicId ?? null,
          reporterId: actorId,
        },
        actorId,
      );
      if (!story) throw new Error('Story creation returned null unexpectedly');
      await prisma.story.update({
        where: { id: story.id },
        data: { sourceDocumentId: id },
      });
      await activityService.log({
        storyId: story.id,
        actorId,
        event: 'imported',
        toValue: record.originalFilename,
      });
      created.push(story);
    }

    await prisma.documentImport.update({
      where: { id },
      data: { status: 'committed', committedAt: new Date() },
    });

    return created;
  },

  async discard(id: string) {
    const record = await prisma.documentImport.findUnique({ where: { id } });
    if (!record) throw ErrorResponse.notFound('Import not found');
    if (record.status === 'committed') {
      throw ErrorResponse.badRequest('Cannot discard a committed import');
    }
    return prisma.documentImport.update({
      where: { id },
      data: { status: 'discarded' },
    });
  },
};
