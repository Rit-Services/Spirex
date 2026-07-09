// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  storyApi,
  type CreateStoryInput,
  type StoryListFilters,
  type UpdateStoryInput,
} from '@/apis/storyApi';
import { extractError } from '@/config/httpClient';
import type { Story, StoryStatus, StoryWatchState } from '@/types/scrum';

interface StoryState {
  list: Story[];
  activeFilters: StoryListFilters | null;
  selected: Story | null;
  loading: boolean;
  error: string | null;
}

const initialState: StoryState = {
  list: [],
  activeFilters: null,
  selected: null,
  loading: false,
  error: null,
};

export const fetchStoriesThunk = createAsyncThunk<
  { filters: StoryListFilters; stories: Story[] },
  StoryListFilters,
  { rejectValue: string }
>('stories/fetch', async (filters, { rejectWithValue }) => {
  try {
    const stories = await storyApi.list(filters);
    return { filters, stories };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const fetchStoryThunk = createAsyncThunk<Story, string, { rejectValue: string }>(
  'stories/fetchOne',
  async (id, { rejectWithValue }) => {
    try {
      return await storyApi.get(id);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

/**
 * Fetch a story by its unique `<PROJECTKEY>-<n>` key. Used by the URL-driven
 * detail panel for deep-links (`?story=KDG-42`) and for subtasks, which aren't
 * kept in the main `list` (the backlog/board list filters them out).
 */
export const fetchStoryByKeyThunk = createAsyncThunk<Story, string, { rejectValue: string }>(
  'stories/fetchByKey',
  async (key, { rejectWithValue }) => {
    try {
      return await storyApi.getByKey(key);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const createStoryThunk = createAsyncThunk<Story, CreateStoryInput, { rejectValue: string }>(
  'stories/create',
  async (input, { rejectWithValue }) => {
    try {
      return await storyApi.create(input);
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

export const updateStoryThunk = createAsyncThunk<
  Story,
  { id: string; input: UpdateStoryInput },
  { rejectValue: string }
>('stories/update', async ({ id, input }, { rejectWithValue }) => {
  try {
    return await storyApi.update(id, input);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

/**
 * Board-drag status change. Dispatched after an optimistic reducer update so
 * the UI moves instantly; on rejection the caller restores the previous list.
 */
export const changeStoryStatusThunk = createAsyncThunk<
  Story,
  { id: string; status: StoryStatus },
  { rejectValue: string }
>('stories/status', async ({ id, status }, { rejectWithValue }) => {
  try {
    return await storyApi.changeStatus(id, status);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

/**
 * Board-drag column change targeting a SPECIFIC workflow column. Needed when
 * multiple columns share a coreStatus — passing just the enum couldn't
 * disambiguate which one the drop target was.
 */
export const changeStoryStatusRowThunk = createAsyncThunk<
  Story,
  { id: string; statusRowId: string; cascadeSubtasks?: boolean },
  { rejectValue: string }
>('stories/statusRow', async ({ id, statusRowId, cascadeSubtasks }, { rejectWithValue }) => {
  try {
    return await storyApi.changeStatusRow(id, statusRowId, cascadeSubtasks);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const changeStorySprintThunk = createAsyncThunk<
  Story,
  { id: string; sprintId: string | null },
  { rejectValue: string }
>('stories/sprint', async ({ id, sprintId }, { rejectWithValue }) => {
  try {
    return await storyApi.changeSprint(id, sprintId);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

/** Drag-reorder: persist the story's new position between prevId and nextId. */
export const reorderStoryThunk = createAsyncThunk<
  Story,
  { id: string; prevId: string | null; nextId: string | null },
  { rejectValue: string }
>('stories/reorder', async ({ id, prevId, nextId }, { rejectWithValue }) => {
  try {
    return await storyApi.reorder(id, prevId, nextId);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

/** Watch / unwatch toggle for the detail-panel eye. Returns the fresh watch
 * state so the panel can re-render the count without a full story refetch. */
export const watchStoryThunk = createAsyncThunk<
  { id: string; watch: StoryWatchState },
  string,
  { rejectValue: string }
>('stories/watch', async (id, { rejectWithValue }) => {
  try {
    return { id, watch: await storyApi.watch(id) };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const unwatchStoryThunk = createAsyncThunk<
  { id: string; watch: StoryWatchState },
  string,
  { rejectValue: string }
>('stories/unwatch', async (id, { rejectWithValue }) => {
  try {
    return { id, watch: await storyApi.unwatch(id) };
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

/** Attach a label to a story. Returns the hydrated story so list + selected
 *  patch in place — same channel as any other story update. */
export const attachLabelThunk = createAsyncThunk<
  Story,
  { id: string; labelId: string },
  { rejectValue: string }
>('stories/attachLabel', async ({ id, labelId }, { rejectWithValue }) => {
  try {
    return await storyApi.attachLabel(id, labelId);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const detachLabelThunk = createAsyncThunk<
  Story,
  { id: string; labelId: string },
  { rejectValue: string }
>('stories/detachLabel', async ({ id, labelId }, { rejectWithValue }) => {
  try {
    return await storyApi.detachLabel(id, labelId);
  } catch (err) {
    return rejectWithValue(extractError(err).message);
  }
});

export const deleteStoryThunk = createAsyncThunk<string, string, { rejectValue: string }>(
  'stories/delete',
  async (id, { rejectWithValue }) => {
    try {
      await storyApi.remove(id);
      return id;
    } catch (err) {
      return rejectWithValue(extractError(err).message);
    }
  },
);

const storySlice = createSlice({
  name: 'stories',
  initialState,
  reducers: {
    setSelectedStory(state, action: PayloadAction<Story | null>) {
      state.selected = action.payload;
    },
    clearStories(state) {
      state.list = [];
      state.activeFilters = null;
    },
    /**
     * Optimistically flip a card's status client-side BEFORE the thunk resolves.
     * Reducer only — rollback is handled by the caller using `replaceStoryInList`.
     */
    optimisticStatusChange(state, action: PayloadAction<{ id: string; status: StoryStatus }>) {
      const i = state.list.findIndex((s) => s.id === action.payload.id);
      if (i >= 0) state.list[i] = { ...state.list[i], status: action.payload.status };
    },
    /**
     * Optimistic column move that targets a specific workflow row (phase 9A.2
     * custom columns). Sets statusId AND derives the legacy status enum from
     * the caller-provided coreStatus so both sources of truth stay consistent
     * during the optimistic window.
     */
    optimisticStatusRowChange(
      state,
      action: PayloadAction<{ id: string; statusId: string; coreStatus: StoryStatus }>,
    ) {
      const i = state.list.findIndex((s) => s.id === action.payload.id);
      if (i >= 0) {
        state.list[i] = {
          ...state.list[i],
          statusId: action.payload.statusId,
          status: action.payload.coreStatus,
        };
      }
    },
    replaceStoryInList(state, action: PayloadAction<Story>) {
      const i = state.list.findIndex((s) => s.id === action.payload.id);
      if (i >= 0) state.list[i] = action.payload;
      else state.list.push(action.payload);
    },
    /**
     * Optimistically reorder the backlog list: move `id` to sit right after
     * `prevId` (or to the top when null). Mirrors the server's rank placement so
     * the row doesn't snap back before the reorder thunk resolves.
     */
    optimisticReorder(
      state,
      action: PayloadAction<{ id: string; prevId: string | null }>,
    ) {
      const { id, prevId } = action.payload;
      const i = state.list.findIndex((s) => s.id === id);
      if (i < 0) return;
      const [moved] = state.list.splice(i, 1);
      const at = prevId ? state.list.findIndex((s) => s.id === prevId) + 1 : 0;
      state.list.splice(at, 0, moved);
    },
    /**
     * Optimistic sprint move against the BACKLOG list. Moving a story OUT of the
     * backlog (into a sprint) drops it from the list immediately, so it doesn't
     * linger in both the backlog and the sprint lane during the server round-trip.
     * Moving INTO the backlog inserts it (sprintId cleared) right after
     * `backlogPrevId` (top when null). Sprint↔sprint moves are no-ops here.
     */
    optimisticSprintMove(
      state,
      action: PayloadAction<{
        story: Story;
        nextSprintId: string | null;
        backlogPrevId: string | null;
      }>,
    ) {
      const { story, nextSprintId, backlogPrevId } = action.payload;
      const i = state.list.findIndex((s) => s.id === story.id);
      if (nextSprintId) {
        if (i >= 0) state.list.splice(i, 1);
      } else {
        if (i >= 0) state.list.splice(i, 1);
        const at = backlogPrevId
          ? state.list.findIndex((s) => s.id === backlogPrevId) + 1
          : 0;
        state.list.splice(Math.max(0, at), 0, { ...story, sprintId: null } as Story);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStoriesThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStoriesThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload.stories;
        state.activeFilters = action.payload.filters;
      })
      .addCase(fetchStoriesThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to load stories';
      })
      .addCase(fetchStoryThunk.fulfilled, (state, action: PayloadAction<Story>) => {
        state.selected = action.payload;
      })
      .addCase(fetchStoryByKeyThunk.fulfilled, (state, action: PayloadAction<Story>) => {
        state.selected = action.payload;
      })
      .addCase(createStoryThunk.fulfilled, (state, action: PayloadAction<Story>) => {
        // Append (not unshift): new stories get the BOTTOM rank, so they belong
        // at the end of the list/column — where the user created them — not the top.
        state.list.push(action.payload);
      })
      .addCase(updateStoryThunk.fulfilled, (state, action: PayloadAction<Story>) => {
        state.list = state.list.map((s) => (s.id === action.payload.id ? action.payload : s));
        if (state.selected?.id === action.payload.id) state.selected = action.payload;
      })
      .addCase(changeStoryStatusThunk.fulfilled, (state, action: PayloadAction<Story>) => {
        state.list = state.list.map((s) => (s.id === action.payload.id ? action.payload : s));
        if (state.selected?.id === action.payload.id) state.selected = action.payload;
      })
      .addCase(changeStoryStatusRowThunk.fulfilled, (state, action: PayloadAction<Story>) => {
        state.list = state.list.map((s) => (s.id === action.payload.id ? action.payload : s));
        if (state.selected?.id === action.payload.id) state.selected = action.payload;
      })
      .addCase(changeStorySprintThunk.fulfilled, (state, action: PayloadAction<Story>) => {
        state.list = state.list.map((s) => (s.id === action.payload.id ? action.payload : s));
        if (state.selected?.id === action.payload.id) state.selected = action.payload;
      })
      // Replace in place (same array position the optimistic reorder set) so the
      // rank value syncs without snapping the row back.
      .addCase(reorderStoryThunk.fulfilled, (state, action: PayloadAction<Story>) => {
        state.list = state.list.map((s) => (s.id === action.payload.id ? action.payload : s));
        if (state.selected?.id === action.payload.id) state.selected = action.payload;
      })
      .addCase(watchStoryThunk.fulfilled, (state, action) => {
        if (state.selected?.id === action.payload.id) {
          state.selected = { ...state.selected, ...action.payload.watch };
        }
      })
      .addCase(unwatchStoryThunk.fulfilled, (state, action) => {
        if (state.selected?.id === action.payload.id) {
          state.selected = { ...state.selected, ...action.payload.watch };
        }
      })
      .addCase(attachLabelThunk.fulfilled, (state, action: PayloadAction<Story>) => {
        state.list = state.list.map((s) => (s.id === action.payload.id ? action.payload : s));
        if (state.selected?.id === action.payload.id) state.selected = action.payload;
      })
      .addCase(detachLabelThunk.fulfilled, (state, action: PayloadAction<Story>) => {
        state.list = state.list.map((s) => (s.id === action.payload.id ? action.payload : s));
        if (state.selected?.id === action.payload.id) state.selected = action.payload;
      })
      .addCase(deleteStoryThunk.fulfilled, (state, action: PayloadAction<string>) => {
        state.list = state.list.filter((s) => s.id !== action.payload);
        if (state.selected?.id === action.payload) state.selected = null;
      });
  },
});

export const {
  setSelectedStory,
  clearStories,
  optimisticStatusChange,
  optimisticStatusRowChange,
  optimisticReorder,
  optimisticSprintMove,
  replaceStoryInList,
} = storySlice.actions;
export default storySlice.reducer;
