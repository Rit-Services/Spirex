// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';
import type { Organization } from '@/types/organization';

// Tenant-side: the org admin manages their own organization.
export const orgApi = {
  async getCurrent(): Promise<Organization> {
    const { data } = await httpClient.get<{ organization: Organization }>(urls.org.current);
    return data.organization;
  },

  async update(input: { name?: string; url?: string | null }): Promise<Organization> {
    const { data } = await httpClient.patch<{ organization: Organization }>(urls.org.update, input);
    return data.organization;
  },

  async uploadLogo(file: File): Promise<Organization> {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await httpClient.post<{ organization: Organization }>(urls.org.logo, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.organization;
  },
};
