// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response } from 'express';
import { platformAdminService } from '../../services/superadmin/platformAdminService.js';
import { userService } from '../../services/user/userService.js';

export const platformAdminController = {
  async list(_req: Request, res: Response) {
    const admins = await platformAdminService.list();
    res.json({ admins });
  },

  async create(req: Request, res: Response) {
    const user = await platformAdminService.create(req.body);
    res.status(201).json({ user: userService.publicProfile(user) });
  },

  async revoke(req: Request, res: Response) {
    await platformAdminService.revoke(req.params.id);
    res.status(204).end();
  },
};
