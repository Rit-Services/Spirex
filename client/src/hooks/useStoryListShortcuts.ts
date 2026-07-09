// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, type RefObject } from 'react';
import { isTextEditableTarget } from '@/utils/keyboard';

interface Options {
  /** When provided, `/` focuses+selects this input. */
  searchInputRef?: RefObject<HTMLInputElement>;
  /** When provided, `f`/`F` calls this. Pages without a toggleable filter
   *  panel can leave it undefined — `f` then becomes a no-op for them. */
  toggleFilters?: () => void;
  /** True iff there's at least one selected story. Drives Esc + Delete. */
  hasSelection: boolean;
  clearSelection: () => void;
  /** When provided, Ctrl/Cmd+A selects every visible story. */
  selectAll?: () => void;
  /** When provided AND `canDelete`, Delete/Backspace fires this. */
  onBulkDelete?: () => void;
  canDelete?: boolean;
}

/**
 * Page-local shortcuts for any story-list view (Backlog, Board, SprintDetail,
 * EpicDetail). Bindings only fire when the corresponding capability is wired
 * by the caller — e.g. a page without a search box just omits
 * `searchInputRef` and `/` becomes a no-op there.
 */
export function useStoryListShortcuts({
  searchInputRef,
  toggleFilters,
  hasSelection,
  clearSelection,
  selectAll,
  onBulkDelete,
  canDelete,
}: Options) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inEditable = isTextEditableTarget(e.target);
      const mod = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd+A — select every visible story. Only when the page wired
      // `selectAll` AND focus isn't in a real text field (so the browser's
      // native "select all text" still works inside inputs).
      if (mod && (e.key === 'a' || e.key === 'A') && !inEditable) {
        if (!selectAll) return;
        e.preventDefault();
        selectAll();
        return;
      }
      if (mod) return; // ignore other modifier combos

      if (inEditable) {
        // Inside a text field, let the input handle every key — except Esc,
        // which we use to blur out of the search box.
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }

      switch (e.key) {
        case '/':
          if (!searchInputRef?.current) return;
          e.preventDefault();
          searchInputRef.current.focus();
          searchInputRef.current.select();
          break;
        case 'Escape':
          if (hasSelection) clearSelection();
          break;
        case 'f':
        case 'F':
          if (!toggleFilters) return;
          e.preventDefault();
          toggleFilters();
          break;
        case 'Delete':
        case 'Backspace':
          if (hasSelection && canDelete && onBulkDelete) {
            e.preventDefault();
            onBulkDelete();
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    searchInputRef,
    toggleFilters,
    hasSelection,
    clearSelection,
    selectAll,
    onBulkDelete,
    canDelete,
  ]);
}
