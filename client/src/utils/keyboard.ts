// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

// True when the event target is something the user is actively typing into:
// real text inputs, textareas, native selects, or contenteditable nodes.
// Checkbox/radio/button-flavoured `<input>` elements do NOT count, otherwise
// page shortcuts would silently break the moment focus lands on a checkbox.
export function isTextEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type.toLowerCase();
    return (
      type !== 'checkbox' &&
      type !== 'radio' &&
      type !== 'button' &&
      type !== 'submit' &&
      type !== 'reset' &&
      type !== 'file' &&
      type !== 'color' &&
      type !== 'range'
    );
  }
  return false;
}
