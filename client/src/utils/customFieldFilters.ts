// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * Custom field filters live in the URL as `cf_<definitionId>=<value>` params,
 * mirroring the existing epic/priority/type/assignee param convention. The
 * API expects them folded into ONE JSON-encoded `customFields` query param —
 * these helpers translate between the two.
 */

export const CF_PARAM_PREFIX = 'cf_';

/** All cf_* params currently set (non-empty). */
export function customFieldParamKeys(params: URLSearchParams): string[] {
  return [...params.keys()].filter((k) => k.startsWith(CF_PARAM_PREFIX) && params.get(k));
}

export function countCustomFieldFilters(params: URLSearchParams): number {
  return customFieldParamKeys(params).length;
}

/**
 * Fold cf_* params into the JSON string the list API expects, or undefined
 * when none are set. 'true'/'false' coerce to booleans for checkbox fields —
 * a select OPTION literally named "true" would collide, an accepted edge.
 */
export function collectCustomFieldFilters(params: URLSearchParams): string | undefined {
  const map: Record<string, string | boolean> = {};
  for (const key of customFieldParamKeys(params)) {
    const raw = params.get(key)!;
    const fieldId = key.slice(CF_PARAM_PREFIX.length);
    map[fieldId] = raw === 'true' ? true : raw === 'false' ? false : raw;
  }
  return Object.keys(map).length ? JSON.stringify(map) : undefined;
}

export function clearCustomFieldFilters(params: URLSearchParams): void {
  for (const key of customFieldParamKeys(params)) params.delete(key);
}
