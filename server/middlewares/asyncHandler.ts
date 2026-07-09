// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { Request, Response, NextFunction, RequestHandler } from 'express';

export const asyncHandler =
  <Req extends Request = Request>(fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
