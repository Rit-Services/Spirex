// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppSelector } from '@/store';
import { BRAND } from '@/config/brand';

/**
 * Keeps the browser tab title in sync with the project open in the current URL.
 * On a `/projects/:id…` route the tab reads "<Project> · SPIREX"; everywhere
 * else it falls back to the bare brand name.
 *
 * We resolve the project from the pathname — NOT from `projects.currentId`,
 * which lingers after you leave a project page and would leave a stale project
 * name in the tab on /dashboard, /admin, etc.
 */
export function useDocumentTitle() {
  const { pathname } = useLocation();
  const list = useAppSelector((s) => s.projects.list);

  useEffect(() => {
    const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
    const project = projectId ? list.find((p) => p.id === projectId) : undefined;

    document.title = project ? `${project.name} · ${BRAND.name}` : BRAND.name;
  }, [pathname, list]);
}
