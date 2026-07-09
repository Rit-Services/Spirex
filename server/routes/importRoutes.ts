// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { requireEntitlement } from '../middlewares/entitlements.js';
import { uploadHandler } from '../middlewares/uploadHandler.js';
import {
  createDraft,
  getImport,
  listByProject,
  commitImport,
  discardImport,
} from '../controllers/import/importController.js';

const router = Router();

router.use(authHandler);
// Phase 13: document AI-import is gated by the org's aiDocImport entitlement.
router.use(requireEntitlement('aiDocImport'));

router.post('/', uploadHandler.single('file'), createDraft);
router.get('/', listByProject);
router.get('/:id', getImport);
router.post('/:id/commit', commitImport);
router.delete('/:id', discardImport);

export default router;
