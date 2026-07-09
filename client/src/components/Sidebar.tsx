// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, FolderKanban, Settings, Rocket,
  ListChecks, Columns3, SquareKanban, Zap, BarChart3, Timer, FileUp, Cloud, ImagePlus,
  Upload, ChevronRight, ChevronsUpDown, X, Building2, Lock, Code2, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRAND } from '@/config/brand';
import { BrandMark } from '@/components/BrandMark';
import { ProjectSwitcher } from '@/components/projects/ProjectSwitcher';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentProject } from '@/hooks/useCurrentProject';

interface SidebarProps {
  drawerMode?: boolean;
  drawerOpen?: boolean;
  onDrawerClose?: () => void;
}

export function Sidebar({ drawerMode = false, drawerOpen = false, onDrawerClose }: SidebarProps) {
  const { can, hasEntitlement } = useAuth();
  const { current } = useCurrentProject();
  const location = useLocation();

  const projectId = current?.id;
  const onImportRoute = !!projectId && (
    location.pathname === `/projects/${projectId}/import` ||
    location.pathname === `/projects/${projectId}/import-image`
  );
  const [importOpen, setImportOpen] = useState(onImportRoute);
  useEffect(() => {
    if (onImportRoute) setImportOpen(true);
  }, [onImportRoute]);

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
      isActive
        ? 'bg-primary/12 text-primary nav-active-glow'
        : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
    );

  // Close on Escape while in drawer mode — matches common drawer UX.
  useEffect(() => {
    if (!drawerMode || !drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDrawerClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerMode, drawerOpen, onDrawerClose]);

  // In drawer mode the sidebar is hidden by default and slid in over the
  // workspace. Above the breakpoint it sits inline as before.
  // The aside itself no longer scrolls — only the nav region inside does. That
  // keeps the feedback footer pinned and stops the bottom fade from piling onto
  // the last nav row on short screens.
  const asideClass = drawerMode
    ? cn(
        'fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col border-r bg-card shadow-float transition-transform duration-200 ease-out',
        drawerOpen ? 'translate-x-0' : '-translate-x-full',
      )
    : 'relative flex h-full w-64 shrink-0 flex-col border-r bg-card';

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
      aria-label="Main navigation"
      aria-hidden={drawerMode && !drawerOpen}
      data-state={drawerMode ? (drawerOpen ? 'open' : 'closed') : 'static'}
    >
      {/* Subtle gradient sheen at the top */}
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

      {/* Scroll region wrapper: holds the scrollable nav + the bottom fade so
          the fade pins to the bottom of the VISIBLE nav area (above the feedback
          footer), never to the aside's bottom edge. */}
      <div className="relative min-h-0 flex-1">
        <div className="h-full overflow-y-auto p-3 pb-14">

        {/* ── Product brand ───────────────────────────────────────────
            SPIREX product mark. (The org logo now lives in the navbar —
            they were interchanged so the org can become a switcher there.) */}
        <div className="mb-3 px-3 pt-3">
          <BrandMark size={26} />
        </div>

        {/* ── Workspace ─────────────────────────────────────────────── */}
        <div className="mb-2 px-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.10em] text-muted-foreground/55">
            Workspace
          </span>
        </div>
        <nav className="flex flex-col gap-0.5">
          <NavLink to="/dashboard" className={itemClass}>
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            Dashboard
          </NavLink>
          <NavLink to="/projects" className={itemClass}>
            <FolderKanban className="h-4 w-4 shrink-0" />
            Projects
          </NavLink>
          {can('import:create') ? (
            <NavLink to="/jira/import" className={itemClass}>
              <Cloud className="h-4 w-4 shrink-0" />
              Import from JIRA
            </NavLink>
          ) : null}
          {can('user:manage') ? (
            <NavLink to="/admin/users" className={itemClass}>
              <Users className="h-4 w-4 shrink-0" />
              Users
            </NavLink>
          ) : null}
          {can('org:manage') ? (
            <NavLink to="/organization" className={itemClass}>
              <Building2 className="h-4 w-4 shrink-0" />
              Organization
            </NavLink>
          ) : null}
          <NavLink to="/admin/worklogs" className={itemClass}>
            <Timer className="h-4 w-4 shrink-0" />
            Worklogs
          </NavLink>
        </nav>

        {/* ── Active project ─────────────────────────────────────────── */}
        {current ? (
          <div className="mt-5">
            <div className="mb-1.5 px-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.10em] text-muted-foreground/55">
                Project
              </span>
            </div>

            {/* Prominent current-project card that doubles as a switcher —
                reuses the top-nav ProjectSwitcher (search + recents + all
                projects), so the selected project is both unmissable and quick
                to change without leaving the sidebar. */}
            <ProjectSwitcher
              trigger={
                <button
                  type="button"
                  aria-label={`Current project: ${current.name}. Click to switch project`}
                  className="group mb-2.5 flex w-full items-center gap-2.5 rounded-xl bg-gradient-to-br from-primary/[0.1] to-primary/[0.03] px-2.5 py-2 text-left ring-1 ring-primary/15 transition-colors hover:from-primary/[0.16] hover:ring-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20">
                    <FolderKanban className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-semibold leading-tight text-foreground"
                      title={current.name}
                    >
                      {current.name}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] leading-tight">
                      <span className="font-mono font-semibold text-primary/75">{current.key}</span>
                      <span className="text-muted-foreground/55">
                        {' · '}
                        {current.type === 'kanban' ? 'Kanban' : 'Scrum'}
                      </span>
                    </p>
                  </div>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
                </button>
              }
            />

            <nav className="flex flex-col gap-0.5">
              <NavLink to={`/projects/${current.id}`} end className={itemClass}>
                <LayoutDashboard className="h-4 w-4 shrink-0" />
                Overview
              </NavLink>
              <NavLink to={`/projects/${current.id}/backlog`} className={itemClass}>
                <ListChecks className="h-4 w-4 shrink-0" />
                Backlog
              </NavLink>
              {/* Board destination depends on the project's methodology:
                  kanban → continuous-flow board; scrum → sprint board. */}
              {current.type === 'kanban' ? (
                <NavLink to={`/projects/${current.id}/kanban`} className={itemClass}>
                  <SquareKanban className="h-4 w-4 shrink-0" />
                  Board
                </NavLink>
              ) : (
                <NavLink to={`/projects/${current.id}/board`} className={itemClass}>
                  <Columns3 className="h-4 w-4 shrink-0" />
                  Board
                </NavLink>
              )}
              {/* Sprints are scrum-only. */}
              {current.type !== 'kanban' ? (
                <NavLink to={`/projects/${current.id}/sprints`} className={itemClass}>
                  <Zap className="h-4 w-4 shrink-0" />
                  Sprints
                </NavLink>
              ) : null}
              <NavLink to={`/projects/${current.id}/epics`} className={itemClass}>
                <Rocket className="h-4 w-4 shrink-0" />
                Epics
              </NavLink>
              <NavLink to={`/projects/${current.id}/reports`} className={itemClass}>
                <BarChart3 className="h-4 w-4 shrink-0" />
                Reports
              </NavLink>
              <button
                type="button"
                onClick={() => setImportOpen((v) => !v)}
                aria-expanded={importOpen}
                aria-controls="sidebar-import-submenu"
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                  onImportRoute
                    ? 'bg-primary/12 text-primary nav-active-glow'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                <Upload className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">Import</span>
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 transition-transform',
                    importOpen && 'rotate-90',
                  )}
                />
              </button>
              {importOpen ? (
                <div id="sidebar-import-submenu" className="ml-3 flex flex-col gap-0.5 border-l border-border/60 pl-2">
                  <ImportItem
                    to={`/projects/${current.id}/import`}
                    icon={FileUp}
                    label="From document"
                    enabled={hasEntitlement('aiDocImport')}
                    itemClass={itemClass}
                  />
                  <ImportItem
                    to={`/projects/${current.id}/import-image`}
                    icon={ImagePlus}
                    label="From image"
                    enabled={hasEntitlement('aiImageImport')}
                    itemClass={itemClass}
                  />
                </div>
              ) : null}
              <NavLink to={`/projects/${current.id}/settings`} className={itemClass}>
                <Settings className="h-4 w-4 shrink-0" />
                Settings
              </NavLink>
            </nav>
          </div>
        ) : null}
        </div>

        {/* Bottom fade — pinned to the bottom of the scroll area (above the
            feedback footer). The scroll region's pb-14 guarantees the last row
            (Settings) parks above this 48px gradient, so it shades passing
            items without ever swallowing the last nav item. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />
      </div>

      {/* AGPL-3.0 §13 — the running instance must offer its source to the users
          interacting with it over the network. Pinned outside the scroll region
          so it's always visible. Self-hosters running a MODIFIED build must set
          VITE_SOURCE_URL to their own fork (see config/brand.ts). */}
      <a
        href={BRAND.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex shrink-0 items-center gap-2 border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <Code2 className="h-3.5 w-3.5 shrink-0" />
        Source code · {BRAND.license}
      </a>
    </aside>
    </>
  );
}

// Phase 13: one import sub-item. When the org's entitlement is off, render a
// non-clickable, dimmed row with a lock + tooltip instead of a NavLink, so the
// feature reads as "available but not on your plan" rather than just vanishing.
interface ImportItemProps {
  to: string;
  icon: LucideIcon;
  label: string;
  enabled: boolean;
  itemClass: (args: { isActive: boolean }) => string;
}

function ImportItem({ to, icon: Icon, label, enabled, itemClass }: ImportItemProps) {
  if (!enabled) {
    return (
      <span
        aria-disabled="true"
        title={`${label} isn't enabled for your organization`}
        className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/40"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{label}</span>
        <Lock className="h-3 w-3 shrink-0" />
      </span>
    );
  }
  return (
    <NavLink to={to} className={itemClass}>
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </NavLink>
  );
}
