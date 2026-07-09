// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { User } from '@/types/user';
import type { ActiveOrg, OrgMembershipSummary } from '@/types/organization';

// Login and /me both return the user plus their active organization (Phase 13)
// and the full list of orgs they belong to (Phase 2, drives the switcher).
// `org` is null and `memberships` empty for the superadmin.
export interface AuthResult {
  user: User;
  org: ActiveOrg | null;
  memberships: OrgMembershipSummary[];
}

export const authApi = {
  async login(email: string, password: string): Promise<AuthResult> {
    const { data } = await httpClient.post<AuthResult>(urls.auth.login, { email, password });
    return data;
  },

  async logout(): Promise<void> {
    await httpClient.post(urls.auth.logout);
  },

  async me(): Promise<AuthResult> {
    const { data } = await httpClient.get<AuthResult>(urls.auth.me);
    return data;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const { data } = await httpClient.post<{ message: string }>(urls.auth.changePassword, {
      currentPassword,
      newPassword,
    });
    return data;
  },

  /** Update the signed-in user's own display name. */
  async updateProfile(name: string): Promise<User> {
    const { data } = await httpClient.patch<{ user: User }>(urls.auth.me, { name });
    return data.user;
  },

  /** Which SSO providers are configured (drives the login-page buttons). */
  async ssoProviders(): Promise<string[]> {
    const { data } = await httpClient.get<{ providers: string[] }>(urls.auth.sso.providers);
    return data.providers;
  },

  /** The signed-in user's linked SSO identities (profile page). */
  async ssoIdentities(): Promise<SsoIdentity[]> {
    const { data } = await httpClient.get<{ identities: SsoIdentity[] }>(urls.auth.sso.identities);
    return data.identities;
  },

  /** Unlink a provider. Password-confirmed server-side (lockout guard). */
  async ssoDisconnect(provider: string, currentPassword: string): Promise<void> {
    await httpClient.delete(urls.auth.sso.identity(provider), { data: { currentPassword } });
  },
};

export interface SsoIdentity {
  provider: string;
  email: string;
  linkedAt: string;
}
