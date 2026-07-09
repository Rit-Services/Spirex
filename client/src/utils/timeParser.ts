// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

/**
 * Client mirror of server/utils/timeParser.ts. Kept in sync — both trimmed.
 * Grammar: "2h 30m", "1d", "45m", "1w 2d 3h 15m". Units: m / h / d(=8h) / w(=5d).
 */

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 8 * MINUTES_PER_HOUR;
const MINUTES_PER_WEEK = 5 * MINUTES_PER_DAY;

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
  const re = /(\d+)\s*([mhdw])/g;
  let total = 0;
  let matched = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed)) !== null) {
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n < 0) throw new TimeParseError(`Invalid number in "${input}"`);
    total += n * MULTIPLIERS[match[2]];
    matched++;
  }
  if (matched === 0) throw new TimeParseError(`Could not parse "${input}"`);
  const stripped = trimmed.replace(/\d+\s*[mhdw]/g, '').trim();
  if (stripped.length > 0) throw new TimeParseError(`Unrecognized "${stripped}"`);
  return total;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  if (minutes === 0) return '0m';
  const parts: string[] = [];
  let rem = minutes;
  const w = Math.floor(rem / MINUTES_PER_WEEK);
  if (w > 0) { parts.push(`${w}w`); rem -= w * MINUTES_PER_WEEK; }
  const d = Math.floor(rem / MINUTES_PER_DAY);
  if (d > 0) { parts.push(`${d}d`); rem -= d * MINUTES_PER_DAY; }
  const h = Math.floor(rem / MINUTES_PER_HOUR);
  if (h > 0) { parts.push(`${h}h`); rem -= h * MINUTES_PER_HOUR; }
  if (rem > 0) parts.push(`${rem}m`);
  return parts.join(' ');
}
