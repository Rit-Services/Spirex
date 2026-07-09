// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  bulkUpdateWorkflowThunk,
  createWorkflowColumnThunk,
  fetchWorkflowThunk,
  removeWorkflowColumnThunk,
  resetWorkflowThunk,
} from '@/store/workflowSlice';
import { fetchProjectsThunk } from '@/store/projectSlice';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { RotateCcw, Plus, Trash2, Check, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import type { StatusCategory, StoryStatus, WorkflowStatus } from '@/types/scrum';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const CATEGORY_OPTIONS: StatusCategory[] = ['todo', 'in_progress', 'done'];
const PRESET_COLORS = [
  '#94A3B8', '#64748B', '#475569', '#334155',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7',
  '#10B981', '#22C55E', '#84CC16',
  '#F59E0B', '#F97316', '#EF4444', '#EC4899',
];

/**
 * Drag-sortable wrapper for a single workflow row. Drag is via the grip handle
 * only (so the row's inputs/selects stay clickable). Keeps the color wash, accent
 * stripe and data attr the row already had; the editable fields are passed as
 * children so they keep WorkflowSettings' scope (patchRow, removeColumn, etc.).
 */
function SortableRow({
  id,
  color,
  coreStatus,
  disabled,
  children,
}: {
  id: string;
  color: string;
  coreStatus: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      data-workflow-row-core={coreStatus}
      className="relative flex flex-wrap items-start gap-x-4 gap-y-3 overflow-hidden rounded-md border py-3 pl-5 pr-3 transition-colors"
      style={{
        background: `${color}14`,
        borderColor: `${color}59`,
        transform: CSS.Transform.toString(transform),
        transition,
        ...(isDragging ? { zIndex: 10, boxShadow: '0 12px 30px -12px rgba(15,23,42,0.35)' } : {}),
      }}
    >
      {/* Left accent stripe — the same color cue the sprint board uses. */}
      <span aria-hidden className="absolute left-0 top-0 h-full w-1.5" style={{ backgroundColor: color }} />
      {!disabled ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder column"
          className="cursor-grab touch-none self-center rounded p-1 text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : null}
      {children}
    </div>
  );
}

/** Pick black or white text for a checkmark/label sitting ON a colored chip,
 *  so the cue stays visible on both light (lime/amber) and dark (slate) presets. */
function readableTextOn(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0f172a' : '#ffffff';
}

/** Swatch grid with a clear checkmark on the active color (the old faint CSS
 *  `outline` was nearly invisible). Shared by every row + the add form. */
function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  return (
    // Fixed grid (not flex-wrap) so the swatches lay out IDENTICALLY in every
    // row regardless of leftover width — that variability was making rows 2–4
    // lines tall. 15 presets → a tidy 8-wide grid (2 rows).
    <div className="grid w-fit grid-cols-8 gap-1.5">
      {PRESET_COLORS.map((c) => {
        const selected = value.toLowerCase() === c.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            onClick={() => !disabled && onChange(c)}
            aria-label={`Set color ${c}`}
            aria-pressed={selected}
            disabled={disabled}
            className={cn(
              'relative flex h-7 w-7 items-center justify-center rounded-md border border-black/10 shadow-sm transition-transform',
              !disabled && 'hover:scale-110',
              selected && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
              disabled && 'cursor-not-allowed opacity-50',
            )}
            style={{ backgroundColor: c }}
          >
            {selected ? (
              <Check className="h-4 w-4" strokeWidth={3} style={{ color: readableTextOn(c) }} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Compact label+color chip mirroring the board column header. Solid background
 *  (not a color tint) so it stays crisp against the row's same-color wash. */
function ColumnChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex max-w-[160px] items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest shadow-sm"
      style={{ color, borderColor: `${color}59` }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      <span className="truncate">{label || '—'}</span>
    </span>
  );
}

/** A mini board column — the exact stripe + header treatment BoardColumn uses,
 *  so the add form shows a true preview of the column being created. */
function ColumnPreview({ label, color }: { label: string; color: string }) {
  return (
    <div className="w-44 shrink-0 overflow-hidden rounded-lg border border-border/80 bg-muted/60">
      <span aria-hidden className="block h-[3px] w-full" style={{ backgroundColor: color }} />
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: `2px solid ${color}33`, background: `${color}1f` }}
      >
        <span
          className="flex items-center gap-1.5 truncate text-[11px] font-bold uppercase tracking-widest"
          style={{ color }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          <span className="truncate">{label.trim() || 'New column'}</span>
        </span>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
          0
        </span>
      </div>
      <div className="px-3 py-4">
        <div className="rounded-md border border-dashed border-border/60 py-3 text-center text-[11px] text-muted-foreground">
          Drop here
        </div>
      </div>
    </div>
  );
}

interface DraftRow extends WorkflowStatus {
  dirty?: boolean;
}

export function WorkflowSettings() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const workflow = useAppSelector((s) => (id ? s.workflow.byProject[id] ?? [] : []));
  const saving = useAppSelector((s) => s.workflow.saving);
  const projects = useAppSelector((s) => s.projects.list);
  const { canInProject } = useCurrentProject();
  const canEdit = canInProject('workflow:edit');

  // Resolve the project from the URL id (not Redux currentId, which may lag on a
  // deep-linked settings page). WIP limits are a KANBAN (continuous-flow) concept
  // — they have no meaning in scrum sprints — so the column only shows for kanban
  // projects. Defaults to hidden until the type is known, which is the scrum case.
  const project = projects.find((p) => p.id === id) ?? null;
  const isKanban = project?.type === 'kanban';

  const [draft, setDraft] = useState<DraftRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#3B82F6');
  const [newCategory, setNewCategory] = useState<StatusCategory>('in_progress');
  const [newCoreStatus, setNewCoreStatus] = useState<StoryStatus>('in_progress');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (id) void dispatch(fetchWorkflowThunk(id));
  }, [dispatch, id]);

  // Ensure the projects list is present so we can read this project's type
  // (deep-link / hard-refresh onto the workflow settings page).
  useEffect(() => {
    if (projects.length === 0) void dispatch(fetchProjectsThunk());
  }, [dispatch, projects.length]);

  useEffect(() => {
    setDraft(workflow.map((w) => ({ ...w })));
  }, [workflow]);

  const dirty = useMemo(() => draft.some((d) => d.dirty), [draft]);

  if (!id) return <Navigate to="/projects" replace />;

  const patchRow = (rowId: string, patch: Partial<DraftRow>) => {
    setDraft((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch, dirty: true } : r)));
  };

  // Drag-to-reorder (replaces the old up/down arrows). Keyboard-accessible via
  // the grip handle (KeyboardSensor).
  const rowSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleRowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      const oldIndex = prev.findIndex((r) => r.id === active.id);
      const newIndex = prev.findIndex((r) => r.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      // Re-number order to match the new visible position and mark moved rows dirty.
      return arrayMove(prev, oldIndex, newIndex).map((r, i) => ({
        ...r,
        order: i,
        dirty: r.order !== i || r.dirty,
      }));
    });
  };

  const save = async () => {
    const items = draft
      .filter((r) => r.dirty)
      .map((r) => ({
        id: r.id,
        label: r.label,
        color: r.color,
        order: r.order,
        category: r.category,
        wipLimit: r.wipLimit,
      }));
    if (items.length === 0) return;
    const r = await dispatch(bulkUpdateWorkflowThunk({ projectId: id, items }));
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success('Workflow saved');
    } else {
      toast.error((r.payload as string) ?? 'Save failed');
    }
  };

  const resetDefaults = async () => {
    const r = await dispatch(resetWorkflowThunk(id));
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success('Workflow reset to defaults');
    } else {
      toast.error((r.payload as string) ?? 'Reset failed');
    }
  };

  const addColumn = async () => {
    if (!newLabel.trim()) return;
    setCreating(true);
    try {
      const r = await dispatch(
        createWorkflowColumnThunk({
          projectId: id,
          input: {
            label: newLabel.trim(),
            color: newColor,
            category: newCategory,
            coreStatus: newCoreStatus,
          },
        }),
      );
      if (r.meta.requestStatus === 'fulfilled') {
        toast.success('Column added');
        setNewLabel('');
        setAdding(false);
      } else {
        toast.error((r.payload as string) ?? 'Could not add column');
      }
    } finally {
      setCreating(false);
    }
  };

  const removeColumn = async (rowId: string) => {
    const r = await dispatch(removeWorkflowColumnThunk({ projectId: id, id: rowId }));
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success('Column removed');
    } else {
      toast.error((r.payload as string) ?? 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to={`/projects/${id}/settings`}
            className="text-xs text-muted-foreground hover:underline"
          >
            ← Project settings
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Workflow</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rename, recolor,{isKanban ? ' reorder, or set a WIP limit on' : ' or reorder'} the columns
            that show on the board and backlog. Each row is pinned to an underlying system status
            (backlog / to-do / etc.) — you can customize presentation, but the story's canonical
            state doesn't change.{isKanban ? ' WIP limits surface on the Kanban board (continuous flow).' : ''}
          </p>
        </div>
        {canEdit ? (
          <Button variant="outline" size="sm" onClick={resetDefaults}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset to defaults
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Columns</CardTitle>
          <CardDescription>
            {canEdit
              ? 'Edit any field inline. Save writes all changed rows at once.'
              : 'Read-only — you need project lead or admin permission to edit.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Loading…</p>
          ) : (
            <DndContext
              sensors={rowSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleRowDragEnd}
            >
              <SortableContext
                items={draft.map((d) => d.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {draft.map((row, i) => (
                    <SortableRow
                      key={row.id}
                      id={row.id}
                      color={row.color}
                      coreStatus={row.coreStatus}
                      disabled={!canEdit}
                    >
                {/* Live column position — updates as rows are dragged. */}
                <div className="flex flex-col items-center gap-0.5 self-center">
                  <span className="font-mono text-[0.6rem] uppercase tracking-wide text-muted-foreground/70">
                    col
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {i + 1}
                  </span>
                </div>

                <div className="flex-1 space-y-1.5 min-w-[200px]">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={`label-${row.id}`} className="text-xs">
                      Label
                    </Label>
                    {/* Board-style label chip — the cue you liked, kept crisp on the wash. */}
                    <ColumnChip label={row.label} color={row.color} />
                  </div>
                  <Input
                    id={`label-${row.id}`}
                    value={row.label}
                    onChange={(e) => patchRow(row.id, { label: e.target.value })}
                    disabled={!canEdit}
                    aria-label={`Label for ${row.coreStatus}`}
                    maxLength={40}
                  />
                </div>

                <div className="w-[120px] shrink-0 space-y-1">
                  <Label className="text-xs">Core status</Label>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {row.coreStatus}
                  </Badge>
                </div>

                <div className="w-[150px] shrink-0 space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Select
                    value={row.category}
                    onValueChange={(v) => patchRow(row.id, { category: v as StatusCategory })}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* WIP limit — KANBAN ONLY. WIP limits are a continuous-flow
                    concept; scrum paces work by the sprint, so the field is
                    hidden for scrum projects. Blank = no limit; the board only
                    enforces what's set. */}
                {isKanban ? (
                  <div className="w-[88px] shrink-0 space-y-1">
                    <Label htmlFor={`wip-${row.id}`} className="text-xs">WIP limit</Label>
                    <Input
                      id={`wip-${row.id}`}
                      type="number"
                      min={1}
                      max={99}
                      inputMode="numeric"
                      placeholder="None"
                      className="w-20"
                      value={row.wipLimit ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        patchRow(row.id, {
                          wipLimit: v === '' ? null : Math.max(1, Math.min(99, Number(v) || 1)),
                        });
                      }}
                      disabled={!canEdit}
                      aria-label={`WIP limit for ${row.coreStatus}`}
                    />
                  </div>
                ) : null}

                <div className="shrink-0 space-y-1">
                  <Label className="text-xs">Color</Label>
                  <ColorPicker
                    value={row.color}
                    onChange={(c) => patchRow(row.id, { color: c })}
                    disabled={!canEdit}
                  />
                </div>

                {/* Reserved trailing slot — always present (even when there's no
                    delete action) so default and custom rows align and wrap the
                    same way, keeping every row the same height. */}
                <div className="ml-auto flex w-9 shrink-0 justify-center self-center">
                  {!row.isDefault && canEdit ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeColumn(row.id)}
                      aria-label={`Delete ${row.label} column`}
                      title="Delete custom column"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                    </SortableRow>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a column</CardTitle>
            <CardDescription>
              Custom columns let you subdivide work in progress (for example, "Review" and
              "Awaiting deploy"). Pick the underlying system status the new column maps to —
              that keeps activity-log history and reports coherent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!adding ? (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add column
              </Button>
            ) : (
              <div className="flex flex-col gap-4 rounded-md border bg-muted/40 p-4 sm:flex-row">
                {/* Form fields */}
                <div className="flex-1 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="new-col-label" className="text-xs">Label</Label>
                      <Input
                        id="new-col-label"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        placeholder="e.g. Awaiting deploy"
                        aria-label="New column label"
                        maxLength={40}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Maps to system status</Label>
                      <Select value={newCoreStatus} onValueChange={(v) => setNewCoreStatus(v as StoryStatus)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">todo</SelectItem>
                          <SelectItem value="in_progress">in_progress</SelectItem>
                          <SelectItem value="in_review">in_review</SelectItem>
                          <SelectItem value="qa">qa</SelectItem>
                          <SelectItem value="done">done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Category</Label>
                      <Select value={newCategory} onValueChange={(v) => setNewCategory(v as StatusCategory)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">to do</SelectItem>
                          <SelectItem value="in_progress">in progress</SelectItem>
                          <SelectItem value="done">done</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Color</Label>
                      <ColorPicker value={newColor} onChange={setNewColor} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAdding(false);
                        setNewLabel('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={addColumn} disabled={creating || !newLabel.trim()}>
                      {creating ? 'Adding…' : 'Add column'}
                    </Button>
                  </div>
                </div>

                {/* Live preview — the real board column, updating as you edit. */}
                <div className="space-y-1.5 sm:border-l sm:border-border/60 sm:pl-4">
                  <Label className="text-xs text-muted-foreground">Preview</Label>
                  <ColumnPreview label={newLabel} color={newColor} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {canEdit ? (
        // Sticky action bar — stays pinned to the bottom of the viewport while
        // the column list scrolls, so Save/Discard are always in reach and a
        // dirty draft can't slip past unnoticed. The amber "Unsaved changes" cue
        // (only when dirty) makes leaving without saving a deliberate choice.
        <div
          className={cn(
            'sticky bottom-0 z-20 -mx-1 flex items-center justify-between gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur transition-colors',
            dirty
              ? 'border-amber-500/50 bg-amber-50/90 dark:bg-amber-950/40'
              : 'border-border bg-card/90',
          )}
        >
          <span
            className={cn(
              'flex items-center gap-2 text-sm',
              dirty ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
            )}
          >
            {dirty ? (
              <>
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
                You have unsaved changes
              </>
            ) : (
              <>
                <Check className="h-4 w-4 shrink-0" aria-hidden />
                All changes saved
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setDraft(workflow.map((w) => ({ ...w })))}
              disabled={!dirty || saving}
            >
              Discard
            </Button>
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
