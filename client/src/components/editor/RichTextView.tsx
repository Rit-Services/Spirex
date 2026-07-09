// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Video } from './videoExtension';
import { Audio } from './audioExtension';
import { useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { parseDescription } from '@/utils/legacyDescription';
import { ReadOnlyMention } from './mentionExtension';
import { ReadOnlyTicketMention } from './ticketMentionExtension';

/**
 * Read-only renderer for the rich-text value stored on Stories/Comments/Epics.
 *
 * Uses a non-editable TipTap editor instance (equivalent result to the v3-only
 * `static-renderer` package while staying on the v2 branch). `editable: false`
 * + no toolbar = pure render surface, zero XSS surface (no raw HTML ever
 * accepted — we only consume our own TipTap JSON).
 */
export function RichTextView({
  value,
  className,
  emptyLabel = 'No description yet.',
}: {
  value: string | null | undefined;
  className?: string;
  emptyLabel?: string;
}) {
  const doc = useMemo(() => parseDescription(value), [value]);

  const isEmpty =
    !doc.content ||
    doc.content.length === 0 ||
    (doc.content.length === 1 &&
      doc.content[0]?.type === 'paragraph' &&
      (!doc.content[0].content || doc.content[0].content.length === 0));

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      extensions: [StarterKit, Image, Video, Audio, Link, ReadOnlyMention, ReadOnlyTicketMention],
      content: doc,
      editorProps: {
        attributes: {
          class: cn(
            'prose prose-sm max-w-none text-foreground focus:outline-none',
            '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
            '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]',
            '[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3',
            '[&_a]:text-primary [&_a]:underline',
            '[&_img]:max-w-full [&_img]:rounded-md',
            '[&_video]:max-w-full [&_video]:rounded-md',
            '[&_audio]:w-full',
            '[&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold',
            className,
          ),
        },
      },
    },
    // Re-key the editor when the content changes so value changes take effect.
    [JSON.stringify(doc)],
  );

  useEffect(() => {
    if (!editor) return;
    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(doc)) {
      editor.commands.setContent(doc, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, JSON.stringify(doc)]);

  if (isEmpty || !editor) {
    return <p className={cn('text-sm italic text-muted-foreground', className)}>{emptyLabel}</p>;
  }

  return <EditorContent editor={editor} />;
}
