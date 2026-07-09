// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { projectModel, projectMemberModel } from '../../models/project/project.js';
import { storyService } from '../story/storyService.js';
import { attachmentService } from '../attachment/attachmentService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import logger from '../../utils/logger.js';
import type { FeedbackWebhookPayload } from '../../validators/feedbackWebhookValidator.js';

async function resolveTargetProject(payloadKey: string) {
  const fallbackKey = process.env.FEEDBACK_DEFAULT_PROJECT_KEY;
  const requested = await projectModel.findByKey(payloadKey);
  if (requested) return requested;

  if (!fallbackKey) {
    throw ErrorResponse.notFound(
      `Project '${payloadKey}' not found and FEEDBACK_DEFAULT_PROJECT_KEY is not set`,
    );
  }
  const fallback = await projectModel.findByKey(fallbackKey);
  if (!fallback) {
    throw ErrorResponse.notFound(
      `Neither '${payloadKey}' nor fallback '${fallbackKey}' exist — create the project or update the env var`,
    );
  }
  logger.info(
    `feedback: project '${payloadKey}' not found, falling back to '${fallbackKey}'`,
  );
  return fallback;
}

export const feedbackService = {
  async ingest(payload: FeedbackWebhookPayload, reporterUserId: string) {
    const project = await resolveTargetProject(payload.project.key);

    const membership = await projectMemberModel.findForUser(project.id, reporterUserId);
    if (!membership) {
      throw ErrorResponse.forbidden(
        `API key owner is not a member of project '${project.key}'`,
      );
    }

    const story = await storyService.create(
      {
        projectId: project.id,
        title: payload.title,
        description: payload.description,
        type: 'bug',
        priority: 'medium',
        reporterId: reporterUserId,
      },
      reporterUserId,
    );
    if (!story) throw new ErrorResponse('Failed to create feedback story', 500);

    if (payload.screenshot) {
      try {
        const buffer = Buffer.from(payload.screenshot.base64, 'base64');
        if (buffer.byteLength === 0) throw new Error('decoded buffer is empty');
        await attachmentService.create({
          projectId: project.id,
          storyId: story.id,
          uploadedById: reporterUserId,
          filename: payload.screenshot.filename,
          mimetype: payload.screenshot.contentType,
          buffer,
        });
      } catch (err) {
        logger.warn(
          `feedback ${payload.feedbackId}: failed to attach screenshot — story ${story.key} created without it`,
          err,
        );
      }
    }

    return { storyId: story.id, storyKey: story.key, projectKey: project.key };
  },
};
