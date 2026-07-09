// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { useParams, Navigate, Link, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  deleteProjectThunk,
  fetchMembersThunk,
  fetchProjectsThunk,
  fetchUnlinkedUsersThunk,
  linkUnlinkedUserThunk,
  removeMemberThunk,
  setCurrentProject,
  updateProjectThunk,
  upsertMemberThunk,
} from '@/store/projectSlice';
import { fetchUserDirectoryThunk } from '@/store/userSlice';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPicker } from '@/components/scrum/UserPicker';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Settings2,
  Columns3,
  ListPlus,
  Users,
  AlertTriangle,
  ChevronRight,
  Mail,
  HelpCircle,
  ChevronDown,
  Link2,
  UserCog,
  type LucideIcon,
} from 'lucide-react';
import {
  PROJECT_ROLE_LEVEL,
  maxAssignableProjectLevel,
  type ProjectRole,
} from '@/features/auth/permissions';
import {
  useProjectNotificationPrefs,
  EVENTS,
  Toggle,
  EventHeader,
  NotificationGuide,
} from '@/components/scrum/ProjectNotificationSettings';
import { cn } from '@/lib/utils';

const ROLES: ProjectRole[] = ['lead', 'developer', 'reporter', 'viewer'];

/** A clickable card that links to a sub-settings page (workflow, fields).
 *  Replaces the old "card with a lone button" — reads as a navigation row. */
function SettingsNavCard({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function ProjectSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { list, currentMembers, unlinkedUsers } = useAppSelector((s) => s.projects);
  const users = useAppSelector((s) => s.users.directory);
  const project = list.find((p) => p.id === id) ?? null;
  const { canInProject, myRole } = useCurrentProject();
  const { activeOrg, user } = useAuth();
  // Phase 2: the assignment ceiling comes from the active org's role, not the
  // legacy global role.
  const maxAssignableLevel = maxAssignableProjectLevel(activeOrg?.role ?? 'external', myRole);
  const assignableRoles = ROLES.filter((r) => PROJECT_ROLE_LEVEL[r] <= maxAssignableLevel);
  const canEditDetails = canInProject('project:edit');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sprintLength, setSprintLength] = useState(2);
  const [savingDetails, setSavingDetails] = useState(false);

  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<ProjectRole>('viewer');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Unlinked-user linking: chosen target member per ghost, and which ghost is
  // mid-link (disables its row).
  const [linkTarget, setLinkTarget] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState<string | null>(null);
  const canManageMembers = canInProject('member:manage');

  // Email-update prefs are now part of the Members table (merged in). `notif`
  // owns the fetch + optimistic per-cell save; the guide explains the logic.
  const notif = useProjectNotificationPrefs(id);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (list.length === 0) void dispatch(fetchProjectsThunk());
    void dispatch(fetchUserDirectoryThunk());
  }, [dispatch, list.length]);

  useEffect(() => {
    if (id) {
      dispatch(setCurrentProject(id));
      void dispatch(fetchMembersThunk(id));
      // Unlinked users ride the member:manage gate; only fetch when allowed so a
      // viewer/developer never trips a 403.
      if (canManageMembers) void dispatch(fetchUnlinkedUsersThunk(id));
    }
  }, [dispatch, id, canManageMembers]);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description ?? '');
      setSprintLength(project.defaultSprintLengthWeeks);
    }
  }, [project]);

  if (!project) return list.length === 0 ? null : <Navigate to="/projects" replace />;
  // Any project member may open settings — even a viewer/developer — so they can
  // manage their OWN email-update prefs. Each section below still gates itself
  // (details/workflow behind project:edit, member management behind member:manage,
  // delete behind project:delete); a non-lead simply sees fewer of them.
  if (!canInProject('project:view'))
    return <Navigate to={`/projects/${project.id}`} replace />;

  // Only enable "Save changes" once something actually differs from the saved
  // project — avoids a no-op write and the false "Project updated" toast.
  const detailsDirty =
    name !== project.name ||
    (description || '') !== (project.description ?? '') ||
    sprintLength !== project.defaultSprintLengthWeeks;

  const onSaveDetails = async () => {
    setSavingDetails(true);
    const r = await dispatch(
      updateProjectThunk({
        id: project.id,
        input: {
          name,
          description: description || null,
          defaultSprintLengthWeeks: sprintLength,
        },
      }),
    );
    setSavingDetails(false);
    if (r.meta.requestStatus === 'fulfilled') toast.success('Project updated');
    else toast.error((r.payload as string) ?? 'Failed to update project');
  };

  const onAddMember = async () => {
    if (!newUserId) return toast.error('Pick a user');
    const r = await dispatch(
      upsertMemberThunk({ projectId: project.id, userId: newUserId, projectRole: newRole }),
    );
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success('Member added');
      setNewUserId('');
    } else {
      toast.error((r.payload as string) ?? 'Failed to add member');
    }
  };

  const onRoleChange = async (userId: string, projectRole: ProjectRole) => {
    const r = await dispatch(upsertMemberThunk({ projectId: project.id, userId, projectRole }));
    if (r.meta.requestStatus === 'fulfilled') toast.success('Role updated');
    else toast.error((r.payload as string) ?? 'Failed to update role');
  };

  const onRemove = async (userId: string) => {
    const r = await dispatch(removeMemberThunk({ projectId: project.id, userId }));
    if (r.meta.requestStatus === 'fulfilled') toast.success('Member removed');
    else toast.error((r.payload as string) ?? 'Failed to remove member');
  };

  const onLinkUnlinked = async (ghostId: string, ghostName: string) => {
    const targetUserId = linkTarget[ghostId];
    if (!targetUserId) return toast.error('Pick a member to link to');
    setLinking(ghostId);
    const r = await dispatch(
      linkUnlinkedUserThunk({ projectId: project!.id, ghostId, targetUserId }),
    );
    setLinking(null);
    if (r.meta.requestStatus === 'fulfilled') {
      const { reassigned } = r.payload as { reassigned: number };
      const targetName = currentMembers.find((m) => m.userId === targetUserId)?.user.name ?? 'member';
      toast.success(`Linked ${ghostName} → ${targetName} · ${reassigned} item${reassigned === 1 ? '' : 's'} reassigned`);
      setLinkTarget((prev) => {
        const next = { ...prev };
        delete next[ghostId];
        return next;
      });
      // Attribution changed across the project — refresh members so any counts /
      // derived views on this page reflect the move.
      void dispatch(fetchMembersThunk(project!.id));
    } else {
      toast.error((r.payload as string) ?? 'Failed to link user');
    }
  };

  const onConfirmDeleteProject = async () => {
    setDeleting(true);
    const r = await dispatch(deleteProjectThunk(project.id));
    setDeleting(false);
    if (r.meta.requestStatus === 'fulfilled') {
      toast.success(`Deleted ${project.name}`);
      setDeleteOpen(false);
      navigate('/projects');
    } else {
      toast.error((r.payload as string) ?? 'Failed to delete project');
    }
  };

  const nonMemberUsers = users.filter((u) => !currentMembers.some((m) => m.userId === u.id));

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link to={`/projects/${project.id}`}>
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Back to project
          </Link>
        </Button>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">Project settings</h1>
          <Badge variant="outline" className="font-mono text-[11px]">
            {project.key}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage <span className="font-medium text-foreground">{project.name}</span> — its details,
          workflow, custom fields, and team.
        </p>
      </div>

      {canEditDetails ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-muted-foreground" />
                Details
              </CardTitle>
              <CardDescription>General project settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this project about?"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sprint-length">Default sprint length (weeks)</Label>
                <Select value={String(sprintLength)} onValueChange={(v) => setSprintLength(Number(v))}>
                  <SelectTrigger className="sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 week</SelectItem>
                    <SelectItem value="2">2 weeks</SelectItem>
                    <SelectItem value="3">3 weeks</SelectItem>
                    <SelectItem value="4">4 weeks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end border-t pt-4">
                <Button onClick={onSaveDetails} disabled={!detailsDirty || savingDetails}>
                  {savingDetails ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Configure: each links to its own editor. Grid of nav cards reads
              far better than two cards that each held a single button. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingsNavCard
              to={`/projects/${project.id}/settings/workflow`}
              icon={Columns3}
              title="Workflow"
              description="Column labels, colors, and order for the board & backlog."
            />
            <SettingsNavCard
              to={`/projects/${project.id}/settings/fields`}
              icon={ListPlus}
              title="Custom fields"
              description="Extra fields (text, number, date, select, checkbox) on every issue."
            />
          </div>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Members
                <Badge variant="secondary" className="ml-0.5 font-normal">
                  {currentMembers.length}
                </Badge>
              </CardTitle>
              <CardDescription>
                Manage roles and who gets emailed about project updates.
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setGuideOpen((v) => !v)}
              aria-expanded={guideOpen}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              How email updates work
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform', guideOpen && 'rotate-180')}
              />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <NotificationGuide open={guideOpen} />
          {canInProject('member:manage') ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 items-end gap-3 rounded-md border bg-muted/40 p-3 sm:grid-cols-[1fr_10rem_auto]">
                <div className="space-y-1">
                  <Label htmlFor="new-member-user">User</Label>
                  {nonMemberUsers.length === 0 ? (
                    <div className="flex h-9 items-center rounded-lg border border-input bg-background px-3 text-xs text-muted-foreground">
                      Everyone in your organization is already a member.
                    </div>
                  ) : (
                    <UserPicker
                      value={newUserId || null}
                      onChange={(id) => setNewUserId(id ?? '')}
                      placeholder="Select a user…"
                      options={nonMemberUsers.map((u) => ({
                        id: u.id,
                        name: u.name,
                        email: u.email,
                      }))}
                      className="h-9"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-member-role">Role</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as ProjectRole)}>
                    <SelectTrigger id="new-member-role" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableRoles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={onAddMember} className="h-9 sm:self-end">
                  Add member
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                You can only assign roles at or below your own access level.
              </p>
            </div>
          ) : null}

          <Table>
            <TableHeader>
              {/* Grouped header: the 3 email-update columns sit under one label
                  so it's obvious those switches are about email. */}
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom">Member</TableHead>
                <TableHead colSpan={3} className="border-l text-center">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    Email updates
                  </span>
                </TableHead>
                <TableHead rowSpan={2} className="border-l align-bottom">Role</TableHead>
                <TableHead rowSpan={2} className="text-right align-bottom">Actions</TableHead>
              </TableRow>
              <TableRow>
                {EVENTS.map((e, i) => (
                  <TableHead
                    key={e.key}
                    className={cn('text-center text-[11px] font-medium', i === 0 && 'border-l')}
                  >
                    <EventHeader label={e.label} hint={e.hint} />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No members yet.
                  </TableCell>
                </TableRow>
              ) : (
                currentMembers.map((m) => {
                  const memberOutranks =
                    PROJECT_ROLE_LEVEL[m.projectRole] > maxAssignableLevel;
                  const canManageThisRow = canInProject('member:manage') && !memberOutranks;
                  // Email switches: editable for your OWN row always, and for any
                  // row when you can manage the whole project's notifications.
                  const canEditNotif = notif.canManageAll || m.userId === user?.id;
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Avatar name={m.user.name} />
                          <div className="min-w-0">
                            <div className="truncate">{m.user.name}</div>
                            <div className="truncate text-xs font-normal text-muted-foreground">
                              {m.user.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      {EVENTS.map((e, i) => {
                        const key = `${m.userId}:${e.key}`;
                        return (
                          <TableCell
                            key={e.key}
                            className={cn('text-center', i === 0 && 'border-l')}
                          >
                            {canEditNotif ? (
                              <Toggle
                                checked={notif.prefs[key] ?? false}
                                disabled={notif.loading || notif.saving.has(key)}
                                onChange={(next) => notif.setCell(m.userId, e.key, next)}
                                label={`${e.label} email for ${m.user.name}`}
                              />
                            ) : (
                              <span className="text-muted-foreground" title="Only this member or a lead can change this">
                                —
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="border-l">
                        {canManageThisRow ? (
                          <Select
                            value={m.projectRole}
                            onValueChange={(v) => onRoleChange(m.userId, v as ProjectRole)}
                          >
                            <SelectTrigger className="h-8 w-auto min-w-[110px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {assignableRoles.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="secondary">{m.projectRole}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManageThisRow ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemove(m.userId)}
                            aria-label={`Remove ${m.user.name}`}
                            className="text-destructive hover:text-destructive"
                          >
                            Remove
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManageMembers && unlinkedUsers.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-muted-foreground" />
              Unlinked users
              <Badge variant="secondary" className="ml-0.5 font-normal">
                {unlinkedUsers.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              People imported from JIRA who don't match a real account. They attribute work
              truthfully but can't log in. Link one to a project member to move all of that
              person's items in <span className="font-medium text-foreground">{project.name}</span>{' '}
              onto the real user.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {unlinkedUsers.map((g) => {
              const isLinking = linking === g.id;
              return (
                <div
                  key={g.id}
                  className="grid grid-cols-1 items-end gap-3 rounded-md border bg-muted/40 p-3 sm:grid-cols-[1fr_14rem_auto]"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Avatar name={g.name} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate font-medium">
                          {g.name}
                          <Badge variant="outline" className="font-normal text-muted-foreground">
                            unlinked
                          </Badge>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {g.itemCount} item{g.itemCount === 1 ? '' : 's'} in this project
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`link-${g.id}`} className="sr-only">
                      Link {g.name} to a member
                    </Label>
                    <Select
                      value={linkTarget[g.id] ?? ''}
                      onValueChange={(v) => setLinkTarget((p) => ({ ...p, [g.id]: v }))}
                    >
                      <SelectTrigger id={`link-${g.id}`} className="h-9">
                        <SelectValue placeholder="Link to member…" />
                      </SelectTrigger>
                      <SelectContent>
                        {currentMembers.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            Add a project member first.
                          </div>
                        ) : (
                          currentMembers.map((m) => (
                            <SelectItem key={m.userId} value={m.userId}>
                              {m.user.name} · {m.user.email}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => onLinkUnlinked(g.id, g.name)}
                    disabled={isLinking || !linkTarget[g.id]}
                    className="h-9 sm:self-end"
                  >
                    <Link2 className="mr-1.5 h-3.5 w-3.5" />
                    {isLinking ? 'Linking…' : 'Link'}
                  </Button>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground">
              Reassignment is project-scoped — if this person has work in other projects, it stays
              attributed to them there until you link them in each.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {canInProject('project:delete') ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Danger zone
            </CardTitle>
            <CardDescription>
              Permanently delete this project and every sprint, story, and worklog under it. This
              cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteConfirm('');
                setDeleteOpen(true);
              }}
            >
              Delete project
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {project.name}?</DialogTitle>
            <DialogDescription>
              This will permanently remove the project and all its data. To confirm, type the
              project key <span className="font-mono font-semibold">{project.key}</span> below.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={project.key}
            aria-label="Type project key to confirm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDeleteProject}
              disabled={deleting || deleteConfirm !== project.key}
            >
              {deleting ? 'Deleting…' : 'Delete project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
