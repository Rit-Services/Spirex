// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { toast } from 'sonner';
import { store } from '@/store';
import { setUnauthenticated } from '@/store/authSlice';
import { installAuthInterceptor } from '@/config/httpClient';
import { App } from '@/app/App';
import '@/styles/globals.css';

// Auto-logout on JWT expiry: any 401 on a protected route resets the auth
// slice, redirects to /login?reason=expired, and surfaces a single toast.
installAuthInterceptor({
  onSessionExpired: () => {
    const wasAuthed = store.getState().auth.status === 'authenticated';
    store.dispatch(setUnauthenticated());
    if (wasAuthed) {
      toast.error('Your session has expired — please sign in again');
      const path = window.location.pathname + window.location.search;
      const next = encodeURIComponent(path);
      // Skip the redirect if we're already on /login to avoid a reload loop
      // when the bootstrap probe happens to fail mid-render.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace(`/login?reason=expired&next=${next}`);
      }
    }
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
