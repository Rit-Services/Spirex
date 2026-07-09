// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Moon, Sun, Settings, Search, User, Plus, Keyboard, Menu } from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useAppSelector } from '@/store';
import { BrandMark } from '@/components/BrandMark';
import { OrgBrand } from '@/components/OrgBrand';
import { ProjectSwitcher } from '@/components/projects/ProjectSwitcher';
import { CreateStoryDialog } from '@/components/scrum/CreateStoryDialog';
import { toast } from 'sonner';

interface TopbarProps {
  onSearchOpen?: () => void;
  onHelpOpen?: () => void;
  /**
   * When provided, the Topbar renders a hamburger trigger that opens the
   * sidebar drawer — used at compact widths where the sidebar is hidden.
   */
  onMenuOpen?: () => void;
}

function UserAvatar({ name }: { name?: string | null }) {
  const initials = name
    ? name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-[11px] font-bold text-primary-foreground shadow-glow ring-1 ring-primary/20">
      {initials}
    </div>
  );
}

function useShortcutHint() {
  const [hint, setHint] = useState('Ctrl K');
  useEffect(() => {
    const isMac =
      typeof navigator !== 'undefined' &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
    setHint(isMac ? '⌘ K' : 'Ctrl K');
  }, []);
  return hint;
}

export function Topbar({ onSearchOpen, onHelpOpen, onMenuOpen }: TopbarProps) {
  const { user, logout, can, isSuperAdmin } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const currentProjectId = useAppSelector((s) => s.projects.currentId);
  const shortcut = useShortcutHint();

  const handleLogout = async () => {
    await logout();
    toast.success('Signed out');
    navigate('/login', { replace: true });
  };

  return (
    <header
      className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-card/95 px-4 shadow-sm backdrop-blur-md"
      style={{
        backgroundImage:
          'linear-gradient(to bottom, hsl(var(--card) / 0.96), hsl(var(--card) / 0.92))',
      }}
    >
      {/* Subtle animated accent line at bottom border */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.35) 30%, hsl(var(--primary) / 0.5) 50%, hsl(var(--primary) / 0.35) 70%, transparent 100%)',
          opacity: 0.5,
        }}
      />

      {/* ── LEFT: Brand + project switcher ─────────────────────────────── */}
      {/* `shrink-0` reserves the brand + project-switcher footprint so the
          search bar can never push them off-screen at narrow widths. The
          ProjectSwitcher itself opts into a compact (key-only) presentation
          below the `lg` breakpoint to keep the reserved width small. */}
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        {onMenuOpen ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuOpen}
            aria-label="Open menu"
            className="lg:hidden"
            data-testid="open-sidebar-drawer"
          >
            <Menu className="h-4 w-4" />
          </Button>
        ) : null}
        {/* Brand slot. The superadmin has no "current org", so they keep the
            SPIREX product mark here. Tenant users instead see their org's logo
            + name (the future multi-org switcher mounts here). The project
            switcher is likewise meaningless for the superadmin. */}
        {isSuperAdmin ? (
          <BrandMark size={28} />
        ) : (
          <>
            <OrgBrand />
            <span className="hidden h-6 w-px bg-border/70 md:inline-block" aria-hidden="true" />
            <div className="hidden min-w-0 md:block">
              <ProjectSwitcher />
            </div>
          </>
        )}
      </div>

      {/* ── CENTER: Command bar ────────────────────────────────────────── */}
      {/* The search bar fills the gap between brand and actions but is
          allowed to shrink (min-w-0 + flex-1) and capped to a comfortable
          width so it stays usable at 1024px without overlapping neighbours. */}
      <div className="mx-2 hidden min-w-0 flex-1 md:block lg:mx-auto lg:max-w-md">
        <button
          type="button"
          onClick={onSearchOpen}
          aria-label="Open command bar"
          className="group relative flex w-full items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground transition-all hover:border-primary/50 hover:bg-muted/60 hover:text-foreground hover:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Search className="h-3.5 w-3.5 shrink-0 transition-colors group-hover:text-primary" />
          <span className="flex-1 truncate text-left text-[13px]">
            <span className="lg:hidden">Search…</span>
            <span className="hidden lg:inline">
              {isSuperAdmin
                ? 'Search organizations, members…'
                : 'Search issues, projects, sprints…'}
            </span>
          </span>
          <kbd className="ml-auto hidden shrink-0 items-center gap-0.5 rounded border bg-background/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground/80 shadow-sm sm:inline-flex">
            {shortcut}
          </kbd>
        </button>
      </div>

      {/* ── RIGHT: Actions ──────────────────────────────────────────────── */}
      <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
        {/* Mobile search */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onSearchOpen}
          aria-label="Open search"
          className="md:hidden"
        >
          <Search className="h-4 w-4" />
        </Button>

        {/* Quick action: Create issue (only when a tenant user has a project
            selected). Never for the superadmin — they're a platform operator
            with no project, and currentProjectId can linger in Redux from a
            previous tenant session in the same tab. */}
        {!isSuperAdmin && currentProjectId ? (
          <CreateStoryDialog
            projectId={currentProjectId}
            trigger={
              <Button
                size="sm"
                className="hidden h-8 gap-1.5 rounded-md bg-gradient-to-br from-primary to-primary/85 px-2.5 text-[12.5px] font-semibold text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.4),0_4px_12px_-2px_hsl(var(--primary)/0.45)] hover:from-primary/95 hover:to-primary/80 sm:inline-flex"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                Create
              </Button>
            }
          />
        ) : null}

        <NotificationBell />

        {onHelpOpen ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onHelpOpen}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <Keyboard className="h-4 w-4" />
          </Button>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Visual divider before user menu */}
        <span className="mx-1 hidden h-6 w-px bg-border/70 sm:inline-block" aria-hidden="true" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2 px-2" aria-label="User menu">
              <UserAvatar name={user?.name} />
              <span className="hidden text-sm font-medium sm:block">{user?.name ?? 'Account'}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <div className="mx-1 mb-1 flex items-center gap-3 rounded-lg bg-muted/50 px-2.5 py-2.5 ring-1 ring-border/40">
              <UserAvatar name={user?.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold leading-tight">{user?.name}</p>
                <p className="truncate text-[11px] text-muted-foreground/70 leading-tight mt-0.5">{user?.email}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            {can('user:manage') ? (
              <DropdownMenuItem asChild>
                <Link to="/admin/users">
                  <Settings className="!text-sky-600" />
                  Manage users
                </Link>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <Link to="/profile">
                <User className="!text-emerald-600" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={handleLogout}
              className="text-destructive focus:bg-destructive/[0.08] focus:text-destructive"
            >
              <LogOut className="!text-red-600" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
