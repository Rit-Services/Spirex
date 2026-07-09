// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearUserDetail, fetchUserDetailThunk, updateUserNameThunk } from '@/store/userSlice';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/EmptyState';

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const { currentDetail, detailLoading, detailError } = useAppSelector((s) => s.users);
  const { user: currentUser, refresh } = useAuth();

  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    void dispatch(fetchUserDetailThunk(id));
    return () => {
      dispatch(clearUserDetail());
    };
  }, [dispatch, id]);

  const startEdit = () => {
    setNameDraft(currentDetail?.user.name ?? '');
    setEditing(true);
  };

  const onSaveName = async () => {
    const target = currentDetail?.user;
    if (!target) return;
    const next = nameDraft.trim();
    if (!next) { toast.error('Name cannot be empty'); return; }
    if (next === target.name) { setEditing(false); return; }
    setSaving(true);
    const r = await dispatch(updateUserNameThunk({ id: target.id, name: next }));
    setSaving(false);
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success('Name updated');
      setEditing(false);
      // If an admin renamed themselves here, refresh auth so the topbar updates.
      if (currentUser?.id === target.id) void refresh();
    } else {
      toast.error((r.payload as string) ?? 'Failed to update name');
    }
  };

  if (detailLoading && !currentDetail) {
    return <p className="p-4 text-sm text-muted-foreground">Loading user…</p>;
  }

  if (detailError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/users">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to users
          </Link>
        </Button>
        <p className="text-sm text-destructive">{detailError}</p>
      </div>
    );
  }

  if (!currentDetail) return null;

  const { user, projects } = currentDetail;
  const disabled = !!user.disabledAt;
  const initial = user.name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/admin/users">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to users
        </Link>
      </Button>

      <Card className="animate-slide-up motion-reduce:animate-none">
        <CardHeader>
          <div className="flex items-start gap-4">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-2xl font-semibold text-muted-foreground">
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              {editing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void onSaveName();
                      if (e.key === 'Escape') setEditing(false);
                    }}
                    maxLength={120}
                    autoFocus
                    aria-label="Display name"
                    className="h-9 max-w-xs text-lg font-semibold"
                  />
                  <Button size="icon" className="h-9 w-9" onClick={() => void onSaveName()} disabled={saving} aria-label="Save name">
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => setEditing(false)} disabled={saving} aria-label="Cancel">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CardTitle className="truncate text-2xl">{user.name}</CardTitle>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-muted-foreground"
                    onClick={startEdit}
                    aria-label={`Edit name for ${user.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <CardDescription className="truncate">{user.email}</CardDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="secondary" className="capitalize">{user.orgRole ?? 'member'}</Badge>
                <Badge variant={disabled ? 'destructive' : 'outline'}>
                  {disabled ? 'disabled' : 'active'}
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                User ID
              </dt>
              <dd className="mt-0.5 font-mono text-xs">{user.id}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Created
              </dt>
              <dd className="mt-0.5">{formatDate(user.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Last updated
              </dt>
              <dd className="mt-0.5">{formatDate(user.updatedAt)}</dd>
            </div>
            {disabled ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Disabled at
                </dt>
                <dd className="mt-0.5">{formatDate(user.disabledAt)}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card
        className="animate-slide-up motion-reduce:animate-none"
        style={{ animationDelay: '90ms' }}
      >
        <CardHeader>
          <CardTitle className="text-base">Projects ({projects.length})</CardTitle>
          <CardDescription>
            Projects this user is a member of, with their per-project role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <EmptyState
              title="Not assigned to any projects"
              description="This user has no project memberships yet."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.membershipId}>
                    <TableCell className="font-medium">{p.projectName}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.projectKey}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.projectRole}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(p.joinedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/projects/${p.projectId}`} aria-label={`Open ${p.projectName}`}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
