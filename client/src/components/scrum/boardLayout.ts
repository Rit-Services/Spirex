// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

// Single source of truth for workflow-board column sizing. Shared by the active
// sprint board (Board.tsx/BoardColumn.tsx), the completed/planned sprint board
// (SprintDetail.tsx), and the epic board (EpicDetail.tsx) so every workflow
// board sizes its columns identically — fixed-length instead of each surface
// reinventing widths and drifting apart.

/**
 * Up to this many workflow columns stretch to fill the board width. Beyond it,
 * columns switch to a fixed width and the board scrolls horizontally so cards
 * stay readable instead of being squeezed into slivers.
 */
export const MAX_FIT_COLUMNS = 6;

/** True when a board with `columnCount` columns should use fixed-width + scroll. */
export function boardScrolls(columnCount: number): boolean {
  return columnCount > MAX_FIT_COLUMNS;
}

/**
 * Per-column width class. `fixed` (the scrolling layout) → a readable 280px
 * column; otherwise columns share the row equally and may shrink to fit.
 */
export function columnWidthClass(fixed?: boolean): string {
  return fixed ? 'w-[280px] shrink-0' : 'min-w-0 flex-1 basis-0';
}

/** Outer row container class — scroll past the fit threshold, else fill width. */
export function boardRowClass(fixed: boolean): string {
  return fixed ? 'overflow-x-auto pb-1' : 'w-full';
}
