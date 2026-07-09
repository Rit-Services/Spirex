// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

export class ErrorResponse extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 500, details?: unknown) {
    super(message);
    this.name = 'ErrorResponse';
    this.status = status;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new ErrorResponse(message, 400, details);
  }
  static unauthorized(message = 'Unauthorized') {
    return new ErrorResponse(message, 401);
  }
  static forbidden(message = 'Forbidden') {
    return new ErrorResponse(message, 403);
  }
  static notFound(message = 'Not found') {
    return new ErrorResponse(message, 404);
  }
  static conflict(message = 'Conflict') {
    return new ErrorResponse(message, 409);
  }
  static internal(message = 'Internal server error') {
    return new ErrorResponse(message, 500);
  }
}
