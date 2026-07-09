// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useSearchParams } from 'react-router-dom';
import { StoryDetailContent } from './StoryDetailContent';

/**
 * The global right-side story drawer, mounted in AppLayout and driven by the
 * `?story=KEY` search param. All rendering and editing lives in the shared
 * `StoryDetailContent`; this wrapper only resolves the key from the URL.
 * The full-page equivalent is the `/projects/:id/stories/:key` route.
 */
export function StoryDetailPanel() {
  const [params] = useSearchParams();
  const storyKey = params.get('story');
  if (!storyKey) return null;
  return <StoryDetailContent storyKey={storyKey} mode="drawer" />;
}
