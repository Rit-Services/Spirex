// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { RouterProvider } from 'react-router-dom';
import { router } from '@/routes';
import { Toaster } from 'sonner';

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}
