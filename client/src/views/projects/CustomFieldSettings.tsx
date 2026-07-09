// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchProjectsThunk, setCurrentProject, fetchMembersThunk } from '@/store/projectSlice';
import { customFieldApi } from '@/apis/customFieldApi';
import { useCustomFields } from '@/hooks/useCustomFields';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { extractError } from '@/config/httpClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  CUSTOM_FIELD_TYPE_LABEL,
  type CustomFieldDefinition,
  type CustomFieldType,
} from '@/types/scrum';

const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'date', 'select', 'checkbox'];

function parseOptions(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function CustomFieldSettings() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const { list } = useAppSelector((s) => s.projects);
  const project = list.find((p) => p.id === id) ?? null;
  const { canInProject } = useCurrentProject();
  const { fields, refresh } = useCustomFields(id);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<CustomFieldType>('text');
  const [newOptions, setNewOptions] = useState('');
  const [newRequired, setNewRequired] = useState(false);
  const [creating, setCreating] = useState(false);
  // Row being edited inline (name/options/required).
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editOptions, setEditOptions] = useState('');

  useEffect(() => {
    if (list.length === 0) void dispatch(fetchProjectsThunk());
  }, [dispatch, list.length]);

  useEffect(() => {
    if (id) {
      dispatch(setCurrentProject(id));
      // Membership feeds canInProject — without it the guard below misfires.
      void dispatch(fetchMembersThunk(id));
    }
  }, [dispatch, id]);

  if (!project) return list.length === 0 ? null : <Navigate to="/projects" replace />;
  if (!canInProject('customfield:manage')) {
    return <Navigate to={`/projects/${project.id}/settings`} replace />;
  }

  const onCreate = async () => {
    if (!newName.trim()) return toast.error('Field name is required');
    const options = parseOptions(newOptions);
    if (newType === 'select' && options.length === 0) {
      return toast.error('A select field needs at least one option');
    }
    setCreating(true);
    try {
      await customFieldApi.create(project.id, {
        name: newName.trim(),
        type: newType,
        options: newType === 'select' ? options : undefined,
        isRequired: newRequired,
      });
      toast.success('Field created');
      setNewName('');
      setNewType('text');
      setNewOptions('');
      setNewRequired(false);
      await refresh();
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (f: CustomFieldDefinition) => {
    setEditId(f.id);
    setEditName(f.name);
    setEditOptions(f.options.join(', '));
  };

  const onSaveEdit = async (f: CustomFieldDefinition) => {
    const options = parseOptions(editOptions);
    if (f.type === 'select' && options.length === 0) {
      return toast.error('A select field needs at least one option');
    }
    try {
      await customFieldApi.update(f.id, {
        name: editName.trim() || undefined,
        options: f.type === 'select' ? options : undefined,
      });
      toast.success('Field updated');
      setEditId(null);
      await refresh();
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  const onToggleRequired = async (f: CustomFieldDefinition) => {
    try {
      await customFieldApi.update(f.id, { isRequired: !f.isRequired });
      await refresh();
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  const onDelete = async (f: CustomFieldDefinition) => {
    if (!window.confirm(`Delete "${f.name}"? Stored values on every issue will be removed.`)) {
      return;
    }
    try {
      await customFieldApi.remove(f.id);
      toast.success('Field deleted');
      await refresh();
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to={`/projects/${project.id}/settings`}>← Back to settings</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Custom fields</CardTitle>
          <CardDescription>
            Extra fields shown on every issue in {project.name}. Values appear on the issue
            panel and changes are recorded in the activity feed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 items-end gap-3 rounded-md border bg-muted/40 p-3 sm:grid-cols-[1fr_9rem_1fr_auto_auto]">
            <div className="space-y-1">
              <Label htmlFor="cf-name">Name</Label>
              <Input
                id="cf-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Severity"
                maxLength={60}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cf-type">Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as CustomFieldType)}>
                <SelectTrigger id="cf-type" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {CUSTOM_FIELD_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cf-options">Options (comma-separated)</Label>
              <Input
                id="cf-options"
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                placeholder="Low, Medium, High"
                disabled={newType !== 'select'}
                className="h-9"
              />
            </div>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Required
            </label>
            <Button onClick={onCreate} disabled={creating} className="h-9">
              {creating ? 'Adding…' : 'Add field'}
            </Button>
          </div>

          {fields.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">
              No custom fields yet. Add one above — it will show up on every issue in this
              project.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Options</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((f) => {
                  const editing = editId === f.id;
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">
                        {editing ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            maxLength={60}
                            className="h-8"
                            aria-label="Field name"
                          />
                        ) : (
                          f.name
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{CUSTOM_FIELD_TYPE_LABEL[f.type]}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        {f.type !== 'select' ? (
                          <span className="text-muted-foreground">—</span>
                        ) : editing ? (
                          <Input
                            value={editOptions}
                            onChange={(e) => setEditOptions(e.target.value)}
                            className="h-8"
                            aria-label="Options (comma-separated)"
                          />
                        ) : (
                          <span className="truncate text-muted-foreground">
                            {f.options.join(', ')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={f.isRequired}
                          onChange={() => onToggleRequired(f)}
                          aria-label={`${f.name} required`}
                          className="h-4 w-4 rounded border-input accent-primary"
                        />
                      </TableCell>
                      <TableCell className="space-x-2 text-right">
                        {editing ? (
                          <>
                            <Button size="sm" onClick={() => onSaveEdit(f)}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => startEdit(f)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => onDelete(f)}>
                              Delete
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
