// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * SPIREX — server-side single source of truth for the product brand.
 *
 * Mirrors client/src/config/brand.ts. Every server-rendered brand surface
 * (transactional emails, etc.) reads from here. Renaming the product is a
 * ONE-LINE change — do NOT hardcode the brand name in templates again.
 *
 * NOTE: this is the *brand*, not the Jira integration or internal identifiers.
 * Things like the auth cookie name (`spirex_token`) are stable code
 * identifiers, not user-facing brand, and intentionally stay as-is.
 */
export const BRAND = {
  /** Full wordmark, used in all prose. */
  name: 'SPIREX',

  /** Wordmark split for the two-tone treatment: SPIR + EX (EX = EXecution). */
  nameLead: 'SPIR',
  nameAccent: 'EX',

  /** Compact monogram — the email "display picture" badge when no logoUrl is set. */
  monogram: 'SPX',

  /** Marketing one-liner, shown in the email signature. */
  tagline: 'Project management for engineering teams',

  /** Attribution shown on the login screen + email signature. SPIREX is
   *  open-source, maintained by RIT Services. */
  poweredBy: 'Powered by RIT Services',
  poweredByUrl: 'https://rit.services',

  /** Primary accent colour (matches the in-app brand). */
  accent: '#4f8fff',

  /**
   * Optional hosted raster logo (PNG/JPG, ~96px square) for the email header +
   * signature. Leave BLANK to render the CSS monogram badge instead — an SVG
   * (e.g. the app favicon) is NOT a valid value here because most email clients
   * refuse to render SVG. Set this to a PUBLIC https URL once a PNG is hosted.
   */
  logoUrl: '',
} as const;
