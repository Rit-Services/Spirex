// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * Per-tab active organization (Phase 2).
 *
 * The auth cookie is shared across tabs (one identity), but the *active org* is
 * deliberately per-tab: stored in `sessionStorage`, not `localStorage`. That
 * lets a user operate org A in one tab and org B in another simultaneously —
 * each tab sends its own `X-Org-Id` header (see httpClient request interceptor).
 *
 * A fresh tab starts empty and defaults to the user's first org (resolved
 * server-side) until the switcher pins a selection.
 */
const ACTIVE_ORG_KEY = 'ritjira.activeOrgId';

export function getActiveOrgId(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    // sessionStorage can throw in locked-down/private contexts — degrade to
    // "no selection" (server falls back to first org).
    return null;
  }
}

/** Pin the active org for this tab (used by the switcher and on fresh login). */
export function setActiveOrgId(orgId: string): void {
  try {
    sessionStorage.setItem(ACTIVE_ORG_KEY, orgId);
  } catch {
    /* ignore — header just won't be sent this tab */
  }
}

/** Set the active org only if the tab hasn't already pinned one. */
export function seedActiveOrgId(orgId: string): void {
  if (!getActiveOrgId()) setActiveOrgId(orgId);
}

export function clearActiveOrgId(): void {
  try {
    sessionStorage.removeItem(ACTIVE_ORG_KEY);
  } catch {
    /* ignore */
  }
}
