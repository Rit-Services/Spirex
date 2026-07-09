// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { importApi } from '@/apis/importApi';
import type { DraftStory, CommitEdit, DocumentImport } from '@/types/import';

interface ImportState {
  draft: { id: string; drafts: DraftStory[]; originalFilename: string } | null;
  projectImports: DocumentImport[];
  loading: boolean;
  error: string | null;
}

const initialState: ImportState = {
  draft: null,
  projectImports: [],
  loading: false,
  error: null,
};

export const createDraftThunk = createAsyncThunk(
  'imports/createDraft',
  async ({ projectId, file }: { projectId: string; file: File }) =>
    importApi.create(projectId, file),
);

export const commitImportThunk = createAsyncThunk(
  'imports/commit',
  async ({ id, edits }: { id: string; edits: CommitEdit[] }) =>
    importApi.commit(id, edits),
);

export const listImportsThunk = createAsyncThunk(
  'imports/listByProject',
  async (projectId: string) => importApi.listByProject(projectId),
);

const importSlice = createSlice({
  name: 'imports',
  initialState,
  reducers: {
    clearDraft(state) {
      state.draft = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createDraftThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.draft = null;
      })
      .addCase(createDraftThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.draft = action.payload;
      })
      .addCase(createDraftThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Upload failed';
      })
      .addCase(commitImportThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(commitImportThunk.fulfilled, (state) => {
        state.loading = false;
        state.draft = null;
      })
      .addCase(commitImportThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Commit failed';
      })
      .addCase(listImportsThunk.fulfilled, (state, action) => {
        state.projectImports = action.payload;
      });
  },
});

export const { clearDraft } = importSlice.actions;
export default importSlice.reducer;
