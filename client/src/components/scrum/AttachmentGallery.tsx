// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip, Upload, Trash2, FileText, Mic, Video } from 'lucide-react';
import { attachmentApi } from '@/apis/attachmentApi';
import { extractError } from '@/config/httpClient';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import type { Attachment } from '@/types/attachment';

interface Props {
  storyId: string;
  projectId: string;
  canUpload: boolean;
  /** Reports the live attachment count after every server read (initial load,
   *  upload, delete) so a parent can show an up-to-date count without refetching
   *  the story. Fired only with real server data — never the empty initial state. */
  onCountChange?: (count: number) => void;
}

// Keep these in sync with server/middlewares/uploadHandler.ts.
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
const MAX_DEFAULT_BYTES = 25 * 1024 * 1024;
const VIDEO_EXT_RE = /\.(mov|mp4|webm|mkv)$/i;

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_EXT_RE.test(file.name);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentGallery({ storyId, projectId, canUpload, onCountChange }: Props) {
  const { user, activeOrg } = useAuth();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  // Upload completion 0–100, or null while the server finishes processing the
  // already-sent bytes. Drives the percentage shown on the Upload button.
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  // While uploading more than one file, tracks which file (i of n) is in flight.
  const [batch, setBatch] = useState<{ i: number; n: number } | null>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await attachmentApi.listByStory(storyId);
      setAttachments(rows);
      onCountChange?.(rows.length);
    } catch (err) {
      toast.error(extractError(err).message);
    }
  }, [storyId, onCountChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await attachmentApi.listByStory(storyId);
        if (!cancelled) {
          setAttachments(rows);
          onCountChange?.(rows.length);
        }
      } catch (err) {
        if (!cancelled) toast.error(extractError(err).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storyId, onCountChange]);

  // Upload a batch sequentially. The API is one-file-per-request (multer is
  // capped at files:1), so "multiple" = N requests in series — one shared
  // progress bar, oversized files skipped individually without aborting the
  // rest, and a single refresh + summary toast at the end.
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setUploading(true);
      let ok = 0;
      let failed = 0;
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const isVideo = isVideoFile(file);
          const cap = isVideo ? MAX_VIDEO_BYTES : MAX_DEFAULT_BYTES;
          if (file.size > cap) {
            const capMb = Math.round(cap / 1024 / 1024);
            const label = isVideo ? 'Video' : 'File';
            toast.error(
              `${file.name}: ${label.toLowerCase()} too large (${Math.round(
                file.size / 1024 / 1024,
              )} MB). Max is ${capMb} MB.`,
            );
            failed++;
            continue;
          }
          setBatch(files.length > 1 ? { i: i + 1, n: files.length } : null);
          setUploadPct(0);
          try {
            await attachmentApi.upload({ file, projectId, storyId, onProgress: setUploadPct });
            ok++;
          } catch (err) {
            toast.error(`${file.name}: ${extractError(err).message}`);
            failed++;
          }
        }
        if (ok > 0) {
          await refresh();
          // One summary for a batch; the precise filename for a single upload.
          toast.success(
            files.length === 1 ? `Uploaded ${files[0].name}` : `Uploaded ${ok} files`,
          );
        }
        if (failed > 0 && ok === 0 && files.length > 1) {
          toast.error(`Failed to upload ${failed} files`);
        }
      } finally {
        setUploading(false);
        setUploadPct(null);
        setBatch(null);
      }
    },
    [projectId, storyId, refresh],
  );

  const onInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) await uploadFiles(files);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragDepth(0);
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length) await uploadFiles(files);
  };

  // Ctrl/Cmd+V paste-to-upload for clipboard images (e.g. screenshots from
  // Snipping Tool, macOS Cmd+Shift+4 → clipboard). Only fires while focus is
  // inside the gallery container so we don't hijack pastes elsewhere on the
  // page (rich text editor, etc.).
  useEffect(() => {
    if (!canUpload) return;
    const node = containerRef.current;
    if (!node) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== 'file') continue;
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        // Clipboard images come in as `image.png` with no useful name —
        // stamp them with a timestamp so duplicates don't collide visually.
        const ext = file.type.split('/')[1] || 'png';
        const named = new File(
          [file],
          `pasted-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`,
          { type: file.type },
        );
        void uploadFiles([named]);
        return;
      }
    };
    node.addEventListener('paste', onPaste);
    return () => node.removeEventListener('paste', onPaste);
  }, [canUpload, uploadFiles]);

  // Delete is confirmed via a dialog (consistent with the issue/discard prompts)
  // — the trash button stages the attachment here, the dialog does the removal.
  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmRemove = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await attachmentApi.remove(pendingDelete.id);
      await refresh();
      setPendingDelete(null);
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setDeleting(false);
    }
  };

  const isDragging = dragDepth > 0;

  return (
    <section>
      <header className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4" />
          Attachments
          {attachments.length > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">
              · {attachments.length}
            </span>
          ) : null}
        </h3>
        {canUpload ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="mr-1 h-3.5 w-3.5" />
            {uploading
              ? `${batch ? `Uploading ${batch.i}/${batch.n}` : 'Uploading'}${
                  uploadPct === null ? '… finishing' : `… ${uploadPct}%`
                }`
              : 'Upload'}
          </Button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,.doc,.docx,.txt,.md,video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv,audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
          className="hidden"
          aria-label="Upload attachment"
          onChange={onInputChange}
        />
      </header>

      <div
        ref={containerRef}
        // tabIndex makes the container focusable so paste events fire while
        // the user is hovering/clicking the gallery region.
        tabIndex={canUpload ? 0 : -1}
        onDragEnter={(e) => {
          if (!canUpload) return;
          e.preventDefault();
          setDragDepth((d) => d + 1);
        }}
        onDragLeave={() => canUpload && setDragDepth((d) => Math.max(0, d - 1))}
        onDragOver={(e) => canUpload && e.preventDefault()}
        onDrop={canUpload ? onDrop : undefined}
        className={cn(
          'rounded-md border border-dashed p-3 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40',
          isDragging ? 'border-primary bg-primary/5' : 'border-border',
        )}
      >
        {attachments.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground">
            {canUpload
              ? 'Drop files, click Upload, or paste an image with Ctrl/Cmd+V. Images & docs up to 25 MB, videos up to 300 MB.'
              : 'No attachments.'}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {attachments.map((att) => {
              // Always use the absolute fileUrl() — server's att.url is
              // relative and breaks in dev where FE/BE origins differ.
              const url = attachmentApi.fileUrl(att.id);
              const canRemove =
                user?.id === att.uploadedById || activeOrg?.role === 'admin';

              // Audio attachments span both columns of the grid so the inline
              // player has room to breathe. The player goes on top, with the
              // filename + size + delete control beneath. Matches voice-import
              // story commits — see docs/phase12-voice-import.md.
              if (att.kind === 'audio') {
                return (
                  <li
                    key={att.id}
                    className="flex flex-col gap-2 rounded-md border bg-card p-2 sm:col-span-2"
                    data-attachment-id={att.id}
                  >
                    <audio
                      controls
                      preload="metadata"
                      src={url}
                      className="w-full"
                      aria-label={`Audio attachment: ${att.filename}`}
                    />
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                      >
                        {att.filename}
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(att.sizeBytes)} · {att.uploadedBy?.name ?? 'Unknown'}
                      </span>
                      {canRemove ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${att.filename}`}
                          onClick={() => setPendingDelete(att)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              }

              // Video attachments — same full-width card pattern as audio, but
              // with an inline <video> player. preload="metadata" so we get
              // dimensions/duration without pulling the whole file.
              if (att.kind === 'video') {
                return (
                  <li
                    key={att.id}
                    className="flex flex-col gap-2 rounded-md border bg-card p-2 sm:col-span-2"
                    data-attachment-id={att.id}
                  >
                    <video
                      controls
                      preload="metadata"
                      src={url}
                      className="w-full rounded-md bg-black"
                      aria-label={`Video attachment: ${att.filename}`}
                    />
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
                      >
                        {att.filename}
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(att.sizeBytes)} · {att.uploadedBy?.name ?? 'Unknown'}
                      </span>
                      {canRemove ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${att.filename}`}
                          onClick={() => setPendingDelete(att)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              }

              return (
                <li
                  key={att.id}
                  className="flex items-center gap-3 rounded-md border bg-card p-2 transition-colors hover:bg-muted/40"
                  data-attachment-id={att.id}
                >
                  {/* The whole left region (thumbnail + name + meta) opens the
                      file — not just the filename. The Remove button stays
                      OUTSIDE this anchor so it remains a distinct action. */}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex min-w-0 flex-1 items-center gap-3"
                  >
                    {att.kind === 'image' ? (
                      <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-md border">
                        <img
                          src={url}
                          alt={att.filename}
                          className="h-full w-full object-cover"
                        />
                      </span>
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                        <FileText className="h-5 w-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium group-hover:underline">
                        {att.filename}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatBytes(att.sizeBytes)} · {att.uploadedBy?.name ?? 'Unknown'}
                      </span>
                    </span>
                  </a>
                  {canRemove ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${att.filename}`}
                      onClick={() => setPendingDelete(att)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {canUpload && attachments.length > 0 ? (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Drop files, click Upload, or paste (Ctrl/Cmd+V). Images & docs ≤ 25 MB, videos ≤ 300 MB.
          </p>
        ) : null}
      </div>

      <Dialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete attachment?</DialogTitle>
            <DialogDescription>
              {pendingDelete ? (
                <>
                  <span className="font-medium">"{pendingDelete.filename}"</span> will be
                  permanently removed from this issue. This cannot be undone.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete attachment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
