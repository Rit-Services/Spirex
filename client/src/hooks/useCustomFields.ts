// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useCallback, useEffect, useState } from 'react';
import { customFieldApi } from '@/apis/customFieldApi';
import type { CustomFieldDefinition } from '@/types/scrum';

/**
 * Fetch a project's custom field definitions. Definitions change rarely and
 * per-project, so a simple local fetch (no redux slice) keeps this cheap;
 * `refresh` re-reads after the settings page mutates them.
 */
export function useCustomFields(projectId: string | undefined) {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      setFields(await customFieldApi.list(projectId));
    } catch {
      // Non-fatal: panels simply render without custom fields.
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { fields, loading, refresh };
}
