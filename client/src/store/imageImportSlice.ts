// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { imageImportApi } from '@/apis/imageImportApi';
import type {
  Annotation,
  CommitImageEdit,
  CreateImageImportResult,
  ImageImportDraft,
} from '@/types/imageImport';

interface ImageImportState {
  draft: CreateImageImportResult | null;
  loading: boolean;
  committing: boolean;
  generating: boolean;
  error: string | null;
}

const initialState: ImageImportState = {
  draft: null,
  loading: false,
  committing: false,
  generating: false,
  error: null,
};

export const createImageDraftThunk = createAsyncThunk(
  'imageImports/createDraft',
  async ({ projectId, file }: { projectId: string; file: File }) =>
    imageImportApi.create(projectId, file),
);

export const saveAnnotationsThunk = createAsyncThunk(
  'imageImports/saveAnnotations',
  async ({ id, annotations }: { id: string; annotations: Annotation[] }) => {
    await imageImportApi.saveAnnotations(id, annotations);
    return annotations;
  },
);

export const saveDraftThunk = createAsyncThunk(
  'imageImports/saveDraft',
  async ({ id, draft }: { id: string; draft: Partial<ImageImportDraft> }) => {
    await imageImportApi.saveDraft(id, draft);
    return draft;
  },
);

export const generateAiDraftThunk = createAsyncThunk<
  ImageImportDraft,
  string,
  { rejectValue: string }
>('imageImports/generate', async (id, { rejectWithValue }) => {
  try {
    const { draft } = await imageImportApi.generate(id);
    return draft;
  } catch (err) {
    const e = err as { response?: { data?: { message?: string; error?: string } }; message?: string };
    return rejectWithValue(
      e.response?.data?.message ?? e.response?.data?.error ?? e.message ?? 'AI generation failed',
    );
  }
});

export const commitImageImportThunk = createAsyncThunk(
  'imageImports/commit',
  async ({ id, edit }: { id: string; edit: CommitImageEdit }) =>
    imageImportApi.commit(id, edit),
);

export const discardImageImportThunk = createAsyncThunk(
  'imageImports/discard',
  async (id: string) => {
    await imageImportApi.discard(id);
  },
);

const imageImportSlice = createSlice({
  name: 'imageImports',
  initialState,
  reducers: {
    clearImageDraft(state) {
      state.draft = null;
      state.error = null;
    },
    setLocalAnnotations(state, action: { payload: Annotation[] }) {
      if (state.draft) state.draft.annotations = action.payload;
    },
    setLocalDraft(state, action: { payload: Partial<ImageImportDraft> }) {
      if (state.draft) state.draft.draft = { ...state.draft.draft, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createImageDraftThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.draft = null;
      })
      .addCase(createImageDraftThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.draft = action.payload;
      })
      .addCase(createImageDraftThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Upload failed';
      })
      .addCase(saveDraftThunk.fulfilled, (_state) => {
        // Persist-only. Do NOT merge the patch back into state — the user may
        // have typed more characters during the 600ms debounce + request
        // round-trip, and re-applying the older patch yanks the textarea
        // backwards mid-edit, jumping the caret.
      })
      .addCase(generateAiDraftThunk.pending, (state) => {
        state.generating = true;
        state.error = null;
      })
      .addCase(generateAiDraftThunk.fulfilled, (state, action) => {
        state.generating = false;
        if (state.draft) state.draft.draft = action.payload;
      })
      .addCase(generateAiDraftThunk.rejected, (state, action) => {
        state.generating = false;
        state.error = action.payload ?? action.error.message ?? 'AI generation failed';
      })
      .addCase(commitImageImportThunk.pending, (state) => {
        state.committing = true;
        state.error = null;
      })
      .addCase(commitImageImportThunk.fulfilled, (state) => {
        state.committing = false;
        state.draft = null;
      })
      .addCase(commitImageImportThunk.rejected, (state, action) => {
        state.committing = false;
        state.error = action.error.message ?? 'Commit failed';
      });
  },
});

export const { clearImageDraft, setLocalAnnotations, setLocalDraft } = imageImportSlice.actions;
export default imageImportSlice.reducer;
