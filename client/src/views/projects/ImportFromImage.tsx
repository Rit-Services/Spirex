// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Upload, Image as ImageIcon, AlertCircle, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  createImageDraftThunk,
  commitImageImportThunk,
  discardImageImportThunk,
  saveAnnotationsThunk,
  saveDraftThunk,
  generateAiDraftThunk,
  clearImageDraft,
  setLocalAnnotations,
  setLocalDraft,
} from '@/store/imageImportSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImageAnnotator } from '@/components/image-import/ImageAnnotator';
import type { Annotation, ImageImportDraft } from '@/types/imageImport';
import type { StoryType, Priority } from '@/types/import';
import { API_BASE } from '@/config/urls';

const TYPE_LABELS: Record<StoryType, string> = { story: 'Story', bug: 'Bug', task: 'Task' };
const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
};

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function ImportFromImage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { draft, loading, committing, generating, error } = useAppSelector(
    (s) => s.imageImports,
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pendingDraftIdRef = useRef<string | null>(null);
  useEffect(() => {
    pendingDraftIdRef.current = draft?.id ?? null;
  }, [draft?.id]);

  useEffect(() => {
    return () => {
      const pendingId = pendingDraftIdRef.current;
      if (pendingId) {
        void dispatch(discardImageImportThunk(pendingId));
      }
    };
  }, [dispatch]);

  // Debounced server-side save for annotations + draft fields
  const persistAnnotations = useRef(
    debounce((id: string, annotations: Annotation[]) => {
      void dispatch(saveAnnotationsThunk({ id, annotations }));
    }, 600),
  ).current;

  const persistDraft = useRef(
    debounce((id: string, patch: Partial<ImageImportDraft>) => {
      void dispatch(saveDraftThunk({ id, draft: patch }));
    }, 600),
  ).current;

  const handleFile = async (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Unsupported image type. Use PNG, JPEG, GIF, or WebP.');
      return;
    }
    const result = await dispatch(createImageDraftThunk({ projectId: projectId!, file }));
    if (createImageDraftThunk.fulfilled.match(result)) {
      toast.success(`Uploaded "${result.payload.filename}". Add annotations below.`);
    } else {
      toast.error('Upload failed — check the file and try again');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const handleAnnotationsChange = (annotations: Annotation[]) => {
    if (!draft) return;
    dispatch(setLocalAnnotations(annotations));
    persistAnnotations(draft.id, annotations);
  };

  const handleDraftFieldChange = (patch: Partial<ImageImportDraft>) => {
    if (!draft) return;
    dispatch(setLocalDraft(patch));
    persistDraft(draft.id, patch);
  };

  const handleGenerate = async () => {
    if (!draft) return;
    if (!draft.annotations.length) {
      toast.error('Add at least one annotation before generating');
      return;
    }
    const result = await dispatch(generateAiDraftThunk(draft.id));
    if (generateAiDraftThunk.fulfilled.match(result)) {
      toast.success('AI draft generated — review and edit before saving');
    } else {
      toast.error(result.payload ?? 'AI generation failed');
    }
  };

  const handleCommit = async () => {
    if (!draft) return;
    const title = draft.draft.title.trim();
    if (!title) {
      toast.error('Title is required');
      return;
    }
    const result = await dispatch(
      commitImageImportThunk({
        id: draft.id,
        edit: {
          title,
          description: draft.draft.description,
          acceptanceCriteria: draft.draft.acceptanceCriteria,
          type: draft.draft.type,
          priority: draft.draft.priority,
        },
      }),
    );
    if (commitImageImportThunk.fulfilled.match(result)) {
      pendingDraftIdRef.current = null;
      toast.success(`Story ${result.payload.story.key} created`);
      navigate(`/projects/${projectId}/backlog`);
    } else {
      toast.error('Commit failed — please try again');
    }
  };

  const handleCancel = async () => {
    if (draft) {
      await dispatch(discardImageImportThunk(draft.id));
    }
    pendingDraftIdRef.current = null;
    dispatch(clearImageDraft());
    navigate(`/projects/${projectId}/backlog`);
  };

  // Step 1 — Upload
  if (!draft) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Create Story from Image</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a screenshot, draw annotations on the parts that matter, and the result
            becomes a single story you can review and commit to the project.
          </p>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label="Upload area"
          className={`flex min-h-56 cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed transition-colors ${
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/30 hover:border-primary/50'
          }`}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">Uploading…</p>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Drop a screenshot here or click to browse</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Supports PNG, JPEG, GIF, WebP — max 10 MB
                </p>
              </div>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
            aria-label="Image upload input"
          />
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  // Step 2 — Annotate + review
  return (
    <div className="grid gap-6 px-4 py-8 xl:px-8 2xl:px-12 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_480px] 2xl:grid-cols-[minmax(0,1fr)_560px]">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Annotate Image</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              From <strong>{draft.filename}</strong>. Draw on the image — annotations save
              automatically.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <Save className="h-3.5 w-3.5" />
            Auto-saving
          </div>
        </div>

        <ImageAnnotator
          imageUrl={`${API_BASE}${draft.attachmentUrl}`}
          annotations={draft.annotations}
          onChange={handleAnnotationsChange}
        />
      </div>

      <aside className="space-y-4">
        <div className="rounded-md border bg-card">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
            <span className="text-sm font-medium">Story details</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleGenerate()}
              disabled={generating || !draft.annotations.length}
              title={
                draft.annotations.length
                  ? 'Generate title, description, and acceptance criteria from your annotations using Claude'
                  : 'Add at least one annotation first'
              }
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {generating ? 'Generating…' : 'Generate with AI'}
            </Button>
          </div>
          <div className="space-y-3 px-4 py-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title *</label>
              <Input
                value={draft.draft.title}
                onChange={(e) => handleDraftFieldChange({ title: e.target.value })}
                placeholder="Short summary"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Type</label>
                <Select
                  value={draft.draft.type}
                  onValueChange={(v) => handleDraftFieldChange({ type: v as StoryType })}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as StoryType[]).map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Priority</label>
                <Select
                  value={draft.draft.priority}
                  onValueChange={(v) => handleDraftFieldChange({ priority: v as Priority })}
                >
                  <SelectTrigger className="mt-1 h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                      <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={draft.draft.description}
                onChange={(e) => handleDraftFieldChange({ description: e.target.value })}
                placeholder="Optional context. The annotation list will be appended automatically on commit."
                rows={7}
                className="mt-1 min-h-[180px] w-full resize-y rounded border bg-background px-2 py-1.5 text-sm leading-relaxed"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Acceptance criteria
              </label>
              <textarea
                value={draft.draft.acceptanceCriteria}
                onChange={(e) =>
                  handleDraftFieldChange({ acceptanceCriteria: e.target.value })
                }
                placeholder="- [ ] Item one&#10;- [ ] Item two"
                rows={6}
                className="mt-1 min-h-[160px] w-full resize-y rounded border bg-background px-2 py-1.5 font-mono text-sm leading-relaxed"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => void handleCancel()}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleCommit()}
            disabled={committing || !draft.draft.title.trim()}
          >
            {committing ? 'Committing…' : 'Create Story'}
          </Button>
        </div>

        <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <ImageIcon className="mr-1 inline h-3 w-3" />
          The original screenshot will be attached to the story, and the annotation overlay
          will render on the story detail panel.
        </p>
      </aside>
    </div>
  );
}
