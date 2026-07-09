// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

export type OrgStatus = 'active' | 'suspended';

export type EntitlementKey = 'aiVoiceImport' | 'aiDocImport' | 'aiImageImport' | 'aiEnhance';

export type Entitlements = Partial<Record<EntitlementKey, boolean>>;

export type OrgRole = 'admin' | 'member' | 'external';

// The signed-in user's active organization, returned by /auth/login and
// /auth/me. Null for the platform superadmin (no membership).
export interface ActiveOrg {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  maxUsers: number;
  logoUrl: string | null;
  url: string | null;
  entitlements: Entitlements;
  role: OrgRole;
}

// One entry per org the signed-in user belongs to, returned by /auth/login and
// /auth/me (Phase 2). Powers the org switcher; empty for the superadmin.
export interface OrgMembershipSummary {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  logoUrl: string | null;
  role: OrgRole;
}

// A member of an organization, as returned by the superadmin members endpoint
// and the tenant users list (write-through keeps globalRole == orgRole).
export interface OrgMember {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  globalRole: OrgRole;
  orgRole: OrgRole;
  disabledAt: string | null;
  membershipId: string;
  joinedAt: string;
}

// ── Superadmin command-bar search ──────────────────────────────────────────
// Lightweight hit shapes returned by GET /superadmin/search. Members carry the
// org they belong to so a click can jump straight to that org's detail page.
export interface OrgSearchHit {
  id: string;
  name: string;
  slug: string;
  status: OrgStatus;
  logoUrl: string | null;
  seatsUsed: number;
  maxUsers: number;
}

export interface MemberSearchHit {
  id: string;
  name: string;
  email: string;
  orgRole: OrgRole;
  organization: { id: string; name: string; slug: string };
}

export interface SuperAdminSearchResult {
  organizations: OrgSearchHit[];
  members: MemberSearchHit[];
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  maxUsers: number;
  entitlements: Entitlements;
  status: OrgStatus;
  // Branding.
  logoUrl: string | null;
  url: string | null;
  // Derived counters from the server (count of memberships / projects).
  seatsUsed: number;
  projectCount: number;
  createdAt: string;
  updatedAt: string;
}

// Display metadata for the entitlement toggles — mirrors the canonical key list
// in server/utils/entitlements.ts. Keep the two in sync when adding a flag.
export const ENTITLEMENTS: { key: EntitlementKey; label: string; description: string }[] = [
  {
    key: 'aiVoiceImport',
    label: 'AI voice import',
    description: 'Create stories from voice recordings.',
  },
  {
    key: 'aiDocImport',
    label: 'AI document import',
    description: 'Create stories from uploaded documents.',
  },
  {
    key: 'aiImageImport',
    label: 'AI image import',
    description: 'Create stories from images and screenshots.',
  },
  {
    key: 'aiEnhance',
    label: 'AI issue enhancement',
    description: 'Rewrite issues for clarity and auto-draft acceptance criteria.',
  },
];
