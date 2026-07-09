// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  ArrowRight, ArrowLeft, CheckCircle2, Loader2,
  Cloud, FolderKanban, Ticket, ChevronRight, Users, Zap, BookOpen, ExternalLink,
  ShieldCheck, RefreshCw, Workflow, UserCheck, Paperclip,
  Search, CheckSquare, Square, Copy, AlertCircle, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { jiraApi, type JiraCreds, type JiraProject, type ImportPreview, type ImportResult, type SavedConnection, type ImportProgressEvent } from '@/apis/jiraApi';
import { extractError } from '@/config/httpClient';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchProjectsThunk } from '@/store/projectSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Mode = 'tickets' | 'project';
type Step = 'connect' | 'select' | 'configure' | 'preview' | 'importing' | 'done';

// Per-project outcome for a bulk run. `pending` → queued, `importing` → the one
// currently streaming, `ok`/`failed` → settled. `bulkResults` mirrors the
// selection order so the importing/done screens can render a live checklist.
type BulkStatus = 'pending' | 'importing' | 'ok' | 'failed';
interface BulkResult {
  project: JiraProject;
  status: BulkStatus;
  result?: ImportResult;
  error?: string;
}

// Per-project analyze result for the bulk confirm screen. Fetched sequentially
// (one JIRA `preview()` at a time) so we don't fire N issue-scans at once.
interface BulkPreviewEntry {
  status: 'loading' | 'ok' | 'error';
  preview?: ImportPreview;
}

interface State {
  step: Step;
  creds: JiraCreds;
  jiraProjects: JiraProject[];
  // Multi-select. Exactly one entry → the single-project flow (issues-only OR
  // full project). More than one → bulk full-project import.
  selectedJiraProjects: JiraProject[];
  mode: Mode;
  targetProjectId: string;
  preview: ImportPreview | null;
  result: ImportResult | null;
  // The user's saved connection (masked), or null until the initial fetch
  // resolves. Drives whether the connect step shows the saved card or the form.
  savedConnection: SavedConnection | null;
  // Live import progress (streamed over SSE); null until the first event lands.
  progress: ImportProgressEvent | null;
  // Bulk run state. `bulkIndex` = which selected project is streaming now;
  // `bulkResults` is empty for a single import, non-empty during/after a bulk run.
  bulkIndex: number;
  bulkResults: BulkResult[];
  // Per-project analyze results on the bulk confirm screen, keyed by JIRA
  // project id. Filled in progressively as each sequential preview resolves.
  bulkPreviews: Record<string, BulkPreviewEntry>;
}

const STEPS: Step[] = ['connect', 'select', 'configure', 'preview', 'importing', 'done'];

// Friendly labels for each streamed import phase. The server sends counts; the
// client owns the wording so copy stays consistent with the rest of the UI.
const PHASE_LABEL: Record<ImportProgressEvent['phase'], string> = {
  setup: 'Preparing…',
  workflow: 'Recreating workflow board…',
  epics: 'Importing epics…',
  sprints: 'Importing sprints…',
  issues: 'Importing issues…',
  subtasks: 'Linking subtasks…',
  attachments: 'Importing attachments…',
  members: 'Linking team members…',
  done: 'Finishing up…',
};

// Phases that carry a meaningful "x / y" count worth showing under the bar.
const COUNTED_PHASES: Partial<Record<ImportProgressEvent['phase'], string>> = {
  epics: 'epics',
  sprints: 'sprints',
  issues: 'issues',
  subtasks: 'subtasks',
  attachments: 'files',
};

function ImportingStep({ progress }: { progress: ImportProgressEvent | null }) {
  const phase = progress?.phase ?? 'setup';
  const percent = progress?.percent ?? 0;
  const label = PHASE_LABEL[phase] ?? 'Importing…';
  const noun = COUNTED_PHASES[phase];
  const showCount = noun != null && progress?.total != null && progress.total > 0;

  return (
    <div className="space-y-6 py-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
        <p className="font-medium">{label}</p>
        {showCount && (
          <p className="text-sm tabular-nums text-muted-foreground">
            {progress?.current ?? 0} / {progress?.total} {noun}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Large projects can take a minute — keep this tab open while we work.
      </p>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const visible: Step[] = ['connect', 'select', 'configure', 'preview'];
  return (
    <div className="flex items-center gap-1.5">
      {visible.map((s, i) => {
        const idx = STEPS.indexOf(s);
        const curIdx = STEPS.indexOf(current);
        const done = curIdx > idx;
        const active = s === current;
        return (
          <div key={s} className="flex items-center gap-1.5">
            {i > 0 && <div className={cn('h-px w-6', done ? 'bg-primary' : 'bg-border')} />}
            <div
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ring-2',
                active && 'bg-primary text-primary-foreground ring-primary/30',
                done && 'bg-primary/15 text-primary ring-primary/20',
                !active && !done && 'bg-muted text-muted-foreground ring-border',
              )}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function ConnectStep({
  creds,
  saved,
  onChange,
  onNext,
}: {
  creds: JiraCreds;
  saved: SavedConnection | null;
  onChange: (c: Partial<JiraCreds>) => void;
  onNext: (projects: JiraProject[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  // When a saved connection exists we show it by default. "Use a different
  // account" flips this to reveal the credential form; a fresh connect
  // overwrites the saved one on the server.
  const [showForm, setShowForm] = useState(false);
  const useSaved = saved?.connected === true && !showForm;

  // Reuse the saved server-side connection — no creds sent, the token stays
  // on the server. Validate first so a revoked token surfaces a clear error
  // instead of an empty project list.
  const continueSaved = async () => {
    setLoading(true);
    try {
      await jiraApi.validate();
      const projects = await jiraApi.listProjects();
      onNext(projects);
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const connect = async () => {
    if (!creds.domain || !creds.email || !creds.apiToken) {
      toast.error('All fields are required');
      return;
    }
    setLoading(true);
    try {
      await jiraApi.validate(creds);
      const projects = await jiraApi.listProjects(creds);
      onNext(projects);
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  // `saved === null` → the initial fetch hasn't resolved. Hold a small spinner
  // so the credential form doesn't flash before snapping to the saved card.
  if (saved === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm">Checking for a saved connection…</p>
      </div>
    );
  }

  if (useSaved && saved.connected) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">JIRA Cloud connected</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Using your saved connection. No need to re-enter credentials.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border bg-muted/40 px-4 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{saved.domain}</div>
            <div className="truncate text-sm text-muted-foreground">
              {saved.displayName ? `${saved.displayName} · ` : ''}{saved.email}
            </div>
          </div>
        </div>

        <Button onClick={() => void continueSaved()} disabled={loading} className="w-full">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
          {loading ? 'Connecting…' : 'Continue'}
        </Button>

        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mx-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Use a different account
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Connect to JIRA Cloud</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your JIRA Cloud credentials. An API token is required — generate one at{' '}
          <a
            href="https://id.atlassian.com/manage-profile/security/api-tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
          >
            id.atlassian.com → Security → API tokens
            <ExternalLink className="h-3 w-3" />
          </a>
          .
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="jira-domain">JIRA Domain</Label>
          <Input
            id="jira-domain"
            placeholder="yourteam.atlassian.net"
            value={creds.domain}
            onChange={(e) => onChange({ domain: e.target.value.trim() })}
          />
          <p className="text-xs text-muted-foreground">Just the host — no https:// prefix needed</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="jira-email">Email</Label>
          <Input
            id="jira-email"
            type="email"
            placeholder="you@company.com"
            value={creds.email}
            onChange={(e) => onChange({ email: e.target.value.trim() })}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="jira-token">API Token</Label>
            <a
              href="https://id.atlassian.com/manage-profile/security/api-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Get an API token
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <Input
            id="jira-token"
            type="password"
            placeholder="••••••••••••••"
            value={creds.apiToken}
            onChange={(e) => onChange({ apiToken: e.target.value.trim() })}
            onKeyDown={(e) => { if (e.key === 'Enter') void connect(); }}
          />
        </div>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
        <ShieldCheck className="mr-2 inline h-4 w-4" />
        Your token is saved securely (encrypted) so you won&apos;t have to re-enter it next time.
      </div>

      <Button onClick={connect} disabled={loading} className="w-full">
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Cloud className="mr-2 h-4 w-4" />}
        {loading ? 'Connecting…' : 'Connect'}
      </Button>

      {saved?.connected ? (
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="mx-auto flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Cancel — use saved connection
        </button>
      ) : null}
    </div>
  );
}

/** Case-insensitive, whitespace-trimmed name match against existing SPIREX
 *  projects. A full import creates the project with the JIRA name verbatim, so
 *  a hit here means "importing this will create a same-named duplicate". */
function nameAlreadyInSpirex(p: JiraProject, existingNames: Set<string>): boolean {
  return existingNames.has(p.name.trim().toLowerCase());
}

/** Small amber "already in SPIREX" flag. Informational only — never blocks. */
function NameMatchBadge() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400"
      title="A SPIREX project already uses this name — importing will create a duplicate name"
    >
      <Copy className="h-3 w-3" />
      In SPIREX
    </span>
  );
}

function SelectProjectStep({
  projects,
  selectedIds,
  existingNames,
  onToggle,
  onSelectAll,
  onClear,
  onNext,
  onBack,
}: {
  projects: JiraProject[];
  selectedIds: Set<string>;
  existingNames: Set<string>;
  onToggle: (p: JiraProject) => void;
  onSelectAll: (ps: JiraProject[]) => void;
  onClear: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = q
    ? projects.filter((p) => p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q))
    : projects;
  const selectedCount = selectedIds.size;
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Select JIRA Projects</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {projects.length} project{projects.length !== 1 ? 's' : ''} found. Pick one, or several to
          import in bulk.
        </p>
      </div>

      {/* Search + bulk-select controls */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects by name or key…"
            className="pl-8"
            aria-label="Search JIRA projects"
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {selectedCount > 0 ? `${selectedCount} selected` : 'None selected'}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectAll(filtered)}
              disabled={filtered.length === 0 || allFilteredSelected}
              className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            >
              Select all{q ? ' (filtered)' : ''}
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={selectedCount === 0}
              className="font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
        {filtered.map((p) => {
          const isSelected = selectedIds.has(p.id);
          const matches = nameAlreadyInSpirex(p, existingNames);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p)}
              aria-pressed={isSelected}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all',
                isSelected
                  ? 'border-primary/50 bg-primary/[0.06] ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/30 hover:bg-muted/60',
              )}
            >
              {isSelected ? (
                <CheckSquare className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Square className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              )}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-xs font-bold text-primary">
                {p.key.slice(0, 3)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{p.name}</span>
                  {matches && <NameMatchBadge />}
                </div>
                <div className="text-xs text-muted-foreground">{p.key}</div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
            No projects match “{query}”.
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={selectedCount === 0} className="flex-1">
          {selectedCount > 1 ? `Continue (${selectedCount} projects)` : 'Continue'}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ConfigureStep({
  mode,
  targetProjectId,
  localProjects,
  onMode,
  onTarget,
  onNext,
  onBack,
}: {
  mode: Mode;
  targetProjectId: string;
  localProjects: Array<{ id: string; name: string; key: string }>;
  onMode: (m: Mode) => void;
  onTarget: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const canProceed = mode === 'project' || Boolean(targetProjectId);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Import Mode</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose what to import.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onMode('tickets')}
          className={cn(
            'flex flex-col gap-2 rounded-xl border p-4 text-left transition-all',
            mode === 'tickets'
              ? 'border-primary/50 bg-primary/[0.06] ring-2 ring-primary/20'
              : 'border-border hover:border-primary/30 hover:bg-muted/40',
          )}
        >
          <Ticket className="h-5 w-5 text-primary" />
          <div>
            <div className="font-medium">Issues only</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Import stories into an existing project
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onMode('project')}
          className={cn(
            'flex flex-col gap-2 rounded-xl border p-4 text-left transition-all',
            mode === 'project'
              ? 'border-primary/50 bg-primary/[0.06] ring-2 ring-primary/20'
              : 'border-border hover:border-primary/30 hover:bg-muted/40',
          )}
        >
          <FolderKanban className="h-5 w-5 text-primary" />
          <div>
            <div className="font-medium">Full project</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Create new project with epics, sprints &amp; issues
            </div>
          </div>
        </button>
      </div>

      {mode === 'tickets' && (
        <div className="space-y-1.5">
          <Label>Target project</Label>
          <Select value={targetProjectId || '__none__'} onValueChange={(v) => onTarget(v === '__none__' ? '' : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select a project…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select a project…</SelectItem>
              {localProjects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.key} · {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {mode === 'project' && (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          A new project will be created using the JIRA project name and key.
          You will be added as project lead.
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onNext} disabled={!canProceed} className="flex-1">
          Preview <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function PreviewStep({
  preview,
  mode,
  jiraProject,
  onImport,
  onBack,
  importing,
}: {
  preview: ImportPreview;
  mode: Mode;
  jiraProject: JiraProject;
  onImport: () => void;
  onBack: () => void;
  importing: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Import Preview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review what will be imported from <span className="font-medium text-foreground">{jiraProject.name}</span>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <BookOpen className="mx-auto mb-1 h-5 w-5 text-primary" />
            <div className="text-2xl font-bold">{preview.issueCount}</div>
            <div className="text-xs text-muted-foreground">Issues</div>
          </CardContent>
        </Card>
        {mode === 'project' && (
          <>
            <Card>
              <CardContent className="pt-4 text-center">
                <Zap className="mx-auto mb-1 h-5 w-5 text-primary" />
                <div className="text-2xl font-bold">{preview.epicCount}</div>
                <div className="text-xs text-muted-foreground">Epics</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <ArrowRight className="mx-auto mb-1 h-5 w-5 text-primary" />
                <div className="text-2xl font-bold">{preview.sprintCount}</div>
                <div className="text-xs text-muted-foreground">Sprints</div>
              </CardContent>
            </Card>
          </>
        )}
        <Card>
          <CardContent className="pt-4 text-center">
            <Paperclip className="mx-auto mb-1 h-5 w-5 text-primary" />
            <div className="text-2xl font-bold">{preview.attachmentCount}</div>
            <div className="text-xs text-muted-foreground">Attachments</div>
          </CardContent>
        </Card>
      </div>

      {/* The project key that will be created — original JIRA key, or suffixed. */}
      {mode === 'project' && (
        <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
          <FolderKanban className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-medium">Project key</span>
          <Badge variant="secondary" className="font-mono">{preview.projectKey}</Badge>
          {preview.projectKeyChanged && (
            <span className="ml-auto text-xs text-amber-600">
              JIRA key <span className="font-mono">{jiraProject.key}</span> is already taken — using{' '}
              <span className="font-mono">{preview.projectKey}</span>
            </span>
          )}
          {!preview.projectKeyChanged && (
            <span className="ml-auto text-xs text-muted-foreground">kept from JIRA</span>
          )}
        </div>
      )}

      {/* DEBUG: planned workflow columns and how each JIRA status maps. */}
      {mode === 'project' && preview.workflowPlan.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Workflow className="h-4 w-4 text-primary" />
            <span>Workflow board ({preview.workflowPlan.length} column{preview.workflowPlan.length !== 1 ? 's' : ''})</span>
          </div>
          <div className="space-y-1.5 rounded-lg border bg-muted/40 px-3 py-2.5">
            {preview.workflowPlan.map((col, i) => (
              <div key={`${col.name}-${i}`} className="flex items-center gap-2 text-xs">
                <span className="w-5 shrink-0 text-right font-mono text-muted-foreground">{i + 1}.</span>
                <Badge variant="secondary" className="font-medium">{col.name}</Badge>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                <span className="font-mono text-[10px] text-primary">{col.coreStatus}</span>
                {col.statuses.length > 0 && (
                  <span className="ml-auto truncate text-[10px] text-muted-foreground" title={col.statuses.join(', ')}>
                    {col.statuses.join(' · ')}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Each JIRA column is recreated and pinned to a SPIREX status (right). Stories land in the matching column.
          </p>
        </div>
      )}
      {mode === 'project' && preview.workflowPlan.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          No JIRA board columns were found — the project will use SPIREX's default workflow.
        </div>
      )}

      {/* DEBUG: every person JIRA returned, with the email it gave us (or none). */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="h-4 w-4 text-primary" />
          <span>People found in JIRA ({preview.peopleFound.length})</span>
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {preview.peopleFound.filter((p) => p.matchMethod === 'email').length} by email ·{' '}
            {preview.peopleFound.filter((p) => p.matchMethod === 'name').length} by name ·{' '}
            {preview.peopleFound.filter((p) => !p.matched).length} unmatched
          </span>
        </div>
        <div className="max-h-60 overflow-y-auto rounded-lg border bg-muted/40 text-xs">
          {preview.peopleFound.map((p, i) => (
            <div
              key={p.accountId ?? `${p.displayName}-${i}`}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5',
                i > 0 && 'border-t border-border/60',
              )}
            >
              {p.matched ? (
                <UserCheck className={cn('h-3.5 w-3.5 shrink-0', p.matchMethod === 'email' ? 'text-emerald-500' : 'text-sky-500')} />
              ) : (
                <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              )}
              <span className="shrink-0 font-medium">{p.displayName}</span>
              <span className={cn('truncate', p.email ? 'text-muted-foreground' : 'italic text-amber-600')}>
                {p.email ?? 'no email exposed by JIRA'}
              </span>
              <span className="ml-auto hidden shrink-0 font-mono text-[10px] text-muted-foreground/70 sm:inline">
                {p.roles.join(',')}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 text-[10px]',
                  p.matchMethod === 'email'
                    ? 'border-emerald-300 text-emerald-600'
                    : p.matchMethod === 'name'
                      ? 'border-sky-300 text-sky-600'
                      : 'text-muted-foreground',
                )}
              >
                {p.matchMethod === 'email'
                  ? 'developer · email'
                  : p.matchMethod === 'name'
                    ? 'developer · name'
                    : 'unmatched'}
              </Badge>
            </div>
          ))}
          {preview.peopleFound.length === 0 && (
            <div className="px-3 py-4 text-center text-muted-foreground">No people found on this project.</div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Matched people are added as <strong>developers</strong>.{' '}
          <span className="text-emerald-600">Email</span> matches are exact;{' '}
          <span className="text-sky-600">name</span> matches are a fallback when JIRA hides the email (a name shared by two
          SPIREX users is skipped to avoid a wrong assignment).
        </p>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={importing} className="flex-1">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onImport} disabled={importing} className="flex-1">
          {importing ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…</>
          ) : (
            <>Start import <ArrowRight className="ml-2 h-4 w-4" /></>
          )}
        </Button>
      </div>
    </div>
  );
}

function DoneStep({
  result,
  mode,
  navigate,
}: {
  result: NonNullable<State['result']>;
  mode: Mode;
  navigate: (to: string) => void;
}) {
  return (
    <div className="space-y-5 text-center">
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/30">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold">Import complete!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Successfully imported {result.imported} issue{result.imported !== 1 ? 's' : ''}
          {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}
          {result.commentsImported ? `, ${result.commentsImported} comment${result.commentsImported !== 1 ? 's' : ''}` : ''}
          {result.attachmentsImported ? `, ${result.attachmentsImported} attachment${result.attachmentsImported !== 1 ? 's' : ''}` : ''}
          {result.membersLinked ? `, ${result.membersLinked} member${result.membersLinked !== 1 ? 's' : ''} linked` : ''}.
        </p>
        {result.attachmentFailures && result.attachmentFailures.length > 0 && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-500">
            {result.attachmentFailures.length} file{result.attachmentFailures.length !== 1 ? 's' : ''} could not be
            downloaded from JIRA (e.g. {result.attachmentFailures[0].filename}).
          </p>
        )}
      </div>

      {mode === 'project' && result.projectId && (
        <div className="inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm">
          <FolderKanban className="h-4 w-4 text-primary" />
          <span className="font-mono font-medium text-primary">{result.projectKey}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span>New project created</span>
        </div>
      )}

      <div className="flex gap-3 justify-center">
        {mode === 'project' && result.projectId ? (
          <Button onClick={() => navigate(`/projects/${result.projectId}`)}>
            Open project <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={() => navigate('/projects')}>
            Back to projects
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Bulk steps ────────────────────────────────────────────────────────────────

// Bulk preview is intentionally light: we DON'T run a per-project `preview()`
// (each scans all JIRA issues — firing N at once hammers JIRA's rate limits).
// The confirm screen just lists the chosen projects + name-match flags; the real
// counts and the auto-resolved project key come back per import in the summary.
// A compact stat cell for the bulk aggregate row.
function BulkStat({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2 py-2.5 text-center">
      <div className="mx-auto mb-0.5 flex h-5 items-center justify-center text-primary">{icon}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function BulkPreviewStep({
  selected,
  existingNames,
  previews,
  onImport,
  onBack,
  importing,
}: {
  selected: JiraProject[];
  existingNames: Set<string>;
  previews: Record<string, BulkPreviewEntry>;
  onImport: () => void;
  onBack: () => void;
  importing: boolean;
}) {
  const matchCount = selected.filter((p) => nameAlreadyInSpirex(p, existingNames)).length;

  // How many projects have finished analyzing (ok or error).
  const settled = selected.filter((p) => previews[p.id] && previews[p.id].status !== 'loading').length;
  const analyzing = settled < selected.length;

  // Aggregate across every successfully-analyzed project. People are de-duped by
  // accountId so someone on three projects counts once.
  const ok = selected.map((p) => previews[p.id]?.preview).filter(Boolean) as ImportPreview[];
  const totals = ok.reduce(
    (acc, pv) => {
      acc.issues += pv.issueCount ?? 0;
      acc.epics += pv.epicCount ?? 0;
      acc.sprints += pv.sprintCount ?? 0;
      acc.attachments += pv.attachmentCount ?? 0;
      for (const person of pv.peopleFound ?? []) acc.people.add(person.accountId ?? person.displayName);
      return acc;
    },
    { issues: 0, epics: 0, sprints: 0, attachments: 0, people: new Set<string>() },
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Import {selected.length} projects</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each becomes a new SPIREX project with its epics, sprints, issues, comments &amp;
          attachments. You&apos;ll be added as lead on each.
        </p>
      </div>

      {/* Combined totals across all selected projects */}
      <div className="grid grid-cols-5 gap-2">
        <BulkStat icon={<BookOpen className="h-4 w-4" />} value={totals.issues} label="Issues" />
        <BulkStat icon={<Zap className="h-4 w-4" />} value={totals.epics} label="Epics" />
        <BulkStat icon={<ArrowRight className="h-4 w-4" />} value={totals.sprints} label="Sprints" />
        <BulkStat icon={<Paperclip className="h-4 w-4" />} value={totals.attachments} label="Files" />
        <BulkStat icon={<Users className="h-4 w-4" />} value={totals.people.size} label="People" />
      </div>
      {analyzing && (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analyzing projects… {settled} / {selected.length}
        </p>
      )}

      {matchCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {matchCount} of the selected project{matchCount !== 1 ? 's' : ''} match an existing SPIREX
            project name — importing will create duplicate names. This won&apos;t block the import.
          </span>
        </div>
      )}

      {/* Per-project breakdown — counts fill in as each analyze resolves. */}
      <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border bg-muted/30 p-2">
        {selected.map((p) => {
          const entry = previews[p.id];
          const pv = entry?.preview;
          return (
            <div key={p.id} className="flex items-center gap-3 rounded-md bg-background px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-[10px] font-bold text-primary">
                {p.key.slice(0, 3)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  {nameAlreadyInSpirex(p, existingNames) && <NameMatchBadge />}
                </div>
                {pv ? (
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{pv.issueCount} issues</span>
                    <span>· {pv.epicCount} epics</span>
                    <span>· {pv.sprintCount} sprints</span>
                    <span>· {pv.attachmentCount} files</span>
                    <span>· {pv.peopleFound.length} people</span>
                  </div>
                ) : entry?.status === 'error' ? (
                  <div className="text-[11px] text-amber-600">
                    Couldn&apos;t analyze — {p.key} will still be imported
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Analyzing…
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
        Projects are imported one at a time. If one fails the others still continue — you&apos;ll get
        a per-project summary. A project that fails midway may be partially imported and can be
        deleted afterwards.
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={importing} className="flex-1">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Button onClick={onImport} disabled={importing || analyzing} className="flex-1">
          {importing ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…</>
          ) : analyzing ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing…</>
          ) : (
            <>Start import ({selected.length}) <ArrowRight className="ml-2 h-4 w-4" /></>
          )}
        </Button>
      </div>
    </div>
  );
}

function BulkStatusIcon({ status }: { status: BulkStatus }) {
  if (status === 'ok') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  if (status === 'failed') return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />;
  if (status === 'importing') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
  return <Square className="h-4 w-4 shrink-0 text-muted-foreground/40" />;
}

function BulkImportingStep({
  results,
  index,
  progress,
}: {
  results: BulkResult[];
  index: number;
  progress: ImportProgressEvent | null;
}) {
  const total = results.length;
  const current = results[index]?.project;
  const phase = progress?.phase ?? 'setup';
  const percent = progress?.percent ?? 0;
  const label = PHASE_LABEL[phase] ?? 'Importing…';
  const noun = COUNTED_PHASES[phase];
  const showCount = noun != null && progress?.total != null && progress.total > 0;

  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Project {Math.min(index + 1, total)} of {total}
        </p>
        {current && <p className="font-semibold">{current.name}</p>}
        {/* What it's doing right now, and how far into this phase. */}
        <p className="text-sm text-primary">{label}</p>
        {showCount && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {progress?.current ?? 0} / {progress?.total} {noun}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
      </div>

      {/* Live per-project checklist */}
      <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border bg-muted/30 p-2">
        {results.map((r) => (
          <div key={r.project.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
            <BulkStatusIcon status={r.status} />
            <span className={cn('truncate', r.status === 'pending' && 'text-muted-foreground')}>
              {r.project.name}
            </span>
            {r.status === 'failed' && (
              <span className="ml-auto shrink-0 text-xs text-destructive">failed</span>
            )}
            {r.status === 'ok' && (
              <span className="ml-auto shrink-0 text-xs text-emerald-600">done</span>
            )}
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        This can take a few minutes — keep this tab open while we work.
      </p>
    </div>
  );
}

function BulkDoneStep({
  results,
  navigate,
}: {
  results: BulkResult[];
  navigate: (to: string) => void;
}) {
  const ok = results.filter((r) => r.status === 'ok');
  const failed = results.filter((r) => r.status === 'failed');
  const allOk = failed.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full',
            allOk ? 'bg-emerald-100 dark:bg-emerald-950/30' : 'bg-amber-100 dark:bg-amber-950/30',
          )}
        >
          {allOk ? (
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          )}
        </div>
        <div>
          <h2 className="text-xl font-semibold">
            Imported {ok.length} of {results.length} projects
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {allOk
              ? 'All selected projects were imported successfully.'
              : `${failed.length} project${failed.length !== 1 ? 's' : ''} could not be imported.`}
          </p>
        </div>
      </div>

      <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-lg border bg-muted/30 p-2">
        {ok.map((r) => (
          <button
            key={r.project.id}
            type="button"
            onClick={() => r.result?.projectId && navigate(`/projects/${r.result.projectId}`)}
            disabled={!r.result?.projectId}
            className="flex w-full items-center gap-2 rounded-md bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 disabled:cursor-default"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span className="truncate font-medium">{r.project.name}</span>
            {r.result?.projectKey && (
              <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
                {r.result.projectKey}
              </Badge>
            )}
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {r.result?.imported ?? 0} issue{(r.result?.imported ?? 0) !== 1 ? 's' : ''}
            </span>
          </button>
        ))}
        {failed.map((r) => (
          <div
            key={r.project.id}
            className="flex items-start gap-2 rounded-md bg-background px-3 py-2 text-sm"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{r.project.name}</div>
              <div className="text-xs text-destructive/90">{r.error ?? 'Import failed'}</div>
            </div>
          </div>
        ))}
      </div>

      {failed.length > 0 && (
        <p className="text-xs text-muted-foreground">
          A failed project may have been partially created — open{' '}
          <span className="font-medium">Projects</span> to review and delete any partial imports.
        </p>
      )}

      <div className="flex justify-center">
        <Button onClick={() => navigate('/projects')}>
          Go to projects <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function JiraImport() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const dispatch = useAppDispatch();
  const projects = useAppSelector((s) => s.projects.list);

  // Hard guard: external/client users cannot import from JIRA. The server
  // route is also gated by `requirePermission('import:create')` — this just
  // avoids rendering the form to anyone who hits the URL directly.
  if (!can('import:create')) return <Navigate to="/dashboard" replace />;

  const [state, setState] = useState<State>({
    step: 'connect',
    creds: { domain: '', email: '', apiToken: '' },
    jiraProjects: [],
    selectedJiraProjects: [],
    mode: 'project',
    targetProjectId: '',
    preview: null,
    result: null,
    savedConnection: null,
    progress: null,
    bulkIndex: 0,
    bulkResults: [],
    bulkPreviews: {},
  });

  const patch = (partial: Partial<State>) => setState((s) => ({ ...s, ...partial }));

  // Load any saved connection once on mount so the connect step can offer it.
  // A failure is non-fatal — we just fall back to the credential form.
  useEffect(() => {
    jiraApi
      .getConnection()
      .then((savedConnection) => patch({ savedConnection }))
      .catch(() => patch({ savedConnection: { connected: false } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Existing SPIREX projects power the name-match flag. Fetch once if the store
  // is empty (e.g. the user deep-linked straight to /jira/import).
  useEffect(() => {
    if (projects.length === 0) void dispatch(fetchProjectsThunk());
  }, [dispatch, projects.length]);

  // Case-insensitive, trimmed set of existing project names — the comparator for
  // the name-match flag. Rebuilt only when the project list changes.
  const existingNames = useMemo(
    () => new Set(projects.map((p) => p.name.trim().toLowerCase())),
    [projects],
  );

  // Selection helpers (multi-select). `selectedIds` is the fast membership set
  // the picker renders against.
  const selectedIds = useMemo(
    () => new Set(state.selectedJiraProjects.map((p) => p.id)),
    [state.selectedJiraProjects],
  );
  const toggleProject = (p: JiraProject) =>
    setState((s) => ({
      ...s,
      selectedJiraProjects: s.selectedJiraProjects.some((x) => x.id === p.id)
        ? s.selectedJiraProjects.filter((x) => x.id !== p.id)
        : [...s.selectedJiraProjects, p],
    }));
  const selectAll = (ps: JiraProject[]) =>
    setState((s) => {
      const map = new Map(s.selectedJiraProjects.map((x) => [x.id, x]));
      for (const p of ps) map.set(p.id, p);
      return { ...s, selectedJiraProjects: [...map.values()] };
    });
  const clearSelection = () => patch({ selectedJiraProjects: [] });

  // Creds to send downstream: the freshly-typed ones if a token is present,
  // otherwise null so the server replays the saved (encrypted) connection.
  const effectiveCreds = (s: State): JiraCreds | null => (s.creds.apiToken ? s.creds : null);

  // Analyze the selected projects for the bulk confirm screen — SEQUENTIALLY,
  // one JIRA `preview()` at a time, so we don't fire N issue-scans at once. Rows
  // fill in as each resolves; a failed analyze doesn't block the import.
  const loadBulkPreviews = async (selected: JiraProject[]) => {
    const creds = effectiveCreds(state);
    setState((s) => ({
      ...s,
      bulkPreviews: Object.fromEntries(selected.map((p) => [p.id, { status: 'loading' as const }])),
    }));
    for (const p of selected) {
      try {
        const preview = await jiraApi.preview(creds, p.key);
        setState((s) => ({
          ...s,
          bulkPreviews: { ...s.bulkPreviews, [p.id]: { status: 'ok', preview } },
        }));
      } catch {
        setState((s) => ({
          ...s,
          bulkPreviews: { ...s.bulkPreviews, [p.id]: { status: 'error' } },
        }));
      }
    }
  };

  // From the select step: one project → configure (issues-only vs full); more
  // than one → the bulk confirm, kicking off the sequential analyze.
  const proceedFromSelect = () => {
    if (state.selectedJiraProjects.length > 1) {
      patch({ step: 'preview' });
      void loadBulkPreviews(state.selectedJiraProjects);
    } else {
      patch({ step: 'configure' });
    }
  };

  const loadPreview = async (nextState: Partial<State> = {}) => {
    const s = { ...state, ...nextState };
    patch({ step: 'preview', preview: null, ...nextState });
    try {
      const preview = await jiraApi.preview(effectiveCreds(s), s.selectedJiraProjects[0]!.key);
      patch({ preview });
    } catch (err) {
      toast.error(extractError(err).message);
      patch({ step: 'configure' });
    }
  };

  const runImport = async () => {
    patch({ step: 'importing', progress: null, bulkResults: [] });
    // Stream progress into state as it arrives. Functional update so rapid
    // events don't clobber each other against a stale `state` closure.
    const onProgress = (p: ImportProgressEvent) => setState((s) => ({ ...s, progress: p }));
    const single = state.selectedJiraProjects[0]!;
    try {
      let result;
      if (state.mode === 'project') {
        result = await jiraApi.importFullProjectStream(
          effectiveCreds(state),
          single.key,
          single.name,
          onProgress,
        );
      } else {
        result = await jiraApi.importTicketsStream(
          effectiveCreds(state),
          single.key,
          state.targetProjectId,
          onProgress,
        );
      }
      patch({ step: 'done', result });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
      patch({ step: 'preview' });
    }
  };

  // Bulk import = the single full-project endpoint, called sequentially per
  // selected project. Continue-on-failure: one project failing doesn't stop the
  // rest; each outcome lands in `bulkResults` for the summary. No backend change.
  const runBulkImport = async () => {
    const selected = state.selectedJiraProjects;
    const creds = effectiveCreds(state);
    setState((s) => ({
      ...s,
      step: 'importing',
      progress: null,
      bulkIndex: 0,
      bulkResults: selected.map((project) => ({ project, status: 'pending' as BulkStatus })),
    }));

    for (let i = 0; i < selected.length; i++) {
      const jp = selected[i];
      setState((s) => ({
        ...s,
        bulkIndex: i,
        progress: null,
        bulkResults: s.bulkResults.map((r, ri) => (ri === i ? { ...r, status: 'importing' } : r)),
      }));
      try {
        const result = await jiraApi.importFullProjectStream(
          creds,
          jp.key,
          jp.name,
          (p) => setState((s) => ({ ...s, progress: p })),
        );
        setState((s) => ({
          ...s,
          bulkResults: s.bulkResults.map((r, ri) => (ri === i ? { ...r, status: 'ok', result } : r)),
        }));
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Import failed';
        setState((s) => ({
          ...s,
          bulkResults: s.bulkResults.map((r, ri) => (ri === i ? { ...r, status: 'failed', error } : r)),
        }));
      }
    }

    patch({ step: 'done' });
    // New projects were created — refresh the store so they appear on /projects.
    void dispatch(fetchProjectsThunk());
  };

  return (
    <div className="mx-auto max-w-lg animate-fade-in space-y-6 py-8 motion-reduce:animate-none">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Cloud className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Import from JIRA</h1>
        </div>
        <p className="pl-12 text-sm text-muted-foreground">
          Bring your JIRA Cloud data into SPIREX in minutes.
        </p>
      </div>

      {state.step !== 'done' && state.step !== 'importing' && (
        <StepIndicator current={state.step} />
      )}

      <Card>
        <CardContent className="pt-6">
          {/* Re-keyed by step so the content slides in on every step change,
              instead of the next step snapping into place. */}
          <div key={state.step} className="animate-slide-up motion-reduce:animate-none">
          {state.step === 'connect' && (
            <ConnectStep
              creds={state.creds}
              saved={state.savedConnection}
              onChange={(c) => patch({ creds: { ...state.creds, ...c } })}
              onNext={(jiraProjects) => patch({ step: 'select', jiraProjects })}
            />
          )}

          {state.step === 'select' && (
            <SelectProjectStep
              projects={state.jiraProjects}
              selectedIds={selectedIds}
              existingNames={existingNames}
              onToggle={toggleProject}
              onSelectAll={selectAll}
              onClear={clearSelection}
              onNext={proceedFromSelect}
              onBack={() => patch({ step: 'connect' })}
            />
          )}

          {state.step === 'configure' && (
            <ConfigureStep
              mode={state.mode}
              targetProjectId={state.targetProjectId}
              localProjects={projects.map((p) => ({ id: p.id, name: p.name, key: p.key }))}
              onMode={(m) => patch({ mode: m })}
              onTarget={(id) => patch({ targetProjectId: id })}
              onNext={() => void loadPreview()}
              onBack={() => patch({ step: 'select' })}
            />
          )}

          {state.step === 'preview' && (
            state.selectedJiraProjects.length > 1 ? (
              <BulkPreviewStep
                selected={state.selectedJiraProjects}
                existingNames={existingNames}
                previews={state.bulkPreviews}
                onImport={() => void runBulkImport()}
                onBack={() => patch({ step: 'select' })}
                importing={false}
              />
            ) : state.preview ? (
              <PreviewStep
                preview={state.preview}
                mode={state.mode}
                jiraProject={state.selectedJiraProjects[0]!}
                onImport={() => void runImport()}
                onBack={() => patch({ step: 'configure' })}
                importing={false}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">Analyzing JIRA project…</p>
              </div>
            )
          )}

          {state.step === 'importing' && (
            state.bulkResults.length > 0 ? (
              <BulkImportingStep
                results={state.bulkResults}
                index={state.bulkIndex}
                progress={state.progress}
              />
            ) : (
              <ImportingStep progress={state.progress} />
            )
          )}

          {state.step === 'done' && (
            state.bulkResults.length > 0 ? (
              <BulkDoneStep results={state.bulkResults} navigate={navigate} />
            ) : state.result ? (
              <DoneStep result={state.result} mode={state.mode} navigate={navigate} />
            ) : null
          )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
