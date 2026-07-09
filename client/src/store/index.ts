// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import authReducer from './authSlice';
import usersReducer from './userSlice';
import projectsReducer from './projectSlice';
import epicsReducer from './epicSlice';
import storiesReducer from './storySlice';
import sprintsReducer from './sprintSlice';
import workflowReducer from './workflowSlice';
import labelsReducer from './labelSlice';
import searchReducer from './searchSlice';
import importReducer from './importSlice';
import imageImportReducer from './imageImportSlice';
import superadminReducer from './superadminSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    users: usersReducer,
    projects: projectsReducer,
    epics: epicsReducer,
    stories: storiesReducer,
    sprints: sprintsReducer,
    workflow: workflowReducer,
    labels: labelsReducer,
    search: searchReducer,
    imports: importReducer,
    imageImports: imageImportReducer,
    superadmin: superadminReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default store;
