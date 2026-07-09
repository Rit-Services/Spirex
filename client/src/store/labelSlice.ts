// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { labelApi, type CreateLabelInput, type UpdateLabelInput } from '@/apis/labelApi';
import { extractError } from '@/config/httpClient';
import type { Label } from '@/types/scrum';

interface LabelState {
  byProject: Record<string, Label[]>;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

const initialState: LabelState = {
  byProject: {},
  loading: false,
  saving: false,
  error: null,
};

const byName = (a: Label, b: Label) => a.name.localeCompare(b.name);

export const fetchLabelsThunk = createAsyncThunk<
  { projectId: string; labels: Label[] },
  string,
  { rejectValue: string }
>('labels/fetch', async (projectId, { rejectWithValue }) => {
  try {
    const labels = await labelApi.listByProject(projectId);
    return { projectId, labels };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const createLabelThunk = createAsyncThunk<
  { projectId: string; label: Label },
  { projectId: string; input: CreateLabelInput },
  { rejectValue: string }
>('labels/create', async ({ projectId, input }, { rejectWithValue }) => {
  try {
    const label = await labelApi.create(projectId, input);
    return { projectId, label };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const updateLabelThunk = createAsyncThunk<
  { projectId: string; label: Label },
  { projectId: string; id: string; input: UpdateLabelInput },
  { rejectValue: string }
>('labels/update', async ({ projectId, id, input }, { rejectWithValue }) => {
  try {
    const label = await labelApi.update(id, input);
    return { projectId, label };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const removeLabelThunk = createAsyncThunk<
  { projectId: string; id: string },
  { projectId: string; id: string },
  { rejectValue: string }
>('labels/remove', async ({ projectId, id }, { rejectWithValue }) => {
  try {
    await labelApi.remove(id);
    return { projectId, id };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

const labelSlice = createSlice({
  name: 'labels',
  initialState,
  reducers: {
    clearLabels(state, action: PayloadAction<string>) {
      delete state.byProject[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchLabelsThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchLabelsThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.byProject[action.payload.projectId] = [...action.payload.labels].sort(byName);
      })
      .addCase(fetchLabelsThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to load labels';
      })
      .addCase(createLabelThunk.pending, (state) => {
        state.saving = true;
      })
      .addCase(createLabelThunk.fulfilled, (state, action) => {
        state.saving = false;
        const list = state.byProject[action.payload.projectId] ?? [];
        // Server is idempotent on name — guard against a duplicate entry if the
        // label already existed (case-insensitive reuse).
        if (!list.some((l) => l.id === action.payload.label.id)) {
          state.byProject[action.payload.projectId] = [...list, action.payload.label].sort(byName);
        }
      })
      .addCase(createLabelThunk.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload ?? 'Failed to create label';
      })
      .addCase(updateLabelThunk.fulfilled, (state, action) => {
        const list = state.byProject[action.payload.projectId] ?? [];
        state.byProject[action.payload.projectId] = list
          .map((l) => (l.id === action.payload.label.id ? action.payload.label : l))
          .sort(byName);
      })
      .addCase(removeLabelThunk.fulfilled, (state, action) => {
        const list = state.byProject[action.payload.projectId] ?? [];
        state.byProject[action.payload.projectId] = list.filter((l) => l.id !== action.payload.id);
      });
  },
});

export const { clearLabels } = labelSlice.actions;
export default labelSlice.reducer;
