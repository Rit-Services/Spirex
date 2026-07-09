// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

export const createUserSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    password: z.string().min(8).max(200).optional(),
    mode: z.enum(['password', 'invite']).default('password'),
    globalRole: z.enum(['admin', 'member', 'external']).optional(),
    avatarUrl: z.string().url().optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === 'password' && !val.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Password is required when mode is "password"',
      });
    }
  });

// Phase 2: admin invites someone into the active org by email. `name` is only
// needed when the email has no account yet (a brand-new person); the controller
// enforces that. `globalRole` is the org role to grant on accept.
export const inviteMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(120).optional(),
  globalRole: z.enum(['admin', 'member', 'external']).optional(),
});

// Password is optional now: a cross-org 'join_org' invite has no password step
// (the account already exists). The accept service requires it for new accounts.
export const acceptInviteSchema = z.object({
  password: z.string().min(8).max(200).optional(),
});

// Live "does this email already have an account?" check for the invite dialog.
export const lookupQuerySchema = z.object({
  email: z.string().email(),
});

export const inviteTokenParamsSchema = z.object({
  token: z.string().min(8),
});

export const userIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const resetPasswordSchema = z.object({
  method: z.enum(['temp', 'email']).default('temp'),
});

export const updateGlobalRoleSchema = z.object({
  globalRole: z.enum(['admin', 'member', 'external']),
});

/** Admin edit of a user's profile — currently just the display name. */
export const updateUserSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(120),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
