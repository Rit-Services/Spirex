// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { Topbar } from '@/components/Topbar';
import { Sidebar } from '@/components/Sidebar';
import { BrandLoader } from '@/components/BrandLoader';
import { StoryDetailPanel } from '@/components/scrum/StoryDetailPanel';
import { GlobalSearch } from '@/components/GlobalSearch';
import { SuperAdminSearch } from '@/components/SuperAdminSearch';
import { ShortcutsDialog } from '@/components/ShortcutsDialog';
import { CreateStoryDialog } from '@/components/scrum/CreateStoryDialog';
import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { isTextEditableTarget } from '@/utils/keyboard';

export function AppLayout() {
  const { status, isAuthenticated, refresh, user, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const currentProjectId = useAppSelector((s) => s.projects.currentId);
  const { canInProject } = useCurrentProject();

  // Reflect the open project in the browser tab title ("<Project> · SPIREX").
  useDocumentTitle();

  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Below `lg` (1024px) the sidebar collapses into a drawer toggled from the
  // top bar. Above that, it sits inline as a persistent column.
  const isCompact = useMediaQuery('(max-width: 1023.98px)');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the viewport grows past the compact breakpoint
  // or whenever the route changes — both feel surprising otherwise.
  useEffect(() => {
    if (!isCompact) setDrawerOpen(false);
  }, [isCompact]);
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    if (status === 'idle') void refresh();
  }, [status, refresh]);

  // Global drag-drop guard. Without this, dropping a file anywhere outside
  // an explicit dropzone (AttachmentGallery, RichTextEditor, import pages)
  // makes the browser navigate to the file's URL — your in-progress draft
  // disappears with a page reload. PreventDefault on dragover/drop at the
  // window level keeps misses as a silent no-op. Explicit dropzones still
  // work because their React handlers run during bubble first.
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  // ── Global keyboard shortcuts ─────────────────────────────────────────
  // Ctrl/Cmd+K — global search palette (already mapped before the rest of
  // this hook landed). The remaining bindings are page-agnostic actions:
  // help, create, "show issues assigned to me", "show issues I reported".
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      // ⌘K / Ctrl+K — open the search palette. Toggle behaviour preserved.
      if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }

      // Skip every other shortcut while the user is typing into a real text
      // field. Checkboxes / radios are NOT considered editable here — see
      // `isTextEditableTarget` for the full predicate.
      if (isTextEditableTarget(e.target)) return;
      if (mod) return; // ignore other modifier combos at the global layer

      // Plain "?" — show the cheat-sheet from anywhere.
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      // "c" — open Create Story for the currently-selected project. Honour
      // the project's create permission instead of always opening.
      if ((e.key === 'c' || e.key === 'C') && !e.shiftKey) {
        if (currentProjectId && canInProject('story:create')) {
          e.preventDefault();
          setCreateOpen(true);
        }
        return;
      }

      // Shift+A is project-scoped. We resolve the project from the URL (NOT
      // from `currentProjectId` in Redux — that sticks around after you leave
      // a project page, which would let the shortcut fire on /admin and feel
      // surprising). It TOGGLES `?assignee` IN PLACE so each page filters
      // itself: Backlog filters Backlog, Board filters Board, SprintDetail
      // filters SprintDetail, EpicDetail filters EpicDetail. Pages that don't
      // read `?assignee` simply ignore the new query param.
      if (e.key === 'A' && e.shiftKey) {
        if (!user?.id) return;
        if (!/^\/projects\/[^/]+/.test(location.pathname)) return;
        e.preventDefault();
        const next = new URLSearchParams(location.search);
        // Toggle: pressing again while already filtered to me clears it (undo);
        // otherwise apply the "assigned to me" filter. Other params are kept.
        if (next.get('assignee') === user.id) {
          next.delete('assignee');
        } else {
          next.set('assignee', user.id);
        }
        const qs = next.toString();
        navigate(qs ? `${location.pathname}?${qs}` : location.pathname, { replace: true });
        return;
      }

      // Shift+R is global — works on any page. Routes through /search because
      // the backlog/board endpoints don't filter by reporter today.
      if (e.key === 'R' && e.shiftKey) {
        if (!user?.id) return;
        e.preventDefault();
        navigate(`/search?reporterId=${encodeURIComponent(user.id)}`);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, user?.id, currentProjectId, canInProject, location.pathname, location.search]);

  if (status === 'idle' || status === 'loading') {
    return <BrandLoader label="Loading workspace…" />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // The tenant/platform boundary. A superadmin is a platform operator and has no
  // business in the tenant app — bounce them to the platform shell. This single
  // gate covers EVERY tenant route at once (dashboard, projects, admin, …), so a
  // typed URL can't sneak past the way hidden sidebar nav allowed.
  if (isSuperAdmin) {
    return <Navigate to="/superadmin" replace />;
  }

  return (
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          drawerMode={isCompact}
          drawerOpen={drawerOpen}
          onDrawerClose={closeDrawer}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar
            onSearchOpen={openSearch}
            onHelpOpen={openHelp}
            onMenuOpen={isCompact ? openDrawer : undefined}
          />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-6">
            <Outlet />
          </main>
        </div>
        <StoryDetailPanel />
        {/* The command bar swaps data source by role: the superadmin searches
            organizations + members; everyone else searches tickets. */}
        {isSuperAdmin ? (
          <SuperAdminSearch open={searchOpen} onClose={closeSearch} />
        ) : (
          <GlobalSearch open={searchOpen} onClose={closeSearch} />
        )}
        <ShortcutsDialog
          open={helpOpen}
          onOpenChange={setHelpOpen}
          canCreate={!!currentProjectId && canInProject('story:create')}
          canDelete={!!currentProjectId && canInProject('story:delete')}
        />
        {currentProjectId ? (
          <CreateStoryDialog
            projectId={currentProjectId}
            open={createOpen}
            onOpenChange={setCreateOpen}
          />
        ) : null}
      </div>
  );
}
