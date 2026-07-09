// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { authApi, type AuthResult } from '@/apis/authApi';
import { extractError } from '@/config/httpClient';
import type { User } from '@/types/user';
import type { ActiveOrg, OrgMembershipSummary } from '@/types/organization';
import { seedActiveOrgId, setActiveOrgId, clearActiveOrgId } from '@/config/activeOrg';

interface AuthState {
  user: User | null;
  // Phase 13: the user's active organization (null for the superadmin). Drives
  // entitlement gating in the tenant UI.
  activeOrg: ActiveOrg | null;
  // Phase 2: every org the user belongs to (drives the switcher). Empty for the
  // superadmin and for single-org users with nothing to switch to.
  memberships: OrgMembershipSummary[];
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  activeOrg: null,
  memberships: [],
  status: 'idle',
  error: null,
};

export const loginThunk = createAsyncThunk<
  AuthResult,
  { email: string; password: string },
  { rejectValue: string }
>('auth/login', async ({ email, password }, { rejectWithValue }) => {
  try {
    const result = await authApi.login(email, password);
    // Fresh sign-in pins this tab to the resolved (default) org.
    if (result.org) setActiveOrgId(result.org.id);
    return result;
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const fetchMeThunk = createAsyncThunk<AuthResult, void, { rejectValue: string }>(
  'auth/me',
  async (_arg, { rejectWithValue }) => {
    try {
      const result = await authApi.me();
      // Don't clobber a selection the switcher already made in this tab; only
      // pin when the tab is fresh (no selection yet).
      if (result.org) seedActiveOrgId(result.org.id);
      return result;
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const updateProfileThunk = createAsyncThunk<User, { name: string }, { rejectValue: string }>(
  'auth/updateProfile',
  async ({ name }, { rejectWithValue }) => {
    try {
      return await authApi.updateProfile(name);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const logoutThunk = createAsyncThunk('auth/logout', async () => {
  await authApi.logout();
  clearActiveOrgId();
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError(state) {
      state.error = null;
    },
    /**
     * Force the slice into the unauthenticated state without hitting the
     * server. Used by the 401 axios interceptor when the JWT cookie has
     * expired — calling `logoutThunk` from there would just 401 again.
     */
    setUnauthenticated(state) {
      state.status = 'unauthenticated';
      state.user = null;
      state.activeOrg = null;
      state.memberships = [];
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action: PayloadAction<AuthResult>) => {
        state.status = 'authenticated';
        state.user = action.payload.user;
        state.activeOrg = action.payload.org;
        state.memberships = action.payload.memberships;
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.status = 'unauthenticated';
        state.error = action.payload ?? 'Login failed';
      })
      .addCase(fetchMeThunk.pending, (state) => {
        if (state.status === 'idle') state.status = 'loading';
      })
      .addCase(fetchMeThunk.fulfilled, (state, action: PayloadAction<AuthResult>) => {
        state.status = 'authenticated';
        state.user = action.payload.user;
        state.activeOrg = action.payload.org;
        state.memberships = action.payload.memberships;
        state.error = null;
      })
      .addCase(fetchMeThunk.rejected, (state) => {
        state.status = 'unauthenticated';
        state.user = null;
        state.activeOrg = null;
        state.memberships = [];
      })
      .addCase(updateProfileThunk.fulfilled, (state, action: PayloadAction<User>) => {
        state.user = action.payload;
      })
      .addCase(logoutThunk.fulfilled, (state) => {
        state.status = 'unauthenticated';
        state.user = null;
        state.activeOrg = null;
        state.memberships = [];
      });
  },
});

export const { clearAuthError, setUnauthenticated } = authSlice.actions;
export default authSlice.reducer;
