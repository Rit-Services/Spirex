// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * SCRUM time parser.
 *   Input: `2h 30m`, `1d`, `45m`, `1w 2d 3h 15m`, `2h30m`, `0h` → minutes (int).
 *   Units: m (minute), h (hour), d (day = 8h), w (week = 5d = 40h).
 *
 * Rules:
 *   - Units are case-insensitive.
 *   - Duplicate units sum (e.g. "1h 30m 15m" → 105).
 *   - Empty / whitespace-only → null (meaning "no estimate").
 *   - Invalid input → throws a typed error.
 *
 * Pure function, no deps — unit-testable in isolation.
 */

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 8 * MINUTES_PER_HOUR; // 8h
const MINUTES_PER_WEEK = 5 * MINUTES_PER_DAY; // 5d = 40h

const MULTIPLIERS: Record<string, number> = {
  m: 1,
  h: MINUTES_PER_HOUR,
  d: MINUTES_PER_DAY,
  w: MINUTES_PER_WEEK,
};

export class TimeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeParseError';
  }
}

export function parseTimeToMinutes(input: string | null | undefined): number | null {
  if (input == null) return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  // Strict match: one or more "<number><unit>" chunks separated by whitespace.
  const re = /(\d+)\s*([mhdw])/g;
  let total = 0;
  let matched = 0;
  let match: RegExpExecArray | null;
  // Walk all matches.
  while ((match = re.exec(trimmed)) !== null) {
    const n = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(n) || n < 0) {
      throw new TimeParseError(`Invalid number in "${input}"`);
    }
    total += n * MULTIPLIERS[unit];
    matched++;
  }
  if (matched === 0) throw new TimeParseError(`Could not parse "${input}" as a duration`);

  // Detect leftover non-duration tokens (e.g. "2h foo") by reconstructing and comparing.
  const stripped = trimmed.replace(/\d+\s*[mhdw]/g, '').trim();
  if (stripped.length > 0) {
    throw new TimeParseError(`Unrecognized token "${stripped}" in "${input}"`);
  }

  return total;
}

/**
 * Render minutes back to the compact "2h 30m" grammar.
 * Used in UI (time-tracking panel) and in log-work toasts.
 */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  if (minutes === 0) return '0m';
  const parts: string[] = [];
  let rem = minutes;
  const weeks = Math.floor(rem / MINUTES_PER_WEEK);
  if (weeks > 0) { parts.push(`${weeks}w`); rem -= weeks * MINUTES_PER_WEEK; }
  const days = Math.floor(rem / MINUTES_PER_DAY);
  if (days > 0) { parts.push(`${days}d`); rem -= days * MINUTES_PER_DAY; }
  const hours = Math.floor(rem / MINUTES_PER_HOUR);
  if (hours > 0) { parts.push(`${hours}h`); rem -= hours * MINUTES_PER_HOUR; }
  if (rem > 0) parts.push(`${rem}m`);
  return parts.join(' ');
}

export const TIME_UNITS = { MINUTES_PER_HOUR, MINUTES_PER_DAY, MINUTES_PER_WEEK };
