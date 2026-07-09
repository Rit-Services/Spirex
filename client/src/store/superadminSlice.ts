// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { superadminApi, type UpdateOrgInput } from '@/apis/superadminApi';
import { extractError } from '@/config/httpClient';
import type { Organization } from '@/types/organization';

interface SuperadminState {
  orgs: Organization[];
  loading: boolean;
  error: string | null;
  current: Organization | null;
  detailLoading: boolean;
  detailError: string | null;
}

const initialState: SuperadminState = {
  orgs: [],
  loading: false,
  error: null,
  current: null,
  detailLoading: false,
  detailError: null,
};

export const fetchOrgsThunk = createAsyncThunk<Organization[], void, { rejectValue: string }>(
  'superadmin/fetchOrgs',
  async (_arg, { rejectWithValue }) => {
    try {
      return await superadminApi.listOrgs();
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const fetchOrgThunk = createAsyncThunk<Organization, string, { rejectValue: string }>(
  'superadmin/fetchOrg',
  async (id, { rejectWithValue }) => {
    try {
      return await superadminApi.getOrg(id);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

// Single-organization edition (D6): there is no createOrg thunk — the one org
// is bootstrapped on first run, and the server refuses to create a second.

export const updateOrgThunk = createAsyncThunk<
  Organization,
  { id: string; input: UpdateOrgInput },
  { rejectValue: string }
>('superadmin/updateOrg', async ({ id, input }, { rejectWithValue }) => {
  try {
    return await superadminApi.updateOrg(id, input);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const suspendOrgThunk = createAsyncThunk<Organization, string, { rejectValue: string }>(
  'superadmin/suspendOrg',
  async (id, { rejectWithValue }) => {
    try {
      return await superadminApi.suspendOrg(id);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const reactivateOrgThunk = createAsyncThunk<Organization, string, { rejectValue: string }>(
  'superadmin/reactivateOrg',
  async (id, { rejectWithValue }) => {
    try {
      return await superadminApi.reactivateOrg(id);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

// Keep both the list row and the open detail view in sync after any mutation.
function applyUpdate(state: SuperadminState, org: Organization) {
  const i = state.orgs.findIndex((o) => o.id === org.id);
  if (i >= 0) state.orgs[i] = org;
  if (state.current?.id === org.id) state.current = org;
}

const superadminSlice = createSlice({
  name: 'superadmin',
  initialState,
  reducers: {
    clearOrgDetail: (state) => {
      state.current = null;
      state.detailError = null;
      state.detailLoading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrgsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrgsThunk.fulfilled, (state, action: PayloadAction<Organization[]>) => {
        state.loading = false;
        state.orgs = action.payload;
      })
      .addCase(fetchOrgsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to load organizations';
      })
      .addCase(fetchOrgThunk.pending, (state) => {
        state.detailLoading = true;
        state.detailError = null;
      })
      .addCase(fetchOrgThunk.fulfilled, (state, action: PayloadAction<Organization>) => {
        state.detailLoading = false;
        state.current = action.payload;
      })
      .addCase(fetchOrgThunk.rejected, (state, action) => {
        state.detailLoading = false;
        state.detailError = action.payload ?? 'Failed to load organization';
      })
      .addCase(updateOrgThunk.fulfilled, (state, action: PayloadAction<Organization>) => {
        applyUpdate(state, action.payload);
      })
      .addCase(suspendOrgThunk.fulfilled, (state, action: PayloadAction<Organization>) => {
        applyUpdate(state, action.payload);
      })
      .addCase(reactivateOrgThunk.fulfilled, (state, action: PayloadAction<Organization>) => {
        applyUpdate(state, action.payload);
      });
  },
});

export const { clearOrgDetail } = superadminSlice.actions;

export default superadminSlice.reducer;
