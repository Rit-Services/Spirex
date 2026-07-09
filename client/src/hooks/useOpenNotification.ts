// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/store';
import { setCurrentProject } from '@/store/projectSlice';
import { setActiveOrgId } from '@/config/activeOrg';
import { useAuth } from '@/hooks/useAuth';
import type { AppNotification } from '@/types/scrum';

/**
 * Click-through for a notification — shared by the bell dropdown and the full
 * /notifications page so the (subtle) cross-org contract lives in ONE place.
 * Marking the row read is the caller's job; this only navigates.
 */
export function useOpenNotification() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { activeOrg } = useAuth();

  return useCallback(
    (n: AppNotification) => {
      // Invites point at an org the user is NOT a member of yet — never switch
      // into it; just open the invitations page to accept/decline.
      if (n.type === 'org_invite') {
        navigate('/invitations');
        return;
      }

      if (!n.storyKey) return;

      // Cross-org notification: pin its org for this tab and HARD-reload so
      // every org-scoped slice (sidebar, board, permissions, search)
      // reinitializes under that org BEFORE the ticket opens. Mirrors the
      // org-switcher's reload contract.
      if (n.organizationId && n.organizationId !== activeOrg?.id) {
        const target = n.projectId
          ? `/projects/${n.projectId}/stories/${n.storyKey}`
          : `/dashboard?story=${encodeURIComponent(n.storyKey)}`;
        setActiveOrgId(n.organizationId);
        dispatch(setCurrentProject(null));
        window.location.assign(target);
        return;
      }

      // Same org → fast SPA navigation.
      if (n.projectId) {
        // Preferred: open the full-page ticket view directly.
        navigate(`/projects/${n.projectId}/stories/${n.storyKey}`);
      } else {
        // Fallback for notifications whose story was deleted (no projectId) —
        // push ?story=KEY so the drawer still resolves the key from any route.
        const url = new URL(window.location.href);
        url.searchParams.set('story', n.storyKey);
        navigate(`${url.pathname}?${url.searchParams.toString()}`);
      }
    },
    [navigate, dispatch, activeOrg?.id],
  );
}
