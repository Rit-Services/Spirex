// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

/** Self-service profile edit — currently just the display name. */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(120),
});

// Disconnecting an SSO identity requires the current password: it proves the
// caller keeps a working sign-in method (lockout guard) AND that a hijacked
// session can't silently strip a sign-in factor.
export const ssoDisconnectSchema = z.object({
  currentPassword: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
