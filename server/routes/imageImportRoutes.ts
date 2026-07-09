// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { requireEntitlement } from '../middlewares/entitlements.js';
import { uploadHandler } from '../middlewares/uploadHandler.js';
import {
  createDraft,
  getImageImport,
  listByProject,
  updateAnnotations,
  updateDraft,
  generateDraft,
  commitImageImport,
  discardImageImport,
} from '../controllers/imageImport/imageImportController.js';

const router = Router();

router.use(authHandler);
// Phase 13: image AI-import is gated by the org's aiImageImport entitlement.
router.use(requireEntitlement('aiImageImport'));

router.post('/', uploadHandler.single('file'), createDraft);
router.get('/', listByProject);
router.get('/:id', getImageImport);
router.patch('/:id/annotations', updateAnnotations);
router.patch('/:id/draft', updateDraft);
router.post('/:id/generate', generateDraft);
router.post('/:id/commit', commitImageImport);
router.delete('/:id', discardImageImport);

export default router;
