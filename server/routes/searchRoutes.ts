// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Router } from 'express';
import { authHandler } from '../middlewares/authHandler.js';
import { search } from '../controllers/search/searchController.js';

const router = Router();

router.get('/', authHandler, search);

export default router;
