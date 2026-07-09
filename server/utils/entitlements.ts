// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

// Per-feature entitlements. In the open-source build there is no paid tier or
// metering layer, so entitlements resolve purely from the environment: every
// feature is ON, EXCEPT the AI features, which require an AI provider to be
// configured (an API key). When no provider is set up, the AI flags resolve to
// false so the UI hides those entry points instead of letting a click hit a
// "not configured" error. All four keys below are AI features.

import { config } from '../config/index.js';

export const ENTITLEMENT_KEYS = [
  'aiVoiceImport',
  'aiDocImport',
  'aiImageImport',
  'aiEnhance',
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export type Entitlements = Partial<Record<EntitlementKey, boolean>>;

/** Default flags for a brand-new org (everything on; the operator dials back). */
export function defaultEntitlements(): Entitlements {
  return { aiVoiceImport: true, aiDocImport: true, aiImageImport: true, aiEnhance: true };
}

/**
 * Coerce arbitrary input into a clean entitlements map: only known keys, only
 * boolean values. Drops anything unexpected so a bad payload can never poison
 * the stored JSON.
 */
export function normalizeEntitlements(input: unknown): Entitlements {
  const out: Entitlements = {};
  if (input && typeof input === 'object') {
    for (const key of ENTITLEMENT_KEYS) {
      const value = (input as Record<string, unknown>)[key];
      if (typeof value === 'boolean') out[key] = value;
    }
  }
  return out;
}

/** Safe read of a single flag from a raw JSON value. Absent/!true → false. */
export function getEntitlement(entitlements: unknown, key: EntitlementKey): boolean {
  if (entitlements && typeof entitlements === 'object') {
    return (entitlements as Record<string, unknown>)[key] === true;
  }
  return false;
}

/**
 * True when an AI transport is actually usable from the current environment
 * (a plain API-key path): the direct Anthropic API (ANTHROPIC_API_KEY +
 * CLAUDE_MODEL) or a LiteLLM proxy (LITELLM_BASE_URL + a model). This is what
 * lets a self-hoster turn AI on/off simply by setting — or not setting — keys.
 */
export function isAiConfigured(): boolean {
  const anthropic = Boolean(config.claude.apiKey && config.claude.model);
  const litellm = Boolean(config.litellm.baseUrl && (config.litellm.model || config.claude.model));
  return anthropic || litellm;
}

/**
 * The effective entitlements for this open-source instance. There is no paid
 * tier, so every feature is on — except AI features, gated on isAiConfigured().
 * The stored per-org JSON is intentionally ignored (no metering layer in OSS);
 * this single resolver feeds BOTH the client `me` response and the server-side
 * requireEntitlement enforcement, so the UI and the API can never disagree.
 */
export function effectiveEntitlements(): Entitlements {
  const ai = isAiConfigured();
  return { aiVoiceImport: ai, aiDocImport: ai, aiImageImport: ai, aiEnhance: ai };
}
