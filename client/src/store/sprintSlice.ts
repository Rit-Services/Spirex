// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  sprintApi,
  type CreateSprintInput,
  type UpdateSprintInput,
} from '@/apis/sprintApi';
import { extractError } from '@/config/httpClient';
import type { Sprint } from '@/types/scrum';

interface SprintState {
  byProject: Record<string, Sprint[]>;
  loading: boolean;
  error: string | null;
}

const initialState: SprintState = { byProject: {}, loading: false, error: null };

export const fetchSprintsThunk = createAsyncThunk<
  { projectId: string; sprints: Sprint[] },
  string,
  { rejectValue: string }
>('sprints/fetch', async (projectId, { rejectWithValue }) => {
  try {
    const sprints = await sprintApi.list(projectId);
    return { projectId, sprints };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const createSprintThunk = createAsyncThunk<Sprint, CreateSprintInput, { rejectValue: string }>(
  'sprints/create',
  async (input, { rejectWithValue }) => {
    try {
      return await sprintApi.create(input);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const updateSprintThunk = createAsyncThunk<
  Sprint,
  { id: string; input: UpdateSprintInput },
  { rejectValue: string }
>('sprints/update', async ({ id, input }, { rejectWithValue }) => {
  try {
    return await sprintApi.update(id, input);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const startSprintThunk = createAsyncThunk<Sprint, string, { rejectValue: string }>(
  'sprints/start',
  async (id, { rejectWithValue }) => {
    try {
      return await sprintApi.start(id);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const completeSprintThunk = createAsyncThunk<
  { sprint: Sprint; createdSprint: Sprint | null },
  { id: string; incompleteTarget?: string },
  { rejectValue: string }
>('sprints/complete', async ({ id, incompleteTarget }, { rejectWithValue }) => {
  try {
    return await sprintApi.complete(id, { incompleteTarget });
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const deleteSprintThunk = createAsyncThunk<
  { projectId: string; id: string },
  { projectId: string; id: string },
  { rejectValue: string }
>('sprints/delete', async ({ projectId, id }, { rejectWithValue }) => {
  try {
    await sprintApi.remove(id);
    return { projectId, id };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

function replaceInList(list: Sprint[] | undefined, sprint: Sprint): Sprint[] {
  if (!list) return [sprint];
  const i = list.findIndex((s) => s.id === sprint.id);
  if (i < 0) return [...list, sprint];
  const next = list.slice();
  next[i] = sprint;
  return next;
}

const sprintSlice = createSlice({
  name: 'sprints',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSprintsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSprintsThunk.fulfilled, (state, action: PayloadAction<{ projectId: string; sprints: Sprint[] }>) => {
        state.loading = false;
        state.byProject[action.payload.projectId] = action.payload.sprints;
      })
      .addCase(fetchSprintsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to load sprints';
      })
      .addCase(createSprintThunk.fulfilled, (state, action: PayloadAction<Sprint>) => {
        state.byProject[action.payload.projectId] = replaceInList(
          state.byProject[action.payload.projectId],
          action.payload,
        );
      })
      .addCase(updateSprintThunk.fulfilled, (state, action: PayloadAction<Sprint>) => {
        state.byProject[action.payload.projectId] = replaceInList(
          state.byProject[action.payload.projectId],
          action.payload,
        );
      })
      .addCase(startSprintThunk.fulfilled, (state, action: PayloadAction<Sprint>) => {
        state.byProject[action.payload.projectId] = replaceInList(
          state.byProject[action.payload.projectId],
          action.payload,
        );
      })
      .addCase(
        completeSprintThunk.fulfilled,
        (state, action: PayloadAction<{ sprint: Sprint; createdSprint: Sprint | null }>) => {
          const { sprint, createdSprint } = action.payload;
          let list = replaceInList(state.byProject[sprint.projectId], sprint);
          // If the sprint was completed by auto-creating a carry-over sprint,
          // fold that new planned sprint into the list too so every view sees it
          // without waiting on a refetch.
          if (createdSprint) list = replaceInList(list, createdSprint);
          state.byProject[sprint.projectId] = list;
        },
      )
      .addCase(deleteSprintThunk.fulfilled, (state, action) => {
        const { projectId, id } = action.payload;
        const list = state.byProject[projectId];
        if (list) state.byProject[projectId] = list.filter((s) => s.id !== id);
      });
  },
});

export default sprintSlice.reducer;
