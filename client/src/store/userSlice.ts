// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  userApi,
  type CreateUserInput,
  type CreateUserResult,
  type DirectoryUser,
  type InviteMemberInput,
  type InviteMemberResult,
  type PendingInvite,
} from '@/apis/userApi';
import { extractError } from '@/config/httpClient';
import type { User, UserDetail } from '@/types/user';

interface UserState {
  list: User[];
  pendingInvites: PendingInvite[];
  directory: DirectoryUser[];
  loading: boolean;
  error: string | null;
  currentDetail: UserDetail | null;
  detailLoading: boolean;
  detailError: string | null;
}

const initialState: UserState = {
  list: [],
  pendingInvites: [],
  directory: [],
  loading: false,
  error: null,
  currentDetail: null,
  detailLoading: false,
  detailError: null,
};

export const fetchUsersThunk = createAsyncThunk<User[], void, { rejectValue: string }>(
  'users/fetch',
  async (_arg, { rejectWithValue }) => {
    try {
      return await userApi.list();
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const fetchUserDetailThunk = createAsyncThunk<UserDetail, string, { rejectValue: string }>(
  'users/fetchDetail',
  async (id, { rejectWithValue }) => {
    try {
      return await userApi.getById(id);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const fetchUserDirectoryThunk = createAsyncThunk<
  DirectoryUser[],
  void,
  { rejectValue: string }
>('users/directory', async (_arg, { rejectWithValue }) => {
  try {
    return await userApi.directory();
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const createUserThunk = createAsyncThunk<CreateUserResult, CreateUserInput, { rejectValue: string }>(
  'users/create',
  async (input, { rejectWithValue }) => {
    try {
      return await userApi.create(input);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

// Invite by email. Membership is created when the invitee ACCEPTS, so there's
// nothing to add to the list here — the page just shows a confirmation toast.
export const inviteMemberThunk = createAsyncThunk<
  InviteMemberResult,
  InviteMemberInput,
  { rejectValue: string }
>('users/invite', async (input, { rejectWithValue }) => {
  try {
    return await userApi.invite(input);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

// Pending invites are the admin's "who hasn't accepted yet" view. They live
// alongside the member list but aren't members until they accept.
export const fetchPendingInvitesThunk = createAsyncThunk<
  PendingInvite[],
  void,
  { rejectValue: string }
>('users/fetchPendingInvites', async (_arg, { rejectWithValue }) => {
  try {
    return await userApi.listPendingInvites();
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

// Resend mints a fresh token + expiry; we match the row by email (stable across
// the re-issue, since the invite id changes) to refresh its expiry in place.
export const resendInviteThunk = createAsyncThunk<
  { email: string; expiresAt: string; emailSent: boolean; emailReason?: string },
  string,
  { rejectValue: string }
>('users/resendInvite', async (id, { rejectWithValue }) => {
  try {
    const res = await userApi.resendInvite(id);
    return { email: res.recipient.email, ...res.invite };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const disableUserThunk = createAsyncThunk<User, string, { rejectValue: string }>(
  'users/disable',
  async (id, { rejectWithValue }) => {
    try {
      return await userApi.disable(id);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const enableUserThunk = createAsyncThunk<User, string, { rejectValue: string }>(
  'users/enable',
  async (id, { rejectWithValue }) => {
    try {
      return await userApi.enable(id);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const resetUserPasswordThunk = createAsyncThunk<
  { id: string; tempPassword: string },
  string,
  { rejectValue: string }
>('users/resetPassword', async (id, { rejectWithValue }) => {
  try {
    const tempPassword = await userApi.resetPassword(id);
    return { id, tempPassword };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const updateGlobalRoleThunk = createAsyncThunk<
  User,
  { id: string; globalRole: 'admin' | 'member' | 'external' },
  { rejectValue: string }
>('users/updateGlobalRole', async ({ id, globalRole }, { rejectWithValue }) => {
  try {
    return await userApi.updateGlobalRole(id, globalRole);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const updateUserNameThunk = createAsyncThunk<
  User,
  { id: string; name: string },
  { rejectValue: string }
>('users/updateName', async ({ id, name }, { rejectWithValue }) => {
  try {
    return await userApi.updateName(id, name);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const sendPasswordResetEmailThunk = createAsyncThunk<
  { id: string; url: string; expiresAt: string; emailSent: boolean; emailReason?: string },
  string,
  { rejectValue: string }
>('users/sendPasswordResetEmail', async (id, { rejectWithValue }) => {
  try {
    const reset = await userApi.sendPasswordResetEmail(id);
    return { id, ...reset };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

const userSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    clearUserDetail: (state) => {
      state.currentDetail = null;
      state.detailError = null;
      state.detailLoading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsersThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUsersThunk.fulfilled, (state, action: PayloadAction<User[]>) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchUsersThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to load users';
      })
      .addCase(fetchUserDetailThunk.pending, (state) => {
        state.detailLoading = true;
        state.detailError = null;
      })
      .addCase(fetchUserDetailThunk.fulfilled, (state, action: PayloadAction<UserDetail>) => {
        state.detailLoading = false;
        state.currentDetail = action.payload;
      })
      .addCase(fetchUserDetailThunk.rejected, (state, action) => {
        state.detailLoading = false;
        state.detailError = action.payload ?? 'Failed to load user';
      })
      .addCase(createUserThunk.fulfilled, (state, action: PayloadAction<CreateUserResult>) => {
        state.list.push(action.payload.user);
      })
      // Merge (don't replace) so org-scoped fields like orgRole — which the
      // mutation endpoints don't echo back — survive the update.
      .addCase(disableUserThunk.fulfilled, (state, action: PayloadAction<User>) => {
        const i = state.list.findIndex((u) => u.id === action.payload.id);
        if (i >= 0) state.list[i] = { ...state.list[i], ...action.payload };
      })
      .addCase(enableUserThunk.fulfilled, (state, action: PayloadAction<User>) => {
        const i = state.list.findIndex((u) => u.id === action.payload.id);
        if (i >= 0) state.list[i] = { ...state.list[i], ...action.payload };
      })
      .addCase(updateGlobalRoleThunk.fulfilled, (state, action) => {
        const i = state.list.findIndex((u) => u.id === action.payload.id);
        // The membership role IS the value we just set; reflect it in orgRole
        // (globalRole may be intentionally left stale for a multi-org user).
        if (i >= 0) {
          state.list[i] = { ...state.list[i], ...action.payload, orgRole: action.meta.arg.globalRole };
        }
      })
      .addCase(updateUserNameThunk.fulfilled, (state, action: PayloadAction<User>) => {
        const i = state.list.findIndex((u) => u.id === action.payload.id);
        if (i >= 0) state.list[i] = action.payload;
        // Keep the open detail view in sync if it's the same user.
        if (state.currentDetail?.user.id === action.payload.id) {
          state.currentDetail.user = { ...state.currentDetail.user, name: action.payload.name };
        }
      })
      .addCase(fetchUserDirectoryThunk.fulfilled, (state, action: PayloadAction<DirectoryUser[]>) => {
        state.directory = action.payload;
      })
      .addCase(
        fetchPendingInvitesThunk.fulfilled,
        (state, action: PayloadAction<PendingInvite[]>) => {
          state.pendingInvites = action.payload;
        },
      )
      .addCase(resendInviteThunk.fulfilled, (state, action) => {
        const inv = state.pendingInvites.find((p) => p.email === action.payload.email);
        if (inv) inv.expiresAt = action.payload.expiresAt;
      });
  },
});

export const { clearUserDetail } = userSlice.actions;

export default userSlice.reducer;
