// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Upload, FileText, CheckCircle2, X, AlertCircle, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/store';
import { createDraftThunk, commitImportThunk, clearDraft } from '@/store/importSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DraftStory, CommitEdit, StoryType, Priority } from '@/types/import';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TYPE_LABELS: Record<StoryType, string> = { story: 'Story', bug: 'Bug', task: 'Task' };
const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
};

const ALLOWED_TYPES = [
  'text/markdown',
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

interface EditedDraft extends DraftStory {
  skip: boolean;
  editedTitle: string;
  editedDescription: string;
  editedAcceptanceCriteria: string;
  editedType: StoryType;
  editedPriority: Priority;
}

function initEdited(drafts: DraftStory[]): EditedDraft[] {
  return drafts.map((d) => ({
    ...d,
    skip: false,
    editedTitle: d.title,
    editedDescription: d.description,
    editedAcceptanceCriteria: d.acceptanceCriteria ?? '',
    editedType: d.type,
    editedPriority: d.priority,
  }));
}


export function ImportFromDoc() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { draft, loading, error } = useAppSelector((s) => s.imports);

  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<EditedDraft[]>([]);
  const [dragging, setDragging] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const editingRow = rows.find((r) => r.localId === editingRowId) ?? null;

  const handleFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type) && !file.name.endsWith('.md')) {
      toast.error('Unsupported file type. Use .md, .txt, .pdf, or .docx');
      return;
    }
    const result = await dispatch(createDraftThunk({ projectId: projectId!, file }));
    if (createDraftThunk.fulfilled.match(result)) {
      setRows(initEdited(result.payload.drafts));
      toast.success(
        `Found ${result.payload.drafts.length} section${result.payload.drafts.length !== 1 ? 's' : ''} in "${result.payload.originalFilename}"`,
      );
    } else {
      toast.error('Upload failed — check the file format and try again');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const updateRow = (localId: string, patch: Partial<EditedDraft>) => {
    setRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  };

  const handleCommit = async () => {
    if (!draft) return;
    const edits: CommitEdit[] = rows.map((r) => ({
      localId: r.localId,
      title: r.editedTitle,
      description: r.editedDescription,
      acceptanceCriteria: r.editedAcceptanceCriteria,
      type: r.editedType,
      priority: r.editedPriority,
      skip: r.skip,
    }));
    const active = rows.filter((r) => !r.skip);
    if (!active.length) {
      toast.error('Select at least one story to commit');
      return;
    }
    const result = await dispatch(commitImportThunk({ id: draft.id, edits }));
    if (commitImportThunk.fulfilled.match(result)) {
      toast.success(
        `${result.payload.committed} stor${result.payload.committed !== 1 ? 'ies' : 'y'} created successfully`,
      );
      navigate(`/projects/${projectId}/backlog`);
    } else {
      toast.error('Commit failed — please try again');
    }
  };

  const handleCancel = () => {
    dispatch(clearDraft());
    setRows([]);
    navigate(`/projects/${projectId}/backlog`);
  };

  const activeCount = rows.filter((r) => !r.skip).length;

  // Step 1 — Upload
  if (!draft) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Import from Document</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a Markdown, plain text, PDF, or Word document. Each section becomes a story
            draft you can edit before committing.
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
            <p className="text-sm text-muted-foreground">Extracting content…</p>
          ) : (
            <>
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Drop a file here or click to browse</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Supports .md, .txt, .pdf, .docx — max 10 MB
                </p>
              </div>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            accept=".md,.txt,.pdf,.docx,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
            aria-label="File upload input"
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

  // Step 2 — Preview & edit
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 xl:max-w-6xl 2xl:max-w-[1400px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Review Draft Stories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            From <strong>{draft.originalFilename}</strong> — edit titles, types, and priorities
            before committing.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleCommit()}
            disabled={loading || activeCount === 0}
            aria-label={`Commit ${activeCount} stories`}
          >
            {loading
              ? 'Committing…'
              : `Commit ${activeCount} stor${activeCount !== 1 ? 'ies' : 'y'}`}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <Card
            key={row.localId}
            className={`transition-opacity ${row.skip ? 'opacity-40' : ''}`}
            aria-label={`Draft story ${row.localId}`}
          >
            <CardHeader className="py-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={!row.skip}
                  onChange={(e) => updateRow(row.localId, { skip: !e.target.checked })}
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                  aria-label={`Include story ${row.localId}`}
                />
                <CardTitle className="flex-1 text-base font-normal">
                  <Input
                    value={row.editedTitle}
                    onChange={(e) => updateRow(row.localId, { editedTitle: e.target.value })}
                    disabled={row.skip}
                    className="h-8 font-medium"
                    aria-label={`Title for story ${row.localId}`}
                  />
                </CardTitle>
                <div className="flex shrink-0 items-center gap-2">
                  <Select
                    value={row.editedType}
                    onValueChange={(v) => updateRow(row.localId, { editedType: v as StoryType })}
                    disabled={row.skip}
                  >
                    <SelectTrigger className="h-7 w-auto min-w-[80px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_LABELS) as StoryType[]).map((t) => (
                        <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={row.editedPriority}
                    onValueChange={(v) => updateRow(row.localId, { editedPriority: v as Priority })}
                    disabled={row.skip}
                  >
                    <SelectTrigger className="h-7 w-auto min-w-[90px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                        <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => setEditingRowId(row.localId)}
                    disabled={row.skip}
                    className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    aria-label={`Edit details for story ${row.localId}`}
                    title="Edit full details"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateRow(row.localId, { skip: !row.skip })}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={
                      row.skip ? `Include story ${row.localId}` : `Skip story ${row.localId}`
                    }
                  >
                    {row.skip ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </CardHeader>
            {!row.skip ? (
              <CardContent className="pb-3 pt-0">
                <button
                  type="button"
                  onClick={() => setEditingRowId(row.localId)}
                  className="block w-full rounded text-left hover:bg-muted/50"
                  aria-label={`Open full details for story ${row.localId}`}
                >
                  {row.editedDescription ? (
                    <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                      {row.editedDescription}
                    </p>
                  ) : (
                    <p className="text-sm italic text-muted-foreground">
                      Click to add a description…
                    </p>
                  )}
                  {row.editedAcceptanceCriteria.trim() ? (
                    <p className="mt-2 text-[11px] font-medium text-emerald-600">
                      ✓ Acceptance criteria detected ·{' '}
                      {
                        row.editedAcceptanceCriteria
                          .split('\n')
                          .filter((l) => /-\s*\[[ xX]\]/.test(l)).length
                      }{' '}
                      checklist item(s)
                    </p>
                  ) : null}
                </button>
              </CardContent>
            ) : null}
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border px-4 py-3 text-sm text-muted-foreground">
          <FileText className="h-4 w-4 shrink-0" />
          No sections detected in the document.
        </div>
      ) : null}

      <Dialog
        open={!!editingRow}
        onOpenChange={(open) => !open && setEditingRowId(null)}
      >
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 sm:max-w-[min(1100px,92vw)]">
          <DialogHeader>
            <DialogTitle>Edit draft story</DialogTitle>
            <DialogDescription>
              These changes only affect the draft. Stories are created when you commit the import.
            </DialogDescription>
          </DialogHeader>
          {editingRow ? (
            <div className="-mx-6 flex-1 space-y-4 overflow-y-auto px-6 py-2">
              <div className="space-y-2">
                <Label htmlFor="draft-title">Title</Label>
                <Input
                  id="draft-title"
                  value={editingRow.editedTitle}
                  onChange={(e) =>
                    updateRow(editingRow.localId, { editedTitle: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={editingRow.editedType}
                    onValueChange={(v) =>
                      updateRow(editingRow.localId, { editedType: v as StoryType })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TYPE_LABELS) as StoryType[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={editingRow.editedPriority}
                    onValueChange={(v) =>
                      updateRow(editingRow.localId, { editedPriority: v as Priority })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                        <SelectItem key={p} value={p}>
                          {PRIORITY_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="draft-description">Description</Label>
                <textarea
                  id="draft-description"
                  value={editingRow.editedDescription}
                  onChange={(e) =>
                    updateRow(editingRow.localId, { editedDescription: e.target.value })
                  }
                  className="flex min-h-[280px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed"
                  placeholder="Describe the story in full…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="draft-ac">Acceptance criteria</Label>
                <textarea
                  id="draft-ac"
                  value={editingRow.editedAcceptanceCriteria}
                  onChange={(e) =>
                    updateRow(editingRow.localId, {
                      editedAcceptanceCriteria: e.target.value,
                    })
                  }
                  className="flex min-h-[220px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-sm leading-relaxed"
                  placeholder="- [ ] Given … when … then …"
                />
                <p className="text-[11px] text-muted-foreground">
                  Use <code className="rounded bg-muted px-1">- [ ] item</code> lines for
                  interactive checkboxes on the story page.
                </p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setEditingRowId(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
