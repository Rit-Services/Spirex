// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler, requirePermission } from '../middlewares/authHandler.js';
import {
  validateCredentials,
  listJiraProjects,
  previewImport,
  importJira,
  getConnection,
  deleteConnection,
} from '../controllers/jira/jiraController.js';

const router = Router();

// All endpoints require authentication AND `import:create` so external/client
// users (and any role without that permission) cannot validate creds, list
// projects, preview, or import.
router.use(authHandler);
router.use(requirePermission('import:create'));

// Saved per-user connection (token stored encrypted, never returned).
router.get('/connection', getConnection);
router.delete('/connection', deleteConnection);

router.post('/validate', validateCredentials);
router.post('/projects', listJiraProjects);
router.post('/preview', previewImport);
router.post('/import', importJira);

export default router;
