// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Building2, ShieldCheck, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandMark } from '@/components/BrandMark';

interface SuperAdminSidebarProps {
  drawerMode?: boolean;
  drawerOpen?: boolean;
  onDrawerClose?: () => void;
}

// The platform operator's navigation. Deliberately separate from the tenant
// Sidebar: a superadmin runs the platform (organizations + other superadmins)
// and never sees tenant nav (dashboard / projects / worklogs). Keeping it in its
// own component — mounted only by SuperAdminLayout — means the two worlds can't
// bleed into each other the way a single role-branched sidebar invited.
export function SuperAdminSidebar({
  drawerMode = false,
  drawerOpen = false,
  onDrawerClose,
}: SuperAdminSidebarProps) {
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
      isActive
        ? 'bg-primary/12 text-primary nav-active-glow'
        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
    );

  // Close on Escape while in drawer mode — matches the tenant sidebar UX.
  useEffect(() => {
    if (!drawerMode || !drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDrawerClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerMode, drawerOpen, onDrawerClose]);

  const asideClass = drawerMode
    ? cn(
        'fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col overflow-y-auto border-r bg-card shadow-float transition-transform duration-200 ease-out',
        drawerOpen ? 'translate-x-0' : '-translate-x-full',
      )
    : 'relative flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r bg-card';

  return (
    <>
      {drawerMode ? (
        <div
          role="presentation"
          aria-hidden={!drawerOpen}
          onClick={onDrawerClose}
          className={cn(
            'fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity duration-200',
            drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        />
      ) : null}
      <aside
        className={asideClass}
        aria-label="Platform navigation"
        aria-hidden={drawerMode && !drawerOpen}
        data-state={drawerMode ? (drawerOpen ? 'open' : 'closed') : 'static'}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/[0.04] to-transparent" />

        {drawerMode ? (
          <button
            type="button"
            onClick={onDrawerClose}
            aria-label="Close menu"
            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        <div className="relative flex-1 p-3">
          <div className="mb-3 px-3 pt-3">
            <BrandMark size={26} />
          </div>

          <div className="mb-2 px-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.10em] text-muted-foreground/55">
              Platform
            </span>
          </div>
          <nav className="flex flex-col gap-0.5">
            <NavLink to="/superadmin" end className={itemClass}>
              <Building2 className="h-4 w-4 shrink-0" />
              Organizations
            </NavLink>
            <NavLink to="/superadmin/admins" className={itemClass}>
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Superadmins
            </NavLink>
          </nav>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
      </aside>
    </>
  );
}
