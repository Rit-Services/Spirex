// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type {
  Entitlements,
  Organization,
  OrgMember,
  OrgRole,
  SuperAdminSearchResult,
} from '@/types/organization';
import type { User } from '@/types/user';

export interface UpdateOrgInput {
  name?: string;
  slug?: string;
  maxUsers?: number;
  entitlements?: Entitlements;
  url?: string | null;
}

export interface AddMemberInput {
  name: string;
  email: string;
  role: OrgRole;
  mode: 'password' | 'invite';
  password?: string;
}

export interface MembersResult {
  members: OrgMember[];
  maxUsers: number;
  seatsUsed: number;
}

export interface MemberLookupResult {
  exists: boolean;
  alreadyMember: boolean;
  name?: string;
}

export interface InviteMemberInput {
  email: string;
  name?: string;
  role: OrgRole;
}

export interface InviteMemberResult {
  recipient: { name: string; email: string };
  invite: {
    mode: 'set_password' | 'join_org';
    url: string;
    expiresAt: string;
    emailSent: boolean;
    emailReason?: string;
  };
}

export const superadminApi = {
  async search(q: string): Promise<SuperAdminSearchResult> {
    const { data } = await httpClient.get<SuperAdminSearchResult>(urls.superadmin.search, {
      params: { q },
    });
    return data;
  },

  async listOrgs(): Promise<Organization[]> {
    const { data } = await httpClient.get<{ organizations: Organization[] }>(
      urls.superadmin.organizations,
    );
    return data.organizations;
  },

  async getOrg(id: string): Promise<Organization> {
    const { data } = await httpClient.get<{ organization: Organization }>(
      urls.superadmin.organization(id),
    );
    return data.organization;
  },

  // Single-organization edition (D6): no createOrg — the one org is
  // bootstrapped on first run, and the server refuses to create a second.

  async updateOrg(id: string, input: UpdateOrgInput): Promise<Organization> {
    const { data } = await httpClient.patch<{ organization: Organization }>(
      urls.superadmin.organization(id),
      input,
    );
    return data.organization;
  },

  async suspendOrg(id: string): Promise<Organization> {
    const { data } = await httpClient.post<{ organization: Organization }>(
      urls.superadmin.suspend(id),
    );
    return data.organization;
  },

  async reactivateOrg(id: string): Promise<Organization> {
    const { data } = await httpClient.post<{ organization: Organization }>(
      urls.superadmin.reactivate(id),
    );
    return data.organization;
  },

  async listMembers(orgId: string): Promise<MembersResult> {
    const { data } = await httpClient.get<MembersResult>(urls.superadmin.members(orgId));
    return data;
  },

  async addMember(
    orgId: string,
    input: AddMemberInput,
  ): Promise<{ invite?: { url: string; emailSent: boolean } }> {
    const { data } = await httpClient.post<{ invite?: { url: string; emailSent: boolean } }>(
      urls.superadmin.members(orgId),
      input,
    );
    return data;
  },

  // Live "does this email already have an account / is it already a member here?"
  // check that drives the invite dialog's create-vs-invite branching.
  async lookupMember(orgId: string, email: string): Promise<MemberLookupResult> {
    const { data } = await httpClient.get<MemberLookupResult>(
      urls.superadmin.memberLookup(orgId, email),
    );
    return data;
  },

  // Invite an existing-or-new account into this org (cross-org join / set-password).
  async inviteMember(orgId: string, input: InviteMemberInput): Promise<InviteMemberResult> {
    const { data } = await httpClient.post<InviteMemberResult>(
      urls.superadmin.invites(orgId),
      input,
    );
    return data;
  },

  async setMemberRole(orgId: string, userId: string, role: OrgRole): Promise<void> {
    await httpClient.patch(urls.superadmin.member(orgId, userId), { role });
  },

  async removeMember(orgId: string, userId: string): Promise<void> {
    await httpClient.delete(urls.superadmin.member(orgId, userId));
  },

  async uploadOrgLogo(orgId: string, file: File): Promise<Organization> {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await httpClient.post<{ organization: Organization }>(
      urls.superadmin.orgLogo(orgId),
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data.organization;
  },

  async listAdmins(): Promise<User[]> {
    const { data } = await httpClient.get<{ admins: User[] }>(urls.superadmin.admins);
    return data.admins;
  },

  async createAdmin(input: { name: string; email: string; password: string }): Promise<void> {
    await httpClient.post(urls.superadmin.admins, input);
  },

  async revokeAdmin(id: string): Promise<void> {
    await httpClient.delete(urls.superadmin.admin(id));
  },
};
