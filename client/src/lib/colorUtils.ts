// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * Color helpers shared by colored-chip surfaces (epic chips, labels, workflow
 * pills). Kept tiny and dependency-free.
 */

/** Turn a `#RRGGBB` hex into an `rgba(...)` string at the given alpha. Returns
 *  the input unchanged if it isn't a 6-digit hex (defensive — server data is
 *  always valid, but imported/legacy values shouldn't crash a render). */
export function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Pick black or white text for legibility on a colored background, via the
 *  perceived-luminance (YIQ) rule. */
export function readableTextOn(hex: string): string {
  const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim());
  if (!m) return '#000000';
  const num = parseInt(m[1], 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? '#000000' : '#ffffff';
}
