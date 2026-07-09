// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { Topbar } from '@/components/Topbar';
import { SuperAdminSidebar } from '@/components/SuperAdminSidebar';
import { SuperAdminSearch } from '@/components/SuperAdminSearch';
import { BrandLoader } from '@/components/BrandLoader';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';

// Platform-operator shell. This is a DISTINCT layout from the tenant AppLayout —
// no project context, no story panel, no create-story shortcuts. The hard
// redirect below is the real boundary: a non-superadmin who types a /superadmin
// URL is bounced to the tenant app, just as AppLayout bounces a superadmin out of
// the tenant routes. Hiding nav was never enough; the gate lives at the layout.
export function SuperAdminLayout() {
  const { status, isAuthenticated, refresh, isSuperAdmin } = useAuth();
  const location = useLocation();

  const [searchOpen, setSearchOpen] = useState(false);

  const isCompact = useMediaQuery('(max-width: 1023.98px)');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isCompact) setDrawerOpen(false);
  }, [isCompact]);
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    if (status === 'idle') void refresh();
  }, [status, refresh]);

  // ⌘K / Ctrl+K — open the platform search palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (status === 'idle' || status === 'loading') {
    return <BrandLoader label="Loading platform…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // The boundary: only the platform operator belongs here. Everyone else is a
  // tenant actor and goes to the tenant app.
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SuperAdminSidebar
        drawerMode={isCompact}
        drawerOpen={drawerOpen}
        onDrawerClose={closeDrawer}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onSearchOpen={openSearch} onMenuOpen={isCompact ? openDrawer : undefined} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          <Outlet />
        </main>
      </div>
      <SuperAdminSearch open={searchOpen} onClose={closeSearch} />
    </div>
  );
}
