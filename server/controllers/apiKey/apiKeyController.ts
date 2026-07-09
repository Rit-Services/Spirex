// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { apiKeyService } from '../../services/apiKey/apiKeyService.js';
import { ErrorResponse } from '../../utils/errorResponse.js';

export const apiKeyController = {
  async list(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const keys = await apiKeyService.list(req.user.id);
    res.json({ keys });
  },

  async create(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const { key, plaintext } = await apiKeyService.create({
      userId: req.user.id,
      name: req.body.name,
      expiresAt: req.body.expiresAt ?? null,
    });
    // plaintext is returned ONCE — the caller must store it now.
    res.status(201).json({ key, plaintext });
  },

  async revoke(req: Request, res: Response) {
    if (!req.user) throw ErrorResponse.unauthorized();
    const key = await apiKeyService.revoke(req.params.id, req.user.id);
    res.json({ key });
  },
};
