// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { OrgRole } from '@/types/organization';

// One pending cross-org invitation the signed-in user has received.
export interface PendingInvite {
  id: string;
  role: OrgRole;
  expiresAt: string;
  organization: { id: string; name: string; slug: string } | null;
}

export const invitesApi = {
  async listMine(): Promise<PendingInvite[]> {
    const { data } = await httpClient.get<{ invites: PendingInvite[] }>(urls.invites.mine);
    return data.invites;
  },

  // Returns the joined org id so the caller can pin it as the active org.
  async accept(id: string): Promise<{ organizationId: string | null }> {
    const { data } = await httpClient.post<{ organizationId: string | null }>(urls.invites.accept(id));
    return data;
  },

  async decline(id: string): Promise<void> {
    await httpClient.post(urls.invites.decline(id));
  },
};
