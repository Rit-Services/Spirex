// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Video } from './videoExtension';
import { Audio } from './audioExtension';
import { buildMentionExtension } from './mentionExtension';
import type { MentionItem } from './MentionList';
import { buildTicketMentionExtension } from './ticketMentionExtension';
import type { TicketItem } from './TicketMentionList';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Code,
  Image as ImageIcon,
  Heading1,
  Heading2,
  Quote,
  Link2,
} from 'lucide-react';
import { attachmentApi } from '@/apis/attachmentApi';
import { extractError } from '@/config/httpClient';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { parseDescription, type TiptapDoc } from '@/utils/legacyDescription';

interface Props {
  value: string | null | undefined;
  onChange: (nextDoc: TiptapDoc) => void;
  projectId: string;
  storyId?: string | null;
  placeholder?: string;
  minHeight?: string;
  ariaLabel?: string;
  mentionItems?: MentionItem[];
  /** When provided, `#` suggests project tickets to tag (mirrors mentionItems). */
  ticketItems?: TicketItem[];
  autoFocus?: boolean;
  /** Fired with the attachment id each time a media file finishes uploading.
   *  Lets a parent (e.g. the create dialog) track inline uploads so it can
   *  delete the orphans if the form is cancelled or the file is removed. */
  onUpload?: (attachmentId: string) => void;
}

/** Imperative API for parents that need to drive the editor (e.g. a toolbar
 *  hint that, on click, inserts `@`/`#` and pops the suggestion menu). */
export interface RichTextEditorHandle {
  /** Focus the editor and insert a suggestion trigger char (`@` or `#`),
   *  prefixing a space when needed so the suggestion plugin actually fires. */
  insertTrigger: (ch: string) => void;
  focus: () => void;
}

/** Files we can embed inline as a node: images, video, audio. */
const isMediaType = (type: string) =>
  type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/');

export const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  {
    value,
    onChange,
    projectId,
    storyId,
    placeholder = 'Write something…',
    minHeight = '140px',
    ariaLabel = 'Rich text editor',
    mentionItems,
    ticketItems,
    autoFocus = false,
    onUpload,
  },
  ref,
) {
  // Keep a stable ref so the suggestion `items()` resolver always sees the
  // latest list without recreating the editor when members reload.
  const mentionItemsRef = useRef<MentionItem[]>(mentionItems ?? []);
  useEffect(() => {
    mentionItemsRef.current = mentionItems ?? [];
  }, [mentionItems]);

  const mentionExtension = useMemo(
    () => (mentionItems !== undefined ? buildMentionExtension(() => mentionItemsRef.current) : null),
    // Build only once per editor instance; the resolver reads the live ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mentionItems !== undefined],
  );

  // Same stable-ref pattern for `#` ticket tags.
  const ticketItemsRef = useRef<TicketItem[]>(ticketItems ?? []);
  useEffect(() => {
    ticketItemsRef.current = ticketItems ?? [];
  }, [ticketItems]);

  const ticketMentionExtension = useMemo(
    () =>
      ticketItems !== undefined ? buildTicketMentionExtension(() => ticketItemsRef.current) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticketItems !== undefined],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ inline: false, allowBase64: false }),
      Video,
      Audio,
      Link.configure({ openOnClick: true, autolink: true }),
      Placeholder.configure({ placeholder }),
      ...(mentionExtension ? [mentionExtension] : []),
      ...(ticketMentionExtension ? [ticketMentionExtension] : []),
    ],
    content: parseDescription(value),
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON() as TiptapDoc);
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none focus-visible:shadow-none',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]',
          '[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3',
          '[&_a]:text-primary [&_a]:underline',
          '[&_img]:max-w-full [&_img]:rounded-md',
          '[&_video]:max-w-full [&_video]:rounded-md',
          '[&_audio]:w-full',
          '[&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold',
        ),
        'aria-label': ariaLabel,
      },
      handlePaste(_view, event) {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const files: File[] = [];
        for (const item of Array.from(items)) {
          if (item.kind !== 'file' || !isMediaType(item.type)) continue;
          const f = item.getAsFile();
          if (f) files.push(f);
        }
        if (files.length === 0) return false;
        event.preventDefault();
        void uploadAndInsertFiles(files);
        return true;
      },
      handleDrop(_view, event, _slice, moved) {
        if (moved) return false;
        const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
        const media = files.filter((f) => isMediaType(f.type));
        if (media.length === 0) return false;
        event.preventDefault();
        void uploadAndInsertFiles(media);
        return true;
      },
    },
  });

  const mediaKind = (file: File): 'image' | 'video' | 'audio' | null =>
    file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('audio/')
        ? 'audio'
        : file.type.startsWith('image/')
          ? 'image'
          : null;

  // Upload a batch of media files sequentially and insert each at the caret in
  // document order. The API is one-file-per-request, so multiple = N requests
  // in series; a single shared toast tracks "Uploading 2/3… 45%" and each file
  // lands as its node followed by an empty paragraph (caret drops to a fresh
  // line). One failure is reported but doesn't abort the rest of the batch.
  async function uploadAndInsertFiles(files: File[]) {
    const media = files
      .map((file) => ({ file, kind: mediaKind(file) }))
      .filter((m): m is { file: File; kind: 'image' | 'video' | 'audio' } => m.kind !== null);
    if (media.length === 0) return;

    const multiple = media.length > 1;
    const toastId = toast.loading(
      multiple ? `Uploading ${media.length} files…` : `Uploading ${media[0].kind}…`,
    );
    let ok = 0;
    for (let i = 0; i < media.length; i++) {
      const { file, kind } = media[i];
      const head = multiple ? `Uploading ${i + 1}/${media.length}` : `Uploading ${kind}`;
      const tail = multiple ? `Finishing ${i + 1}/${media.length}` : `Finishing ${kind}`;
      try {
        const att = await attachmentApi.upload({
          file,
          projectId,
          storyId,
          onProgress: (pct) =>
            toast.loading(pct === null ? `${tail}…` : `${head}… ${pct}%`, { id: toastId }),
        });
        // Always build the absolute URL via fileUrl(); the relative att.url
        // from the server only works when FE and BE share an origin (prod
        // behind nginx). In dev Vite ≠ API origin and a relative /api/...
        // src falls through to index.html → broken media.
        // Report the upload BEFORE inserting — the file now exists on the
        // server, so the parent must be able to clean it up even if the editor
        // has since been torn down (dialog closed mid-upload).
        onUpload?.(att.id);
        const src = attachmentApi.fileUrl(att.id);
        const node =
          kind === 'video'
            ? { type: 'video', attrs: { src, title: att.filename } }
            : kind === 'audio'
              ? { type: 'audio', attrs: { src, title: att.filename } }
              : { type: 'image', attrs: { src, alt: att.filename } };
        // Guard against a destroyed editor: `?.` only covers null, not a
        // torn-down instance — calling commands on that throws.
        if (editor && !editor.isDestroyed) {
          editor.chain().focus().insertContent([node, { type: 'paragraph' }]).run();
        }
        ok++;
      } catch (err) {
        toast.error(`${file.name}: ${extractError(err).message}`, { id: toastId });
      }
    }
    if (ok > 0) {
      const single = media[0].kind;
      toast.success(
        multiple ? `Added ${ok} files` : `${single.charAt(0).toUpperCase()}${single.slice(1)} added`,
        { id: toastId },
      );
    }
  }

  const pickMedia = () => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,audio/*';
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      if (files.length) void uploadAndInsertFiles(files);
    };
    input.click();
  };

  // Sync external value changes (e.g. cancel-edit resets draft to server value).
  useEffect(() => {
    if (!editor) return;
    const incoming = parseDescription(value);
    const current = editor.getJSON();
    if (JSON.stringify(incoming) !== JSON.stringify(current)) {
      editor.commands.setContent(incoming, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Place the caret at the end of the document on mount when requested.
  // Enables the "click anywhere in the description box to start editing"
  // affordance — once the editor mounts, focus + caret are ready.
  useEffect(() => {
    if (!editor || !autoFocus) return;
    editor.commands.focus('end');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, autoFocus]);

  // Expose an imperative trigger so a parent hint/button can insert `@` or `#`
  // and open the matching suggestion menu. The suggestion plugin only fires
  // when the char sits at line start or after whitespace, so prefix a space
  // when the caret is mid-word.
  useImperativeHandle(
    ref,
    () => ({
      insertTrigger: (ch: string) => {
        if (!editor) return;
        const { from } = editor.state.selection;
        const before = from > 0 ? editor.state.doc.textBetween(from - 1, from, '\n', '\n') : '';
        const needsSpace = before.length > 0 && !/\s/.test(before);
        editor
          .chain()
          .focus()
          .insertContent(needsSpace ? ` ${ch}` : ch)
          .run();
      },
      focus: () => editor?.commands.focus('end'),
    }),
    [editor],
  );

  if (!editor) return null;

  const btn = (active: boolean) =>
    cn(
      'h-7 w-7 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground',
      active && 'bg-accent text-foreground',
    );

  // Wrapper-level drop fallback. ProseMirror's editorProps.handleDrop only
  // fires when the drop lands inside its DOM view; drops on the toolbar or
  // the padding around the editor get ignored and the browser falls back to
  // its native behavior (navigating to the dropped file's URL = page reload
  // = lost draft). This catches those misses and uploads the image.
  const onWrapperDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
  };
  const onWrapperDrop = (e: React.DragEvent<HTMLDivElement>) => {
    // If ProseMirror already handled the drop (inside the editor view), its
    // handler will have preventDefault'd the native event — bail out so we
    // don't double-upload.
    if (e.defaultPrevented) return;
    const media = (e.dataTransfer.files ? Array.from(e.dataTransfer.files) : []).filter((f) =>
      isMediaType(f.type),
    );
    if (media.length > 0) {
      e.preventDefault();
      void uploadAndInsertFiles(media);
    }
  };

  return (
    <div
      className="rounded-md border bg-background"
      onDragOver={onWrapperDragOver}
      onDrop={onWrapperDrop}
    >
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="flex flex-wrap items-center gap-1 border-b px-2 py-1"
      >
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Bold"
          aria-pressed={editor.isActive('bold')}
          className={btn(editor.isActive('bold'))}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Italic"
          aria-pressed={editor.isActive('italic')}
          className={btn(editor.isActive('italic'))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Heading 1"
          aria-pressed={editor.isActive('heading', { level: 1 })}
          className={btn(editor.isActive('heading', { level: 1 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Heading 2"
          aria-pressed={editor.isActive('heading', { level: 2 })}
          className={btn(editor.isActive('heading', { level: 2 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Bullet list"
          aria-pressed={editor.isActive('bulletList')}
          className={btn(editor.isActive('bulletList'))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Ordered list"
          aria-pressed={editor.isActive('orderedList')}
          className={btn(editor.isActive('orderedList'))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Blockquote"
          aria-pressed={editor.isActive('blockquote')}
          className={btn(editor.isActive('blockquote'))}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Inline code"
          aria-pressed={editor.isActive('code')}
          className={btn(editor.isActive('code'))}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Insert link"
          className={btn(editor.isActive('link'))}
          onClick={() => {
            const prev = editor.getAttributes('link').href as string | undefined;
            const url = window.prompt('URL', prev ?? 'https://');
            if (url === null) return;
            if (url === '') {
              editor.chain().focus().extendMarkRange('link').unsetLink().run();
              return;
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
          }}
        >
          <Link2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Upload image or video"
          title="Upload image or video"
          className={btn(false)}
          onClick={pickMedia}
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
      {/*
       * Wrapper acts as the full click target. ProseMirror's EditorContent only
       * occupies the space its text takes — without this onMouseDown, the empty
       * padding below short content swallows the click and the caret never
       * focuses. mousedown + preventDefault avoids the browser blurring the
       * editor before our focus() command lands.
       */}
      <div
        className="cursor-text px-3 py-2"
        style={{ minHeight }}
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          editor.commands.focus('end');
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});
