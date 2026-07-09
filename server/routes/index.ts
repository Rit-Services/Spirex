// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import logger from '../utils/logger.js';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import projectRoutes from './projectRoutes.js';
import epicRoutes from './epicRoutes.js';
import storyRoutes from './storyRoutes.js';
import sprintRoutes from './sprintRoutes.js';
import worklogRoutes from './worklogRoutes.js';
import commentRoutes from './commentRoutes.js';
import reportRoutes from './reportRoutes.js';
import attachmentRoutes from './attachmentRoutes.js';
import workflowRoutes from './workflowRoutes.js';
import labelRoutes from './labelRoutes.js';
import customFieldRoutes from './customFieldRoutes.js';
import searchRoutes from './searchRoutes.js';
import importRoutes from './importRoutes.js';
import imageImportRoutes from './imageImportRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import projectNotificationRoutes from './projectNotificationRoutes.js';
import myInvitesRoutes from './myInvitesRoutes.js';
import jiraRoutes from './jiraRoutes.js';
import webhookRoutes from './webhookRoutes.js';
import apiKeyRoutes from './apiKeyRoutes.js';
import internalRoutes from './internalRoutes.js';
import superadminRoutes from './superadminRoutes.js';
import orgRoutes from './orgRoutes.js';

const router = Router();

router.get('/health', async (_req, res) => {
  let dbStatus: 'connected' | 'disconnected' = 'connected';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.warn('health check DB ping failed', err);
    dbStatus = 'disconnected';
  }
  res.status(dbStatus === 'connected' ? 200 : 503).json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    db: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/projects', projectRoutes);
router.use('/epics', epicRoutes);
router.use('/stories', storyRoutes);
router.use('/sprints', sprintRoutes);
router.use('/worklogs', worklogRoutes);
router.use('/comments', commentRoutes);
router.use('/reports', reportRoutes);
router.use('/attachments', attachmentRoutes);
router.use('/search', searchRoutes);
router.use('/imports', importRoutes);
router.use('/image-imports', imageImportRoutes);
router.use('/jira', jiraRoutes);
router.use('/notifications', notificationRoutes);
router.use('/invites', myInvitesRoutes);
router.use('/api-keys', apiKeyRoutes);
router.use('/internal', internalRoutes);
router.use('/superadmin', superadminRoutes);
router.use('/org', orgRoutes);

router.use('/webhooks', webhookRoutes);
// Workflow routes mount at the root because they declare full paths
// (GET /projects/:projectId/workflow, PATCH /workflow-statuses/:id).
router.use('/', workflowRoutes);
// Label routes — same root-mount, full paths
// (GET/POST /projects/:projectId/labels, PATCH/DELETE /labels/:id).
router.use('/', labelRoutes);
// Custom field routes follow the same root-mount pattern
// (GET /projects/:projectId/custom-fields, PATCH /custom-fields/:id).
router.use('/', customFieldRoutes);
// Project-scoped email notification prefs — same root-mount, full paths
// (GET/PUT /projects/:projectId/notification-preferences[/:userId]).
router.use('/', projectNotificationRoutes);

export default router;
