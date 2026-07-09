// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { searchApi } from '@/apis/searchApi';
import type { SearchResponse, SearchType } from '@/types/search';

interface SearchState {
  results: SearchResponse | null;
  loading: boolean;
  error: string | null;
  lastQuery: string;
}

const empty: SearchResponse = { stories: [], epics: [], projects: [], comments: [], total: 0 };

const initialState: SearchState = {
  results: null,
  loading: false,
  error: null,
  lastQuery: '',
};

export const searchThunk = createAsyncThunk(
  'search/query',
  async (
    params: {
      q: string;
      type?: SearchType;
      projectId?: string;
      status?: string;
      storyType?: string;
      assigneeId?: string;
      reporterId?: string;
    },
    { rejectWithValue },
  ) => {
    try {
      return await searchApi.search(params);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      return rejectWithValue(msg ?? 'Search failed');
    }
  },
);

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    clearResults(state) {
      state.results = null;
      state.lastQuery = '';
      state.error = null;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(searchThunk.pending, (state, action) => {
        state.loading = true;
        state.lastQuery = action.meta.arg.q;
        state.error = null;
      })
      .addCase(searchThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.results = action.payload;
      })
      .addCase(searchThunk.rejected, (state, action) => {
        state.loading = false;
        state.results = empty;
        state.error = action.payload as string;
      });
  },
});

export const { clearResults } = searchSlice.actions;
export default searchSlice.reducer;
