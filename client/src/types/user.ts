// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import type { GlobalRole, ProjectRole } from '@/features/auth/permissions';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  // M4: globalRole removed. A tenant's role comes from the active org
  // (activeOrg.role) or, on admin lists, the per-member orgRole below.
  orgRole?: GlobalRole;
  // Phase 13: platform operator flag, served by /auth/me. Distinct from
  // globalRole — gates the /superadmin dashboard, not tenant permissions.
  isSuperAdmin: boolean;
  disabledAt: string | null;
  // External "unlinked" user — a JIRA person imported for truthful attribution
  // who has no real account. Rendered as "Name (unlinked)"; never a real member.
  isExternal?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserProjectMembership {
  membershipId: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  projectRole: ProjectRole;
  joinedAt: string;
}

export interface UserDetail {
  user: User;
  projects: UserProjectMembership[];
}
