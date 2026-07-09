// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { organizationModel } from '../../models/org/organization.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { storage } from '../../services/storage/index.js';
import { logoUrlFor } from '../../utils/logoUrl.js';
import {
  defaultEntitlements,
  normalizeEntitlements,
  type Entitlements,
} from '../../utils/entitlements.js';
import type { Organization, OrgStatus, Prisma } from '@prisma/client';

type OrgWithCount = Organization & { _count: { memberships: number; projects: number } };

// Flatten Prisma's _count into the seat/project counters the dashboard renders.
// logoPath (internal storage key) is never exposed; clients get a computed
// logoUrl they can render directly (<img>, cookie-authed like attachments).
function serialize(org: OrgWithCount) {
  const { _count, logoPath, ...rest } = org;
  return {
    ...rest,
    logoUrl: logoUrlFor(org.id, logoPath),
    seatsUsed: _count.memberships,
    projectCount: _count.projects,
  };
}

// png/jpeg/webp/gif only — the controller validates the mime and passes the ext.
const LOGO_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
export function logoMimeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return LOGO_MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

// Orgs are addressed by slug in URLs/headers, so normalise to a predictable
// lowercase, dash-separated form regardless of how the operator types it.
function normalizeSlug(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw ErrorResponse.badRequest('Slug must contain at least one letter or number');
  return slug;
}

interface CreateOrgInput {
  name: string;
  slug: string;
  maxUsers: number;
  entitlements?: Entitlements;
}

interface UpdateOrgInput {
  name?: string;
  slug?: string;
  maxUsers?: number;
  entitlements?: Entitlements;
  url?: string | null;
}

export const organizationService = {
  async list() {
    const orgs = await organizationModel.listWithUsage();
    return orgs.map(serialize);
  },

  async getById(id: string) {
    const org = await organizationModel.findById(id);
    if (!org) throw ErrorResponse.notFound('Organization not found');
    return serialize(org);
  },

  /** Name/slug lookup for the superadmin command bar. */
  async search(q: string, limit = 6) {
    const orgs = await organizationModel.search(q, limit);
    return orgs.map(serialize);
  },

  async create(input: CreateOrgInput) {
    // Single-organization edition (D6): this build runs exactly one org — the
    // one bootstrapped on first run. Refusing a second org here (the only
    // runtime creation path) is what keeps cross-org invites and the org
    // switcher structurally unreachable, while all org plumbing
    // (organizationId scoping, orgContext) stays intact.
    if ((await organizationModel.count()) > 0) {
      throw ErrorResponse.conflict(
        'This edition of SPIREX is single-organization — an organization already exists',
      );
    }

    const slug = normalizeSlug(input.slug);
    const existing = await organizationModel.findBySlug(slug);
    if (existing) throw ErrorResponse.conflict('An organization with that slug already exists');

    const org = await organizationModel.create({
      name: input.name.trim(),
      slug,
      maxUsers: input.maxUsers,
      entitlements: normalizeEntitlements(
        input.entitlements ?? defaultEntitlements(),
      ) as Prisma.InputJsonValue,
    });
    return serialize(org);
  },

  async update(id: string, input: UpdateOrgInput) {
    const org = await organizationModel.findById(id);
    if (!org) throw ErrorResponse.notFound('Organization not found');

    const data: Prisma.OrganizationUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.url !== undefined) data.url = input.url?.trim() || null;
    if (input.slug !== undefined) {
      const slug = normalizeSlug(input.slug);
      if (slug !== org.slug) {
        const existing = await organizationModel.findBySlug(slug);
        if (existing && existing.id !== id) {
          throw ErrorResponse.conflict('An organization with that slug already exists');
        }
        data.slug = slug;
      }
    }
    if (input.maxUsers !== undefined) {
      // The seat cap can't drop below seats already filled — that would put the
      // org permanently over-subscribed. (Full seat enforcement on add is Step 5;
      // this just keeps the limit coherent with reality.)
      if (input.maxUsers < org._count.memberships) {
        throw ErrorResponse.badRequest(
          `Seat limit can't be below current usage (${org._count.memberships} in use)`,
        );
      }
      data.maxUsers = input.maxUsers;
    }
    if (input.entitlements !== undefined) {
      data.entitlements = normalizeEntitlements(input.entitlements) as Prisma.InputJsonValue;
    }

    const updated = await organizationModel.update(id, data);
    return serialize(updated);
  },

  async setStatus(id: string, status: OrgStatus) {
    const org = await organizationModel.findById(id);
    if (!org) throw ErrorResponse.notFound('Organization not found');
    if (org.status === status) return serialize(org);
    const updated = await organizationModel.update(id, { status });
    return serialize(updated);
  },

  /** Upload/replace an org's logo. Stores the file and records its storage key. */
  async setLogo(id: string, input: { buffer: Buffer; ext: string }) {
    const org = await organizationModel.findById(id);
    if (!org) throw ErrorResponse.notFound('Organization not found');
    // Best-effort cleanup of the previous logo so we don't orphan files.
    if (org.logoPath) await storage.remove(org.logoPath).catch(() => {});
    const destKey = `org-logos/${id}-${Date.now()}.${input.ext}`;
    const logoPath = await storage.save({ buffer: input.buffer, destKey });
    const updated = await organizationModel.update(id, { logoPath });
    return serialize(updated);
  },
};
