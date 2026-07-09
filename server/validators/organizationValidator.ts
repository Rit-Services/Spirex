// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { z } from 'zod';

// Entitlements are validated permissively as a boolean map; the service's
// normalizeEntitlements() drops any key it doesn't recognise, so unknown flags
// can never reach the DB. This keeps the validator from duplicating the
// canonical key list in utils/entitlements.ts.
const entitlementsSchema = z.record(z.boolean());

// Superadmin command-bar query. `q` is optional so an empty box is a valid
// (empty-result) request rather than a 400.
export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(''),
});

export const createOrgSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/, 'Slug must be letters, numbers, and dashes'),
  maxUsers: z.number().int().min(1).max(100000),
  entitlements: entitlementsSchema.optional(),
});

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/, 'Slug must be letters, numbers, and dashes')
    .optional(),
  maxUsers: z.number().int().min(1).max(100000).optional(),
  entitlements: entitlementsSchema.optional(),
  url: z.string().max(300).optional().nullable(),
});

// Tenant self-service: the org admin edits only name + website (logo is a
// separate multipart upload). No maxUsers/entitlements — those stay superadmin-only.
export const updateOrgSelfSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  url: z.string().max(300).optional().nullable(),
});

export const createSuperAdminSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const adminIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const orgIdParamsSchema = z.object({
  id: z.string().min(1),
});

// ── Members (superadmin provisioning) ────────────────────────────────────────
export const createMemberSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    password: z.string().min(8).max(200).optional(),
    mode: z.enum(['password', 'invite']).default('password'),
    role: z.enum(['admin', 'member', 'external']).default('admin'),
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

export const memberRoleSchema = z.object({
  role: z.enum(['admin', 'member', 'external']),
});

// Superadmin "invite existing user" flow (mirrors the tenant-admin invite, but
// targets the org in the path rather than req.orgContext). The live email
// lookup powers the dialog's create-new-vs-invite-existing branching.
export const lookupMemberQuerySchema = z.object({
  email: z.string().trim().min(1).max(320),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120).optional(),
  role: z.enum(['admin', 'member', 'external']).default('member'),
});

export const memberParamsSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
