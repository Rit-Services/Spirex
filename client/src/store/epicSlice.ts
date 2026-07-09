// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { epicApi, type CreateEpicInput, type UpdateEpicInput } from '@/apis/epicApi';
import { extractError } from '@/config/httpClient';
import type { Epic } from '@/types/scrum';

interface EpicState {
  byProject: Record<string, Epic[]>;
  loading: boolean;
  error: string | null;
}

const initialState: EpicState = { byProject: {}, loading: false, error: null };

export const fetchEpicsThunk = createAsyncThunk<
  { projectId: string; epics: Epic[] },
  string,
  { rejectValue: string }
>('epics/fetch', async (projectId, { rejectWithValue }) => {
  try {
    const epics = await epicApi.list(projectId);
    return { projectId, epics };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const createEpicThunk = createAsyncThunk<Epic, CreateEpicInput, { rejectValue: string }>(
  'epics/create',
  async (input, { rejectWithValue }) => {
    try {
      return await epicApi.create(input);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const updateEpicThunk = createAsyncThunk<
  Epic,
  { id: string; input: UpdateEpicInput },
  { rejectValue: string }
>('epics/update', async ({ id, input }, { rejectWithValue }) => {
  try {
    return await epicApi.update(id, input);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

const epicSlice = createSlice({
  name: 'epics',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEpicsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEpicsThunk.fulfilled, (state, action: PayloadAction<{ projectId: string; epics: Epic[] }>) => {
        state.loading = false;
        state.byProject[action.payload.projectId] = action.payload.epics;
      })
      .addCase(fetchEpicsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to load epics';
      })
      .addCase(createEpicThunk.fulfilled, (state, action: PayloadAction<Epic>) => {
        const list = state.byProject[action.payload.projectId] ?? [];
        state.byProject[action.payload.projectId] = [...list, action.payload];
      })
      .addCase(updateEpicThunk.fulfilled, (state, action: PayloadAction<Epic>) => {
        const list = state.byProject[action.payload.projectId] ?? [];
        state.byProject[action.payload.projectId] = list.map((e) =>
          e.id === action.payload.id ? action.payload : e,
        );
      });
  },
});

export default epicSlice.reducer;
