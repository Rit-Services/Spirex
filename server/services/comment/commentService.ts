// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { commentModel } from '../../models/comment/comment.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { activityService } from '../activity/activityService.js';
import { notificationService } from '../notification/notificationService.js';
import { extractMentionUserIds } from '../../utils/mentions.js';
import { tiptapPlainText } from '../../utils/tiptapPlainText.js';
import { prisma } from '../../db/prisma.js';

/**
 * Resolve @-mentions in a comment body to the subset of mentioned users who
 * are members of the story's project (excluding the author). We never notify
 * a mentioned user who can't even see the project.
 */
async function resolveMentionedMembers(opts: {
  mentionedIds: string[];
  projectId: string;
  authorId: string;
}): Promise<string[]> {
  const candidates = opts.mentionedIds.filter((id) => id !== opts.authorId);
  if (candidates.length === 0) return [];
  const members = await prisma.projectMember.findMany({
    where: { projectId: opts.projectId, userId: { in: candidates } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

export const commentService = {
  listByStory: (storyId: string) => commentModel.listByStory(storyId),

  async create(input: { storyId: string; authorId: string; body: string }) {
    if (!input.body.trim()) throw ErrorResponse.badRequest('Comment body is required');
    const rec = await commentModel.create({
      story: { connect: { id: input.storyId } },
      author: { connect: { id: input.authorId } },
      body: input.body,
    });
    await activityService.log({
      storyId: input.storyId,
      actorId: input.authorId,
      event: 'commented',
    });

    const [story, author] = await Promise.all([
      prisma.story.findUnique({
        where: { id: input.storyId },
        select: { key: true, title: true, projectId: true },
      }),
      prisma.user.findUnique({
        where: { id: input.authorId },
        select: { name: true },
      }),
    ]);

    if (story) {
      const actorName = author?.name ?? 'Someone';
      const base = {
        storyId: input.storyId,
        storyKey: story.key,
        storyTitle: story.title,
        actorId: input.authorId,
        actorName,
        // Anchor every comment/mention link straight to this comment.
        commentId: rec.id,
        // Quote the comment in the email so recipients read it without opening the app.
        commentExcerpt: tiptapPlainText(input.body),
      };
      const mentionedIds = await resolveMentionedMembers({
        mentionedIds: extractMentionUserIds(input.body),
        projectId: story.projectId,
        authorId: input.authorId,
      });

      // Comment ping → every watcher, EXCEPT anyone @-mentioned: they get the
      // sharper story_mentioned notification instead, so nobody is double-pinged.
      await notificationService.dispatch({
        ...base,
        type: 'story_commented',
        title: `${actorName} commented on ${story.key}`,
        emailHeadline: 'commented on this story',
        excludeUserIds: mentionedIds,
      });

      // Mention ping → exactly the mentioned project members.
      if (mentionedIds.length > 0) {
        await notificationService.dispatchToUsers(mentionedIds, {
          ...base,
          type: 'story_mentioned',
          title: `${actorName} mentioned you on ${story.key}`,
          emailHeadline: 'mentioned you in a comment',
        });
      }
    }

    // Re-read with author relation included for the response.
    return commentModel
      .listByStory(input.storyId)
      .then((all) => all.find((c) => c.id === rec.id) ?? rec);
  },

  async update(id: string, userId: string, body: string) {
    const existing = await commentModel.findById(id);
    if (!existing) throw ErrorResponse.notFound('Comment not found');
    if (existing.authorId !== userId) throw ErrorResponse.forbidden('Only the author can edit a comment');
    if (!body.trim()) throw ErrorResponse.badRequest('Comment body is required');

    // Notify only newly added mentions on edit.
    const previousMentions = new Set(extractMentionUserIds(existing.body));

    await commentModel.update(id, { body });

    const newMentions = extractMentionUserIds(body).filter((mid) => !previousMentions.has(mid));
    if (newMentions.length > 0) {
      const story = await prisma.story.findUnique({
        where: { id: existing.storyId },
        select: { key: true, title: true, projectId: true },
      });
      if (story) {
        const author = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        const actorName = author?.name ?? 'Someone';
        const recipientIds = await resolveMentionedMembers({
          mentionedIds: newMentions,
          projectId: story.projectId,
          authorId: userId,
        });
        if (recipientIds.length > 0) {
          await notificationService.dispatchToUsers(recipientIds, {
            storyId: existing.storyId,
            storyKey: story.key,
            storyTitle: story.title,
            actorId: userId,
            actorName,
            type: 'story_mentioned',
            title: `${actorName} mentioned you on ${story.key}`,
            emailHeadline: 'mentioned you in a comment',
            commentId: id,
            commentExcerpt: tiptapPlainText(body),
          });
        }
      }
    }

    return commentModel.listByStory(existing.storyId).then((all) => all.find((c) => c.id === id));
  },

  async remove(id: string, userId: string, isAdmin: boolean) {
    const existing = await commentModel.findById(id);
    if (!existing) throw ErrorResponse.notFound('Comment not found');
    if (!isAdmin && existing.authorId !== userId) {
      throw ErrorResponse.forbidden('Only the author can delete their comment');
    }
    const deleted = await commentModel.delete(id);
    await activityService.log({
      storyId: existing.storyId,
      actorId: userId,
      event: 'comment_deleted',
    });
    return deleted;
  },
};
