// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { User, UserDetail } from '@/types/user';

export interface CreateUserInput {
  name: string;
  email: string;
  password?: string;
  mode?: 'password' | 'invite';
  globalRole?: 'admin' | 'member' | 'external';
}

export interface CreateUserResult {
  user: User;
  invite?: {
    url: string;
    expiresAt: string;
    emailSent: boolean;
    emailReason?: string;
  };
}

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface InviteMemberInput {
  email: string;
  // Only needed for a brand-new account; ignored when the email already exists.
  name?: string;
  globalRole?: 'admin' | 'member' | 'external';
}

export interface InviteMemberResult {
  recipient: { name: string; email: string };
  invite: {
    // 'set_password' = new account; 'join_org' = existing account, cross-org join.
    mode: 'set_password' | 'join_org';
    url: string;
    expiresAt: string;
    emailSent: boolean;
    emailReason?: string;
  };
}

/** A sent-but-not-yet-accepted invite, shown to the admin in the member list. */
export interface PendingInvite {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member' | 'external';
  expiresAt: string;
  createdAt: string;
}

export interface ResendInviteResult {
  recipient: { name: string; email: string };
  invite: { expiresAt: string; emailSent: boolean; emailReason?: string };
}

export const userApi = {
  async list(): Promise<User[]> {
    const { data } = await httpClient.get<{ users: User[] }>(urls.users.list);
    return data.users;
  },

  async directory(): Promise<DirectoryUser[]> {
    const { data } = await httpClient.get<{ users: DirectoryUser[] }>(urls.users.directory);
    return data.users;
  },

  async getById(id: string): Promise<UserDetail> {
    const { data } = await httpClient.get<UserDetail>(urls.users.detail(id));
    return data;
  },

  async create(input: CreateUserInput): Promise<CreateUserResult> {
    const { data } = await httpClient.post<CreateUserResult>(urls.users.create, input);
    return data;
  },

  /** Email-first invite into the active org (new account or cross-org join). */
  async invite(input: InviteMemberInput): Promise<InviteMemberResult> {
    const { data } = await httpClient.post<InviteMemberResult>(urls.users.invite, input);
    return data;
  },

  /** Admin: pending invites for the active org (sent, not yet accepted). */
  async listPendingInvites(): Promise<PendingInvite[]> {
    const { data } = await httpClient.get<{ invites: PendingInvite[] }>(urls.users.pendingInvites);
    return data.invites;
  },

  /** Admin: re-send a pending invite email (mints a fresh token + expiry). */
  async resendInvite(id: string): Promise<ResendInviteResult> {
    const { data } = await httpClient.post<ResendInviteResult>(urls.users.resendInvite(id));
    return data;
  },

  /** Live check: does this email already have an account / membership here? */
  async lookup(email: string): Promise<{ exists: boolean; alreadyMember: boolean; name?: string }> {
    const { data } = await httpClient.get<{ exists: boolean; alreadyMember: boolean; name?: string }>(
      urls.users.lookup(email),
    );
    return data;
  },

  async disable(id: string): Promise<User> {
    const { data } = await httpClient.patch<{ user: User }>(urls.users.disable(id));
    return data.user;
  },

  async enable(id: string): Promise<User> {
    const { data } = await httpClient.patch<{ user: User }>(urls.users.enable(id));
    return data.user;
  },

  async resetPassword(id: string): Promise<string> {
    const { data } = await httpClient.post<{ method: 'temp'; tempPassword: string }>(
      urls.users.resetPassword(id),
      { method: 'temp' },
    );
    return data.tempPassword;
  },

  async updateGlobalRole(id: string, globalRole: 'admin' | 'member' | 'external'): Promise<User> {
    const { data } = await httpClient.patch<{ user: User }>(urls.users.globalRole(id), { globalRole });
    return data.user;
  },

  /** Admin: update a user's display name. */
  async updateName(id: string, name: string): Promise<User> {
    const { data } = await httpClient.patch<{ user: User }>(urls.users.update(id), { name });
    return data.user;
  },

  async sendPasswordResetEmail(id: string): Promise<{
    url: string;
    expiresAt: string;
    emailSent: boolean;
    emailReason?: string;
  }> {
    const { data } = await httpClient.post<{
      method: 'email';
      reset: { url: string; expiresAt: string; emailSent: boolean; emailReason?: string };
    }>(urls.users.resetPassword(id), { method: 'email' });
    return data.reset;
  },
};
