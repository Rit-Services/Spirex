// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { User } from '@/types/user';

// How the accept page should behave:
//  - 'set_password' → brand-new account: collect a password.
//  - 'join_org'     → existing account invited into another org: one-click join.
export type InviteMode = 'set_password' | 'join_org';

export interface InviteSummary {
  user: { name: string; email: string };
  // The org this invite grants membership into (null for a legacy
  // password-reset invite with no org attached).
  organization: { id: string; name: string; slug: string } | null;
  mode: InviteMode;
  expiresAt: string;
}

export interface AcceptInviteResult {
  user: User;
  // The org the user just joined, so the client can pin it as the active org.
  organizationId: string | null;
}

export const inviteApi = {
  async validate(token: string): Promise<InviteSummary> {
    const { data } = await httpClient.get<InviteSummary>(urls.auth.invite(token));
    return data;
  },

  // Password is omitted for a 'join_org' invite (the account already exists).
  async accept(token: string, password?: string): Promise<AcceptInviteResult> {
    const { data } = await httpClient.post<AcceptInviteResult>(urls.auth.acceptInvite(token), {
      password,
    });
    return data;
  },
};
