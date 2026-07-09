// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useMemo } from 'react';
import { useAppSelector } from '@/store';
import { useAuth } from '@/hooks/useAuth';
import { can, type Action, type ProjectRole } from '@/features/auth/permissions';

export function useCurrentProject() {
  const { currentId, list } = useAppSelector((s) => s.projects);
  const { user, activeOrg } = useAuth();

  const current = useMemo(() => list.find((p) => p.id === currentId) ?? null, [list, currentId]);

  const myRole: ProjectRole | undefined = useMemo(() => {
    if (!current || !user) return undefined;
    return current.members?.find((m) => m.userId === user.id)?.projectRole;
  }, [current, user]);

  return {
    current,
    myRole,
    // Phase 2: org-level authority comes from the active org's role; project
    // role still layers on top. globalRole is no longer consulted.
    canInProject: (action: Action) =>
      activeOrg || myRole
        ? can({ globalRole: activeOrg?.role ?? 'external', projectRole: myRole }, action)
        : false,
  };
}
