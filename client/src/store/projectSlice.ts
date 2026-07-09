// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import {
  projectApi,
  type CreateProjectInput,
  type UpdateProjectInput,
  type UnlinkedUser,
} from '@/apis/projectApi';
import { extractError } from '@/config/httpClient';
import type { Project, ProjectMember } from '@/types/project';
import type { ProjectRole } from '@/features/auth/permissions';

interface ProjectState {
  list: Project[];
  currentId: string | null;
  // Most-recently-selected project ids, newest first. Persisted so the project
  // switcher can float recent projects to the top across sessions.
  recentIds: string[];
  currentMembers: ProjectMember[];
  // External/ghost users (from JIRA import) with work in the current project,
  // awaiting an admin to link them to a real member.
  unlinkedUsers: UnlinkedUser[];
  loading: boolean;
  error: string | null;
}

const CURRENT_KEY = 'spirex-current-project';
const RECENT_KEY = 'spirex-recent-projects';
const RECENT_LIMIT = 8;

function loadInitialId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(CURRENT_KEY);
}

function loadInitialRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Move `id` to the front of the recents list (dedup, capped) and persist. */
function recordRecent(state: ProjectState, id: string): void {
  state.recentIds = [id, ...state.recentIds.filter((x) => x !== id)].slice(0, RECENT_LIMIT);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(state.recentIds));
  }
}

const initialState: ProjectState = {
  list: [],
  currentId: loadInitialId(),
  recentIds: loadInitialRecents(),
  currentMembers: [],
  unlinkedUsers: [],
  loading: false,
  error: null,
};

export const fetchProjectsThunk = createAsyncThunk<Project[], void, { rejectValue: string }>(
  'projects/fetch',
  async (_a, { rejectWithValue }) => {
    try {
      return await projectApi.list();
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const createProjectThunk = createAsyncThunk<Project, CreateProjectInput, { rejectValue: string }>(
  'projects/create',
  async (input, { rejectWithValue }) => {
    try {
      return await projectApi.create(input);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const updateProjectThunk = createAsyncThunk<
  Project,
  { id: string; input: UpdateProjectInput },
  { rejectValue: string }
>('projects/update', async ({ id, input }, { rejectWithValue }) => {
  try {
    return await projectApi.update(id, input);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const deleteProjectThunk = createAsyncThunk<string, string, { rejectValue: string }>(
  'projects/delete',
  async (id, { rejectWithValue }) => {
    try {
      await projectApi.remove(id);
      return id;
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const fetchMembersThunk = createAsyncThunk<
  ProjectMember[],
  string,
  { rejectValue: string }
>('projects/members/fetch', async (id, { rejectWithValue }) => {
  try {
    return await projectApi.listMembers(id);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const upsertMemberThunk = createAsyncThunk<
  ProjectMember,
  { projectId: string; userId: string; projectRole: ProjectRole },
  { rejectValue: string }
>('projects/members/upsert', async ({ projectId, userId, projectRole }, { rejectWithValue }) => {
  try {
    return await projectApi.upsertMember(projectId, { userId, projectRole });
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const removeMemberThunk = createAsyncThunk<
  { userId: string },
  { projectId: string; userId: string },
  { rejectValue: string }
>('projects/members/remove', async ({ projectId, userId }, { rejectWithValue }) => {
  try {
    await projectApi.removeMember(projectId, userId);
    return { userId };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const fetchUnlinkedUsersThunk = createAsyncThunk<
  UnlinkedUser[],
  string,
  { rejectValue: string }
>('projects/unlinked/fetch', async (projectId, { rejectWithValue }) => {
  try {
    return await projectApi.listUnlinkedUsers(projectId);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const linkUnlinkedUserThunk = createAsyncThunk<
  { ghostId: string; reassigned: number },
  { projectId: string; ghostId: string; targetUserId: string },
  { rejectValue: string }
>('projects/unlinked/link', async ({ projectId, ghostId, targetUserId }, { rejectWithValue }) => {
  try {
    const { reassigned } = await projectApi.linkUnlinkedUser(projectId, ghostId, targetUserId);
    return { ghostId, reassigned };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

const projectSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    setCurrentProject(state, action: PayloadAction<string | null>) {
      state.currentId = action.payload;
      if (action.payload) recordRecent(state, action.payload);
      if (typeof window !== 'undefined') {
        if (action.payload) window.localStorage.setItem(CURRENT_KEY, action.payload);
        else window.localStorage.removeItem(CURRENT_KEY);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProjectsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProjectsThunk.fulfilled, (state, action: PayloadAction<Project[]>) => {
        state.loading = false;
        state.list = action.payload;
        if (state.currentId && !action.payload.some((p) => p.id === state.currentId)) {
          state.currentId = action.payload[0]?.id ?? null;
        } else if (!state.currentId && action.payload.length > 0) {
          state.currentId = action.payload[0].id;
        }
      })
      .addCase(fetchProjectsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to load projects';
      })
      .addCase(createProjectThunk.fulfilled, (state, action: PayloadAction<Project>) => {
        state.list.push(action.payload);
        state.currentId = action.payload.id;
        recordRecent(state, action.payload.id);
      })
      .addCase(updateProjectThunk.fulfilled, (state, action: PayloadAction<Project>) => {
        const i = state.list.findIndex((p) => p.id === action.payload.id);
        if (i >= 0) state.list[i] = { ...state.list[i], ...action.payload };
      })
      .addCase(deleteProjectThunk.fulfilled, (state, action: PayloadAction<string>) => {
        state.list = state.list.filter((p) => p.id !== action.payload);
        if (state.recentIds.includes(action.payload)) {
          state.recentIds = state.recentIds.filter((id) => id !== action.payload);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(RECENT_KEY, JSON.stringify(state.recentIds));
          }
        }
        if (state.currentId === action.payload) {
          state.currentId = state.list[0]?.id ?? null;
          if (typeof window !== 'undefined') {
            if (state.currentId) window.localStorage.setItem(CURRENT_KEY, state.currentId);
            else window.localStorage.removeItem(CURRENT_KEY);
          }
        }
        state.currentMembers = [];
        state.unlinkedUsers = [];
      })
      .addCase(fetchMembersThunk.fulfilled, (state, action: PayloadAction<ProjectMember[]>) => {
        state.currentMembers = action.payload;
      })
      .addCase(upsertMemberThunk.fulfilled, (state, action: PayloadAction<ProjectMember>) => {
        const i = state.currentMembers.findIndex((m) => m.userId === action.payload.userId);
        if (i >= 0) state.currentMembers[i] = action.payload;
        else state.currentMembers.push(action.payload);
      })
      .addCase(removeMemberThunk.fulfilled, (state, action) => {
        state.currentMembers = state.currentMembers.filter((m) => m.userId !== action.payload.userId);
      })
      .addCase(fetchUnlinkedUsersThunk.fulfilled, (state, action: PayloadAction<UnlinkedUser[]>) => {
        state.unlinkedUsers = action.payload;
      })
      .addCase(linkUnlinkedUserThunk.fulfilled, (state, action) => {
        // The ghost's work in this project is now reassigned — drop it from the
        // list. Other projects (if any) still surface it under their own settings.
        state.unlinkedUsers = state.unlinkedUsers.filter((u) => u.id !== action.payload.ghostId);
      });
  },
});

export const { setCurrentProject } = projectSlice.actions;
export default projectSlice.reducer;
