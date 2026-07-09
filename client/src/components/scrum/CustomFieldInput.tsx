// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CustomFieldDefinition, CustomFieldPrimitive } from '@/types/scrum';

interface Props {
  field: CustomFieldDefinition;
  value: CustomFieldPrimitive;
  /** Fired when the user commits a change (blur for text/number, immediately
   * for select/checkbox/date). `null` means "cleared". */
  onCommit: (value: CustomFieldPrimitive) => void;
  disabled?: boolean;
}

/**
 * One editor for one custom field, switched on the definition's type. Shared
 * by the create dialog and the story detail panel so both render identically.
 */
export function CustomFieldInput({ field, value, onCommit, disabled }: Props) {
  switch (field.type) {
    case 'text':
      return (
        <Input
          aria-label={field.name}
          // key the default value so switching stories re-seeds the input
          key={String(value ?? '')}
          defaultValue={typeof value === 'string' ? value : ''}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next !== (value ?? '')) onCommit(next === '' ? null : next);
          }}
          disabled={disabled}
          className="h-8"
        />
      );
    case 'number':
      return (
        <Input
          aria-label={field.name}
          key={String(value ?? '')}
          type="number"
          defaultValue={typeof value === 'number' ? value : ''}
          onBlur={(e) => {
            const raw = e.target.value;
            const next = raw === '' ? null : Number(raw);
            if (next !== value) onCommit(next);
          }}
          disabled={disabled}
          className="h-8 w-32"
        />
      );
    case 'date':
      return (
        <Input
          aria-label={field.name}
          key={String(value ?? '')}
          type="date"
          defaultValue={typeof value === 'string' ? value.slice(0, 10) : ''}
          onBlur={(e) => {
            const next = e.target.value === '' ? null : e.target.value;
            if (next !== ((value as string | null)?.slice(0, 10) ?? null)) onCommit(next);
          }}
          disabled={disabled}
          className="h-8 w-40"
        />
      );
    case 'select':
      return (
        <Select
          value={typeof value === 'string' && value !== '' ? value : '__none__'}
          onValueChange={(v) => onCommit(v === '__none__' ? null : v)}
          disabled={disabled}
        >
          <SelectTrigger className="h-8" aria-label={field.name}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">(none)</SelectItem>
            {field.options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'checkbox':
      return (
        <input
          type="checkbox"
          aria-label={field.name}
          checked={value === true}
          onChange={(e) => onCommit(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-input accent-primary"
        />
      );
  }
}
