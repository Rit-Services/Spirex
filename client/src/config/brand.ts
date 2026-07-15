// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * SPIREX — single source of truth for the product brand.
 *
 * SPIREX = Sprint · Planning · Iteration · Reporting · EXecution
 *
 * Every user-facing brand surface (wordmark, loader, page title, prose) reads
 * from here. Renaming the product is now a ONE-LINE change — not a 100-file
 * find-and-replace. Do NOT hardcode the brand name in components again.
 *
 * NOTE: this is the *brand*, not the Jira integration. Labels like
 * "Import from JIRA" refer to Atlassian Jira (a real external product) and
 * must stay "JIRA". They do not live here.
 */
export const BRAND = {
  /** Full wordmark. */
  name: 'SPIREX',

  /** Wordmark split for the two-tone treatment: SPIR + EX (EX = EXecution). */
  nameLead: 'SPIR',
  nameAccent: 'EX',

  /** Compact monogram used in tight chips / favicapsules. */
  monogram: 'SPX',

  /** Short descriptor shown under the wordmark. */
  subtitle: 'Workspace',

  /** Marketing one-liner (auth footer, meta description). */
  tagline: 'Project management for engineering teams',

  /** Attribution shown on the login screen. SPIREX is open-source, maintained
   *  by RIT Services. */
  poweredBy: 'Powered by RIT Services',
  poweredByUrl: 'https://www.rit.services',

  /** SPDX short id of the license SPIREX ships under. */
  license: 'AGPL-3.0',

  /**
   * Public source location, surfaced in-app to satisfy AGPL-3.0 §13: anyone who
   * interacts with a running SPIREX over the network must be able to reach the
   * source of THAT running version. If you self-host a MODIFIED build, set
   * VITE_SOURCE_URL to your own fork — the default only points at the canonical
   * upstream repo.
   */
  sourceUrl: import.meta.env.VITE_SOURCE_URL || 'https://github.com/Rit-Services/Spirex',

  /**
   * The acronym, expanded. Each entry highlights its leading letter(s) so the
   * mark visually spells itself: S·P·I·R·EX. Used by the brand loader.
   */
  acronym: [
    { hi: 'S',  rest: 'print'    },
    { hi: 'P',  rest: 'lanning'  },
    { hi: 'I',  rest: 'teration' },
    { hi: 'R',  rest: 'eporting' },
    { hi: 'EX', rest: 'ecution'  },
  ],
} as const;

/** "Sprint · Planning · Iteration · Reporting · EXecution" */
export const BRAND_ACRONYM_LINE = BRAND.acronym
  .map((w) => w.hi + w.rest)
  .join(' · ');
