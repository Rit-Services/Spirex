// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useMemo } from 'react';
import { MarkdownView } from './MarkdownView';

interface Props {
  value: string | null;
  onChange: (next: string) => void;
  disabled?: boolean;
}

interface ChecklistItem {
  lineIdx: number;
  checked: boolean;
  text: string;
}

const CHECK_LINE = /^(\s*)-\s*\[( |x|X)\]\s?(.*)$/;

function parseItems(value: string): ChecklistItem[] {
  return value.split('\n').reduce<ChecklistItem[]>((acc, line, idx) => {
    const m = line.match(CHECK_LINE);
    if (m) acc.push({ lineIdx: idx, checked: m[2].toLowerCase() === 'x', text: m[3] });
    return acc;
  }, []);
}

function toggleLine(value: string, lineIdx: number): string {
  const lines = value.split('\n');
  const m = lines[lineIdx]?.match(CHECK_LINE);
  if (!m) return value;
  const nextMark = m[2].toLowerCase() === 'x' ? ' ' : 'x';
  lines[lineIdx] = `${m[1]}- [${nextMark}] ${m[3]}`;
  return lines.join('\n');
}

export function AcceptanceCriteriaChecklist({ value, onChange, disabled }: Props) {
  const text = value ?? '';
  const items = useMemo(() => parseItems(text), [text]);

  if (!text.trim()) {
    return (
      <p className="text-sm italic text-muted-foreground">
        No acceptance criteria yet — edit the story to add Gherkin or a checklist.
      </p>
    );
  }

  if (items.length === 0) {
    return <MarkdownView value={text} />;
  }

  const done = items.filter((i) => i.checked).length;

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        {done} of {items.length} done
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.lineIdx} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={item.checked}
              disabled={disabled}
              onChange={() => onChange(toggleLine(text, item.lineIdx))}
              // Keep a checkbox tick from bubbling to an ancestor click-to-edit
              // wrapper (the story panel) — toggling a box must not open the
              // text editor. The native toggle still fires via onChange.
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
            />
            <span
              className={
                item.checked ? 'text-muted-foreground line-through' : 'text-foreground'
              }
            >
              {item.text || <span className="italic text-muted-foreground">(empty)</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
