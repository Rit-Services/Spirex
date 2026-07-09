// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * Display label for a user. External "unlinked" users (JIRA people imported for
 * truthful attribution who have no real Spirex account) are suffixed with
 * "(unlinked)" so authorship reads honestly without implying a real account.
 */
export function userLabel(
  user: { name: string; isExternal?: boolean } | null | undefined,
  fallback = 'Unassigned',
): string {
  if (!user) return fallback;
  return user.isExternal ? `${user.name} (unlinked)` : user.name;
}
