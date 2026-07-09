// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RichTextView } from '@/components/editor/RichTextView';
import { Sparkles } from 'lucide-react';
import type { EnhanceDraft, UpdateStoryInput } from '@/apis/storyApi';
import type { Story } from '@/types/scrum';

interface Props {
  story: Story;
  draft: EnhanceDraft | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Apply the selected fields — parent routes this through the normal story
   * update, so nothing is persisted unless the user confirms here. */
  onApply: (patch: UpdateStoryInput) => Promise<void>;
}

type FieldKey = 'title' | 'description' | 'acceptanceCriteria';

const FIELD_LABEL: Record<FieldKey, string> = {
  title: 'Title',
  description: 'Description',
  acceptanceCriteria: 'Acceptance criteria',
};

/**
 * Review-and-confirm dialog for AI ticket enhancement. Shows the current
 * value next to the proposed one per field; each field has its own apply
 * toggle so the user can take the parts that justify the context and keep
 * the original for the rest. Nothing saves until "Apply".
 */
export function EnhanceStoryDialog({ story, draft, open, onOpenChange, onApply }: Props) {
  const [selected, setSelected] = useState<Record<FieldKey, boolean>>({
    title: true,
    description: true,
    acceptanceCriteria: true,
  });
  const [applying, setApplying] = useState(false);

  // Fresh draft → reset the toggles to all-on.
  useEffect(() => {
    if (draft) setSelected({ title: true, description: true, acceptanceCriteria: true });
  }, [draft]);

  if (!draft) return null;

  const anySelected = selected.title || selected.description || selected.acceptanceCriteria;

  const apply = async () => {
    const patch: UpdateStoryInput = {};
    if (selected.title && draft.title.trim()) patch.title = draft.title.trim();
    if (selected.description) patch.description = draft.description;
    if (selected.acceptanceCriteria) patch.acceptanceCriteria = draft.acceptanceCriteria;
    setApplying(true);
    try {
      await onApply(patch);
      onOpenChange(false);
    } finally {
      setApplying(false);
    }
  };

  const section = (key: FieldKey, original: React.ReactNode, proposed: React.ReactNode) => (
    <section className="rounded-md border">
      <header className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <span className="text-sm font-semibold">{FIELD_LABEL[key]}</span>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={selected[key]}
            onChange={(e) => setSelected((prev) => ({ ...prev, [key]: e.target.checked }))}
            className="h-4 w-4 rounded border-input accent-primary"
            aria-label={`Apply enhanced ${FIELD_LABEL[key].toLowerCase()}`}
          />
          Apply
        </label>
      </header>
      <div className="grid gap-0 sm:grid-cols-2">
        <div className="border-b p-3 sm:border-b-0 sm:border-r">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Current
          </p>
          {original}
        </div>
        <div className={`p-3 ${selected[key] ? '' : 'opacity-40'}`}>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Proposed
          </p>
          {proposed}
        </div>
      </div>
    </section>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !applying && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" aria-hidden />
            AI enhancement — {story.key}
          </DialogTitle>
          <DialogDescription>
            Review the proposed rewrite. Only the fields marked “Apply” are saved; the rest keep
            their current value.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 flex-1 space-y-4 overflow-y-auto px-6">
          {section(
            'title',
            <p className="text-sm">{story.title}</p>,
            <p className="text-sm font-medium">{draft.title}</p>,
          )}
          {section(
            'description',
            <RichTextView value={story.description} />,
            <RichTextView value={draft.description} />,
          )}
          {section(
            'acceptanceCriteria',
            <pre className="whitespace-pre-wrap font-sans text-sm">
              {story.acceptanceCriteria?.trim() || '(empty)'}
            </pre>,
            <pre className="whitespace-pre-wrap font-sans text-sm">{draft.acceptanceCriteria}</pre>,
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Keep original
          </Button>
          <Button onClick={apply} disabled={applying || !anySelected}>
            {applying ? 'Applying…' : 'Apply selected'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
