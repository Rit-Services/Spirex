// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { workflowApi, type CreateWorkflowColumnInput, type WorkflowBulkUpdateItem } from '@/apis/workflowApi';
import { extractError } from '@/config/httpClient';
import type { WorkflowStatus } from '@/types/scrum';

interface WorkflowState {
  byProject: Record<string, WorkflowStatus[]>;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

const initialState: WorkflowState = {
  byProject: {},
  loading: false,
  saving: false,
  error: null,
};

export const fetchWorkflowThunk = createAsyncThunk<
  { projectId: string; rows: WorkflowStatus[] },
  string,
  { rejectValue: string }
>('workflow/fetch', async (projectId, { rejectWithValue }) => {
  try {
    const rows = await workflowApi.listByProject(projectId);
    return { projectId, rows };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const bulkUpdateWorkflowThunk = createAsyncThunk<
  { projectId: string; rows: WorkflowStatus[] },
  { projectId: string; items: WorkflowBulkUpdateItem[] },
  { rejectValue: string }
>('workflow/bulkUpdate', async ({ projectId, items }, { rejectWithValue }) => {
  try {
    const rows = await workflowApi.bulkUpdate(projectId, items);
    return { projectId, rows };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const resetWorkflowThunk = createAsyncThunk<
  { projectId: string; rows: WorkflowStatus[] },
  string,
  { rejectValue: string }
>('workflow/reset', async (projectId, { rejectWithValue }) => {
  try {
    const rows = await workflowApi.resetDefaults(projectId);
    return { projectId, rows };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const createWorkflowColumnThunk = createAsyncThunk<
  { projectId: string; row: WorkflowStatus },
  { projectId: string; input: CreateWorkflowColumnInput },
  { rejectValue: string }
>('workflow/createColumn', async ({ projectId, input }, { rejectWithValue }) => {
  try {
    const row = await workflowApi.createColumn(projectId, input);
    return { projectId, row };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const removeWorkflowColumnThunk = createAsyncThunk<
  { projectId: string; id: string },
  { projectId: string; id: string },
  { rejectValue: string }
>('workflow/removeColumn', async ({ projectId, id }, { rejectWithValue }) => {
  try {
    await workflowApi.removeColumn(id);
    return { projectId, id };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

const workflowSlice = createSlice({
  name: 'workflow',
  initialState,
  reducers: {
    clearWorkflow(state, action: PayloadAction<string>) {
      delete state.byProject[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkflowThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWorkflowThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.byProject[action.payload.projectId] = action.payload.rows;
      })
      .addCase(fetchWorkflowThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to load workflow';
      })
      .addCase(bulkUpdateWorkflowThunk.pending, (state) => {
        state.saving = true;
        state.error = null;
      })
      .addCase(bulkUpdateWorkflowThunk.fulfilled, (state, action) => {
        state.saving = false;
        state.byProject[action.payload.projectId] = [...action.payload.rows].sort(
          (a, b) => a.order - b.order,
        );
      })
      .addCase(bulkUpdateWorkflowThunk.rejected, (state, action) => {
        state.saving = false;
        state.error = action.payload ?? 'Failed to save workflow';
      })
      .addCase(resetWorkflowThunk.fulfilled, (state, action) => {
        state.byProject[action.payload.projectId] = [...action.payload.rows].sort(
          (a, b) => a.order - b.order,
        );
      })
      .addCase(createWorkflowColumnThunk.fulfilled, (state, action) => {
        const list = state.byProject[action.payload.projectId] ?? [];
        state.byProject[action.payload.projectId] = [...list, action.payload.row].sort(
          (a, b) => a.order - b.order,
        );
      })
      .addCase(removeWorkflowColumnThunk.fulfilled, (state, action) => {
        const list = state.byProject[action.payload.projectId] ?? [];
        state.byProject[action.payload.projectId] = list.filter((r) => r.id !== action.payload.id);
      });
  },
});

export const { clearWorkflow } = workflowSlice.actions;
export default workflowSlice.reducer;
