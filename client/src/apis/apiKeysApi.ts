// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { httpClient } from '@/config/httpClient';
import { urls } from '@/config/urls';

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyInput {
  name: string;
  expiresAt?: string | null;
}

export interface CreateApiKeyResponse {
  key: ApiKey;
  plaintext: string;
}

export const apiKeysApi = {
  async list(): Promise<ApiKey[]> {
    const { data } = await httpClient.get<{ keys: ApiKey[] }>(urls.apiKeys.list);
    return data.keys;
  },

  async create(input: CreateApiKeyInput): Promise<CreateApiKeyResponse> {
    const { data } = await httpClient.post<CreateApiKeyResponse>(urls.apiKeys.create, input);
    return data;
  },

  async revoke(id: string): Promise<ApiKey> {
    const { data } = await httpClient.delete<{ key: ApiKey }>(urls.apiKeys.revoke(id));
    return data.key;
  },
};
