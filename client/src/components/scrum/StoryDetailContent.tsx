// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, useBlocker, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  changeStoryStatusThunk,
  changeStoryStatusRowThunk,
  fetchStoryByKeyThunk,
  fetchStoryThunk,
  setSelectedStory,
  updateStoryThunk,
} from '@/store/storySlice';
import { fetchEpicsThunk } from '@/store/epicSlice';
import { fetchMembersThunk } from '@/store/projectSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { AcceptanceCriteriaChecklist } from './AcceptanceCriteriaChecklist';
import { cn } from '@/lib/utils';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { RichTextView } from '@/components/editor/RichTextView';
import { stringifyDescription, type TiptapDoc } from '@/utils/legacyDescription';
import {
  CHECKBOX_PREFIX,
  insertCheckboxNewline,
  withInitialCheckboxPrefix,
} from '@/utils/acceptanceCriteriaInput';
import { StoryTypeIcon } from './StoryTypeIcon';
import { StoryWatchToggle } from './StoryWatchToggle';
import { PriorityBadge } from './PriorityBadge';
import { LabelPicker } from './LabelPicker';
import { UserPicker } from './UserPicker';
import { CustomFieldInput } from './CustomFieldInput';
import { EnhanceStoryDialog } from './EnhanceStoryDialog';
import { useCustomFields } from '@/hooks/useCustomFields';
import { useAuth } from '@/hooks/useAuth';
import { storyApi, type EnhanceDraft } from '@/apis/storyApi';
import { extractError } from '@/config/httpClient';
import { TimeTrackingPanel } from './TimeTrackingPanel';
import { CommentsThread } from './CommentsThread';
import { ActivityFeed } from './ActivityFeed';
import { SubtaskList } from './SubtaskList';
import { LinkedIssues } from './LinkedIssues';
import { AttachmentGallery } from './AttachmentGallery';
import { ImageImportPreview } from '@/components/image-import/ImageImportPreview';
import { useCurrentProject } from '@/hooks/useCurrentProject';
import { useProjectStatuses } from '@/hooks/useProjectStatuses';
import { useSubtaskCompletionGuard } from '@/hooks/useSubtaskCompletionGuard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar } from '@/components/ui/avatar';
import { userLabel } from '@/lib/userLabel';
import { hexWithAlpha } from '@/lib/colorUtils';
import { X, Pencil, Check, ArrowLeft, ExternalLink, Mic, Sparkles, Loader2, Paperclip, Copy, History, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { type Priority, type StoryStatus, type StoryType } from '@/types/scrum';

/**
 * `drawer` — the right-side overlay panel mounted globally in AppLayout,
 * opened via the `?story=KEY` search param.
 * `page`   — the full-width, two-column route at /projects/:id/stories/:key.
 *
 * Both modes share every editor, draft and save handler below — only the
 * surrounding chrome and the section layout differ. Keeping one component
 * means a fix to the title/description/criteria editing logic lands in both.
 */
export type StoryDetailMode = 'drawer' | 'page';

// Drawer width is user-resizable (drag the left edge) and persisted per browser.
const DRAWER_WIDTH_KEY = 'spirex.storyDrawerWidth';
const DRAWER_MIN_WIDTH = 420;
const DRAWER_DEFAULT_WIDTH = 576; // matches the former `max-w-xl`

interface Props {
  storyKey: string;
  mode: StoryDetailMode;
}

export function StoryDetailContent({ storyKey, mode }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();

  // "Back" = return to wherever the user actually came from. Same-tab arrivals
  // (search, a notification, a report, the board, the backlog, the dashboard,
  // even a linked-issue chain) all carry real browser history, so we just pop
  // it — no per-origin wiring needed. A fresh deep link / "open in new tab" has
  // NO in-app history (history idx 0); only there do we need a fallback, taken
  // from an explicit origin hint in the URL (?from / ?fromLabel — these survive
  // a new tab, unlike router `state`), else the owning project's backlog.
  const hasHistory = (window.history.state?.idx ?? 0) > 0;
  const backState = (location.state ?? null) as { from?: string; fromLabel?: string } | null;
  const backLabel = hasHistory
    ? 'Back'
    : `Back to ${params.get('fromLabel') ?? backState?.fromLabel ?? 'backlog'}`;
  const goBack = () => {
    if (hasHistory) {
      navigate(-1);
      return;
    }
    const to =
      params.get('from') ??
      backState?.from ??
      (selected ? `/projects/${selected.projectId}/backlog` : '/dashboard');
    navigate(to);
  };

  // Live attachment count, lifted from the gallery so the header chip updates
  // the instant a file is uploaded/removed — without a story refetch or a panel
  // reopen. Falls back to the story payload's `_count` until the gallery reports;
  // reset on story switch so we never show the previous story's count.
  const [attachmentCount, setAttachmentCount] = useState<number | null>(null);
  // Activity is collapsed by default (and per story) — revealed on demand, so
  // the feed isn't even fetched until the user asks to see it.
  const [showActivity, setShowActivity] = useState(false);
  useEffect(() => {
    setAttachmentCount(null);
    setShowActivity(false);
  }, [storyKey]);

  const dispatch = useAppDispatch();
  const { selected, list } = useAppSelector((s) => s.stories);
  const epics = useAppSelector((s) =>
    selected ? s.epics.byProject[selected.projectId] ?? [] : [],
  );
  const members = useAppSelector((s) => s.projects.currentMembers);
  const { canInProject } = useCurrentProject();
  const { hasEntitlement } = useAuth();
  const { list: statusOptions, rows: workflowRows } = useProjectStatuses(selected?.projectId);
  const { requestComplete, guardDialog } = useSubtaskCompletionGuard();
  const { fields: customFieldDefs } = useCustomFields(selected?.projectId);
  const canUseAi = hasEntitlement('aiEnhance') && canInProject('story:edit');

  // AI enhancement: the endpoint returns a DRAFT; nothing is saved until the
  // user confirms in the EnhanceStoryDialog (or saves the AC editor).
  const [enhanceLoading, setEnhanceLoading] = useState(false);
  const [enhanceDraft, setEnhanceDraft] = useState<EnhanceDraft | null>(null);
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [acGenerating, setAcGenerating] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const [descriptionDoc, setDescriptionDoc] = useState<TiptapDoc | null>(null);
  const [editingAcceptanceCriteria, setEditingAcceptanceCriteria] = useState(false);
  const [acceptanceCriteriaDraft, setAcceptanceCriteriaDraft] = useState('');
  const acceptanceCriteriaRef = useRef<HTMLTextAreaElement | null>(null);
  // Read-view container for the description, so the copy button grabs exactly
  // the rendered text the user sees (rich content flattened to plain text).
  const descriptionViewRef = useRef<HTMLDivElement | null>(null);
  // Tracks the last story id so the draft-seeding effect can tell a real
  // story switch apart from an in-place update (every save mutates `selected`).
  const lastStoryIdRef = useRef<string | null>(null);
  // Set when the drawer close is requested mid-edit — drives the in-app
  // discard prompt (the page uses the navigation blocker below instead).
  const [drawerCloseRequested, setDrawerCloseRequested] = useState(false);
  // True while the drawer plays its slide-out before unmounting. The panel is a
  // conditional mount (StoryDetailPanel), so without this it would vanish with
  // no exit animation — we hold the actual URL change until the slide finishes.
  const [closing, setClosing] = useState(false);
  // Safety net: if the slide-out's `animationend` never fires (animations
  // disabled, tab backgrounded mid-transition), still drop the param so the
  // drawer can't get stuck open. Comfortably longer than the 200ms slide.
  const DRAWER_EXIT_FALLBACK_MS = 400;
  const exitFallbackRef = useRef<number | null>(null);

  // User-resizable drawer width (drawer mode only), seeded from localStorage.
  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DRAWER_DEFAULT_WIDTH;
    const saved = Number(window.localStorage.getItem(DRAWER_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= DRAWER_MIN_WIDTH ? saved : DRAWER_DEFAULT_WIDTH;
  });

  // True whenever an inline editor is open — the guard for discarding drafts
  // when the drawer closes or the page navigates away.
  const hasUnsavedEdits = editingTitle || editingDescription || editingAcceptanceCriteria;

  // Page mode: intercept in-app navigation (Back to backlog, linked issues,
  // browser Back) while edits are unsaved so we can show an in-app prompt.
  // In drawer mode the predicate is always false — the blocker stays inert.
  const blocker = useBlocker(mode === 'page' && hasUnsavedEdits);

  // Fetch the authoritative story ONCE per story key — only when the view
  // opens or switches story, NOT on every `list` mutation. A save replaces
  // the `list` array; depending on `list` here would re-trigger a full
  // (identical) refetch on every edit. fetchStoryByKeyThunk resolves any
  // story, including subtasks and deep-links the backlog/board list omit.
  useEffect(() => {
    if (!storyKey) {
      dispatch(setSelectedStory(null));
      return;
    }
    void dispatch(fetchStoryByKeyThunk(storyKey));
  }, [dispatch, storyKey]);

  // Seed `selected` from the already-loaded list for instant display while the
  // fetch above is in flight. useLayoutEffect (not useEffect) so the swap lands
  // BEFORE paint: switching between two cards already in the board/backlog list
  // shows the new story immediately, with no blank frame and — crucially — no
  // flash of the PREVIOUS story. Once `selected` is the right story this no-ops,
  // so a save (which mutates `list`) never re-seeds or refetches.
  useLayoutEffect(() => {
    if (!storyKey || selected?.key === storyKey) return;
    const fromList = list.find((s) => s.key === storyKey);
    if (fromList) dispatch(setSelectedStory(fromList));
  }, [dispatch, storyKey, list, selected?.key]);

  // Fetch the epic / member option lists for the selected story's project.
  useEffect(() => {
    if (!selected) return;
    if (epics.length === 0) void dispatch(fetchEpicsThunk(selected.projectId));
    if (members.length === 0) void dispatch(fetchMembersThunk(selected.projectId));
  }, [dispatch, selected, epics.length, members.length]);

  // Re-seed local drafts from the server story. A save runs updateStoryThunk,
  // which replaces `selected` and re-runs this effect — so a section the user
  // is actively editing must NOT be re-seeded, otherwise saving Description
  // would wipe an in-progress Acceptance criteria edit (and vice-versa).
  // Editor open/close flags only reset when switching to a different story.
  useEffect(() => {
    if (!selected) {
      lastStoryIdRef.current = null;
      return;
    }
    const switchedStory = lastStoryIdRef.current !== selected.id;
    lastStoryIdRef.current = selected.id;
    if (switchedStory) {
      setEditingTitle(false);
      setEditingDescription(false);
      setEditingAcceptanceCriteria(false);
    }
    if (switchedStory || !editingTitle) setDraftTitle(selected.title);
    if (switchedStory || !editingDescription) setDraftDescription(selected.description ?? '');
    if (switchedStory || !editingAcceptanceCriteria) {
      setAcceptanceCriteriaDraft(withInitialCheckboxPrefix(selected.acceptanceCriteria));
    }
  }, [selected, editingTitle, editingDescription, editingAcceptanceCriteria]);

  // Auto-grow the acceptance-criteria textarea: one line when empty, expanding
  // to fit its content as you type — mirrors the rich description editor (which
  // auto-grows natively; a plain <textarea> doesn't, so we drive it here).
  useEffect(() => {
    if (!editingAcceptanceCriteria) return;
    const el = acceptanceCriteriaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editingAcceptanceCriteria, acceptanceCriteriaDraft]);

  // Drop the `?story` param — this unmounts the panel. Idempotent, so it's safe
  // for both the `animationend` handler and the fallback timer to call it.
  const finalizeClose = () => {
    if (exitFallbackRef.current !== null) {
      window.clearTimeout(exitFallbackRef.current);
      exitFallbackRef.current = null;
    }
    const p = new URLSearchParams(params);
    p.delete('story');
    setParams(p, { replace: true });
  };

  const close = () => {
    // Play the slide-out, then drop the param once the slide *actually* ends
    // (driven by `onAnimationEnd` on the aside). A fixed timeout races the CSS
    // and unmounts a frame early, popping the panel off mid-slide.
    setClosing(true);
    exitFallbackRef.current = window.setTimeout(finalizeClose, DRAWER_EXIT_FALLBACK_MS);
  };

  // Clear the fallback timer if the component unmounts before it fires.
  useEffect(
    () => () => {
      if (exitFallbackRef.current !== null) window.clearTimeout(exitFallbackRef.current);
    },
    [],
  );

  // The aside always has an animation (slide-in on open, slide-out on close).
  // Only the slide-out, on the aside itself (not a bubbled child animation),
  // should finalize the close.
  const handleAsideAnimationEnd = (e: ReactAnimationEvent<HTMLElement>) => {
    if (!closing || e.target !== e.currentTarget) return;
    finalizeClose();
  };

  // Closing the drawer discards every open editor's draft, so route the
  // close through the in-app confirmation when something is mid-edit.
  const attemptClose = () => {
    if (hasUnsavedEdits) {
      setDrawerCloseRequested(true);
      return;
    }
    close();
  };

  const persistDrawerWidth = (w: number) => {
    try {
      window.localStorage.setItem(DRAWER_WIDTH_KEY, String(Math.round(w)));
    } catch {
      /* localStorage may be unavailable (private mode) — width just won't persist */
    }
  };

  // Drag the drawer's left edge: width = distance from the right viewport edge,
  // clamped between the min and 95vw. Listeners live on window so the drag keeps
  // tracking even if the pointer outruns the thin handle.
  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(
        window.innerWidth * 0.95,
        Math.max(DRAWER_MIN_WIDTH, window.innerWidth - ev.clientX),
      );
      setDrawerWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      setDrawerWidth((w) => {
        persistDrawerWidth(w);
        return w;
      });
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const resetDrawerWidth = () => {
    setDrawerWidth(DRAWER_DEFAULT_WIDTH);
    persistDrawerWidth(DRAWER_DEFAULT_WIDTH);
  };

  // The unsaved-changes prompt is shared by both triggers: the drawer close
  // (`drawerCloseRequested`) and the page's navigation blocker.
  const discardOpen = drawerCloseRequested || blocker.state === 'blocked';
  const confirmDiscard = () => {
    if (blocker.state === 'blocked') {
      blocker.proceed();
      return;
    }
    setDrawerCloseRequested(false);
    close();
  };
  const keepEditing = () => {
    if (blocker.state === 'blocked') blocker.reset();
    setDrawerCloseRequested(false);
  };

  // Until `selected` IS the requested story, don't render story content. Both
  // modes now guard on the key so neither flashes the previously-opened story
  // while the new one loads (the drawer used to skip this check and briefly
  // showed the prior ticket). The page shows a loading state; the drawer (an
  // overlay) renders nothing for the frame or two before the layout-effect seed
  // / fetch resolves.
  if (!selected || selected.key !== storyKey) {
    if (mode === 'page') {
      return (
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
          Loading story…
        </div>
      );
    }
    return null;
  }

  const save = async (patch: Parameters<typeof updateStoryThunk>[0]['input']) => {
    const r = await dispatch(updateStoryThunk({ id: selected.id, input: patch }));
    if (r.meta.requestStatus !== 'fulfilled') {
      toast.error((r.payload as string) ?? 'Update failed');
    }
  };

  const changeStatus = async (status: StoryStatus) => {
    const r = await dispatch(changeStoryStatusThunk({ id: selected.id, status }));
    if (r.meta.requestStatus !== 'fulfilled') {
      toast.error((r.payload as string) ?? 'Status change failed');
    }
  };

  // Change to a SPECIFIC workflow column (by row id) — the board/backlog path.
  // Needed because a project can have several columns sharing one coreStatus
  // (e.g. "In Progress" and "To be deployed to Prod"), which the core-status
  // thunk can't disambiguate.
  const changeStatusRow = async (statusRowId: string) => {
    const persist = async (cascadeSubtasks: boolean) => {
      const r = await dispatch(
        changeStoryStatusRowThunk({ id: selected.id, statusRowId, cascadeSubtasks }),
      );
      if (r.meta.requestStatus !== 'fulfilled') {
        toast.error((r.payload as string) ?? 'Status change failed');
      }
    };
    // Warn before completing a parent that still has open subtasks. `selected`
    // already carries the hydrated subtask list, so no extra fetch is needed.
    await requestComplete({
      storyId: selected.id,
      storyKey: selected.key,
      storyTitle: selected.title,
      targetIsDone: workflowRows.find((r) => r.id === statusRowId)?.coreStatus === 'done',
      subtasks: selected.subtasks,
      subtaskCount: selected._count?.subtasks,
      onProceed: persist,
    });
  };

  // Fetch the AI rewrite draft, then open the review dialog. Generation can
  // take a while (LLM round-trip) — the button shows a spinner meanwhile.
  const runEnhance = async () => {
    setEnhanceLoading(true);
    try {
      const draft = await storyApi.aiEnhance(selected.id);
      setEnhanceDraft(draft);
      setEnhanceOpen(true);
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setEnhanceLoading(false);
    }
  };

  // Auto-write acceptance criteria: the draft lands in the AC EDITOR (not the
  // story), so the existing Save/Cancel pair is the confirmation step.
  const runAutoWriteAc = async () => {
    setAcGenerating(true);
    try {
      const draftAc = await storyApi.aiAcceptanceCriteria(selected.id);
      setAcceptanceCriteriaDraft(draftAc);
      setEditingAcceptanceCriteria(true);
      toast.info('Draft generated — review it, then Save or Cancel');
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setAcGenerating(false);
    }
  };

  // Navigate to another story (parent breadcrumb, linked issues, subtasks).
  // The drawer re-points itself via `?story=`; the page routes to the other
  // story's own full page so the URL always reflects what you're looking at.
  const openStory = (key: string) => {
    if (mode === 'page') {
      navigate(`/projects/${selected.projectId}/stories/${key}`);
    } else {
      const p = new URLSearchParams(params);
      p.set('story', key);
      setParams(p);
    }
  };

  const titleClass = mode === 'page' ? 'text-2xl' : 'text-xl';

  // The current story's key — a link to the full page when shown in the
  // drawer (this is how the user reaches the page), plain text on the page.
  const currentKeyNode =
    mode === 'drawer' ? (
      <Link
        to={`/projects/${selected.projectId}/stories/${selected.key}`}
        className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
        title="Open full story page"
      >
        {selected.key}
        <ExternalLink className="h-3 w-3" aria-hidden />
      </Link>
    ) : (
      <span>{selected.key}</span>
    );

  // ── Identity row (type icon · key/breadcrumb · epic · watch · close) ──
  const identity = (
    <div className="flex items-center gap-3">
      <StoryTypeIcon type={selected.type} />
      {selected.parent ? (
        <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => openStory(selected.parent!.key)}
            className="hover:text-foreground hover:underline"
            aria-label={`Open parent story ${selected.parent.key}`}
            title={selected.parent.title}
          >
            {selected.parent.key}
          </button>
          <span aria-hidden="true">›</span>
          {currentKeyNode}
        </span>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">{currentKeyNode}</span>
      )}
      {selected.epic ? (
        <Badge
          variant="outline"
          className="font-medium"
          style={{ borderColor: selected.epic.color, color: selected.epic.color }}
        >
          {selected.epic.key} · {selected.epic.title}
        </Badge>
      ) : null}
      {selected.source === 'voice-agent' ? (
        <Badge variant="secondary" className="gap-1" title="Created with the voice agent">
          <Mic className="h-3 w-3" aria-hidden />
          Voice
        </Badge>
      ) : null}
      {(() => {
        const count = attachmentCount ?? selected._count?.attachments ?? 0;
        return count > 0 ? (
          <span
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground"
            title={`${count} attachment${count === 1 ? '' : 's'}`}
          >
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            {count}
          </span>
        ) : null;
      })()}
      <div className="ml-auto flex items-center gap-1">
        {canUseAi ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={runEnhance}
            disabled={enhanceLoading}
            className="gap-1.5 text-xs"
            title="Enhance this issue with AI (you review before anything is saved)"
            aria-label="Enhance with AI"
          >
            {enhanceLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            )}
            {enhanceLoading ? 'Enhancing…' : 'Enhance'}
          </Button>
        ) : null}
        <StoryWatchToggle story={selected} />
        {mode === 'drawer' ? (
          <Button variant="ghost" size="icon" onClick={attemptClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );

  // ── Title ────────────────────────────────────────────────────────────
  // Enter commits, Escape cancels. Empty/whitespace-only titles are ignored
  // (Enter is a no-op) so a stray keystroke can't blank the story name.
  const commitTitle = async () => {
    const next = draftTitle.trim();
    if (!next) return;
    await save({ title: next });
    setEditingTitle(false);
  };
  const cancelTitle = () => {
    setDraftTitle(selected.title);
    setEditingTitle(false);
  };
  const titleBlock = editingTitle ? (
    <div className="flex items-center gap-2">
      <Input
        value={draftTitle}
        onChange={(e) => setDraftTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void commitTitle();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelTitle();
          }
        }}
        autoFocus
        className={`font-semibold ${titleClass}`}
        aria-label="Edit story title"
      />
      <Button
        size="icon"
        variant="ghost"
        aria-label="Save title"
        onClick={() => void commitTitle()}
      >
        <Check className="h-4 w-4" />
      </Button>
    </div>
  ) : (
    <button
      type="button"
      className="group flex w-full items-start gap-2 text-left"
      onClick={() => setEditingTitle(true)}
      aria-label="Edit title"
    >
      <h2 id="story-panel-title" className={`flex-1 font-semibold leading-tight ${titleClass}`}>
        {selected.title}
      </h2>
      <Pencil className="mt-1.5 h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );

  // Status field — drive off the RAW workflow rows (by id) so columns sharing a
  // coreStatus (e.g. "In Progress" vs "To be deployed to Prod") stay distinct and
  // the panel shows the story's ACTUAL column, not a last-wins collapse. The
  // legacy core-status select is used only while the rows are still loading.
  const statusUsesRows = workflowRows.length > 0;
  const currentStatusRowId =
    selected.statusId && workflowRows.some((r) => r.id === selected.statusId)
      ? selected.statusId
      : workflowRows.find((r) => r.coreStatus === selected.status)?.id ?? '';
  // The current status's board color tints the trigger itself — a colored border
  // + a light inner shade — so the selected status reads at a glance without a
  // separate badge.
  const currentStatusColor =
    (statusUsesRows
      ? workflowRows.find((r) => r.id === currentStatusRowId)?.color
      : statusOptions.find((s) => s.coreStatus === selected.status)?.color) ?? null;
  const statusTriggerStyle = currentStatusColor
    ? {
        borderColor: hexWithAlpha(currentStatusColor, 0.9),
        backgroundColor: hexWithAlpha(currentStatusColor, 0.18),
      }
    : undefined;

  // ── Fields (status / priority / type / points / epic / assignee / reporter) ──
  const fieldsBlock = (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm [&>div]:min-w-0">
      <div className="text-muted-foreground">Status</div>
      <div>
        {statusUsesRows ? (
          <Select value={currentStatusRowId} onValueChange={(v) => changeStatusRow(v)}>
            <SelectTrigger className="h-8 w-auto min-w-[120px] max-w-full" style={statusTriggerStyle}>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {/* One item per workflow column (by id), so columns sharing a
                  coreStatus stay distinct — each tagged with its board color. */}
              {workflowRows.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex items-center gap-2">
                    <StatusDot color={r.color} />
                    {r.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select value={selected.status} onValueChange={(v) => changeStatus(v as StoryStatus)}>
            <SelectTrigger className="h-8 w-auto min-w-[120px] max-w-full" style={statusTriggerStyle}>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {/* Load-time fallback before workflow rows arrive. */}
              {statusOptions.map((s) => (
                <SelectItem key={s.coreStatus} value={s.coreStatus}>
                  <span className="flex items-center gap-2">
                    <StatusDot color={s.color} />
                    {s.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="text-muted-foreground">Priority</div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selected.priority} onValueChange={(v) => save({ priority: v as Priority })}>
            <SelectTrigger className="h-8 w-auto min-w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <PriorityBadge priority={selected.priority} />
        </div>
      </div>

      <div className="text-muted-foreground">Type</div>
      <div>
        <Select value={selected.type} onValueChange={(v) => save({ type: v as StoryType })}>
          <SelectTrigger className="h-8 w-auto min-w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="story">
              <span className="flex items-center gap-2">
                <StoryTypeIcon type="story" />
                Story
              </span>
            </SelectItem>
            <SelectItem value="bug">
              <span className="flex items-center gap-2">
                <StoryTypeIcon type="bug" />
                Bug
              </span>
            </SelectItem>
            <SelectItem value="task">
              <span className="flex items-center gap-2">
                <StoryTypeIcon type="task" />
                Task
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-muted-foreground">Story points</div>
      <div>
        <Input
          aria-label="Story points"
          type="number"
          min={0}
          max={100}
          // Uncontrolled input: key on story + value so switching stories (panel
          // stays mounted) re-seeds it — without this it keeps the previous
          // story's points. Mirrors the start/due date inputs below.
          key={`points-${selected.id}-${selected.storyPoints ?? ''}`}
          defaultValue={selected.storyPoints ?? ''}
          onBlur={(e) =>
            save({ storyPoints: e.target.value === '' ? null : Number(e.target.value) })
          }
          className="h-8 w-24"
        />
      </div>

      <div className="text-muted-foreground">Epic</div>
      <div>
        <Select
          value={selected.epicId ?? '__none__'}
          onValueChange={(v) => save({ epicId: v === '__none__' ? null : v })}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">(no epic)</SelectItem>
            {epics.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                <span className="flex items-center gap-2">
                  <StatusDot color={e.color} />
                  {e.key} · {e.title}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="text-muted-foreground">Labels</div>
      <div>
        <LabelPicker
          story={selected}
          projectId={selected.projectId}
          canEdit={canInProject('story:edit')}
        />
      </div>

      <div className="text-muted-foreground">Assignee</div>
      <div>
        <UserPicker
          value={selected.assigneeId}
          onChange={(id) => save({ assigneeId: id })}
          allowUnassign
          options={members.map((m) => ({ id: m.userId, name: m.user.name, email: m.user.email }))}
          // Imported (unlinked) assignee — not a project member, so surface it
          // explicitly or the picker couldn't resolve the current value.
          extraOption={
            selected.assignee?.isExternal &&
            selected.assigneeId &&
            !members.some((m) => m.userId === selected.assigneeId)
              ? {
                  id: selected.assigneeId,
                  name: selected.assignee.name,
                  email: selected.assignee.email,
                  label: userLabel(selected.assignee),
                }
              : null
          }
        />
      </div>

      <div className="text-muted-foreground">Reporter</div>
      <div>
        {canInProject('story:edit') ? (
          <UserPicker
            value={selected.reporterId}
            onChange={(id) => {
              // Reporter is required — ignore the (never-emitted) null case.
              if (id) save({ reporterId: id });
            }}
            options={members.map((m) => ({ id: m.userId, name: m.user.name, email: m.user.email }))}
            extraOption={
              selected.reporter?.isExternal &&
              !members.some((m) => m.userId === selected.reporterId)
                ? {
                    id: selected.reporterId,
                    name: selected.reporter.name,
                    email: selected.reporter.email,
                    label: userLabel(selected.reporter),
                  }
                : null
            }
          />
        ) : (
          <span className="flex items-center gap-2">
            <Avatar name={selected.reporter?.name ?? null} />
            <span>{userLabel(selected.reporter, '—')}</span>
          </span>
        )}
      </div>

      <div className="text-muted-foreground">Start date</div>
      <div>
        <Input
          aria-label="Start date"
          type="date"
          // Key on story + value so switching stories (panel stays mounted)
          // re-seeds the uncontrolled input.
          key={`start-${selected.id}-${selected.startDate ?? ''}`}
          defaultValue={selected.startDate ? selected.startDate.slice(0, 10) : ''}
          max={selected.dueDate ? selected.dueDate.slice(0, 10) : undefined}
          onBlur={(e) => {
            const next = e.target.value || null;
            if (next !== (selected.startDate ? selected.startDate.slice(0, 10) : null)) {
              void save({ startDate: next });
            }
          }}
          className="h-8 w-full max-w-[10rem]"
        />
      </div>

      <div className="text-muted-foreground">Due date</div>
      <div>
        <Input
          aria-label="Due date"
          type="date"
          key={`due-${selected.id}-${selected.dueDate ?? ''}`}
          defaultValue={selected.dueDate ? selected.dueDate.slice(0, 10) : ''}
          min={selected.startDate ? selected.startDate.slice(0, 10) : undefined}
          onBlur={(e) => {
            const next = e.target.value || null;
            if (next !== (selected.dueDate ? selected.dueDate.slice(0, 10) : null)) {
              void save({ dueDate: next });
            }
          }}
          className="h-8 w-full max-w-[10rem]"
        />
      </div>

      {customFieldDefs.map((def) => {
        const stored = selected.customFieldValues?.find((v) => v.fieldId === def.id);
        return (
          <div key={def.id} className="contents">
            <div className="truncate text-muted-foreground" title={def.name}>
              {def.name}
              {def.isRequired ? <span className="text-destructive"> *</span> : null}
            </div>
            <div>
              <CustomFieldInput
                field={def}
                value={stored?.value ?? null}
                onCommit={(v) => save({ customFields: { [def.id]: v } })}
                disabled={!canInProject('story:edit')}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  // Copy the description's rendered text (rich content flattened to plain text)
  // to the clipboard — small affordance next to the heading.
  const copyDescription = async () => {
    const text = descriptionViewRef.current?.innerText?.trim() ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Description copied');
    } catch {
      toast.error('Could not copy description');
    }
  };

  // ── Description ──────────────────────────────────────────────────────
  const descriptionBlock = (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Description</h3>
        {editingDescription ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraftDescription(selected.description ?? '');
                setDescriptionDoc(null);
                setEditingDescription(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                const next =
                  descriptionDoc != null
                    ? stringifyDescription(descriptionDoc)
                    : draftDescription || null;
                await save({ description: next });
                setEditingDescription(false);
                setDescriptionDoc(null);
              }}
            >
              Save
            </Button>
          </div>
        ) : selected.description ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={copyDescription}
            title="Copy description"
            aria-label="Copy description"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </Button>
        ) : null}
      </div>
      {editingDescription ? (
        <div
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setDraftDescription(selected.description ?? '');
              setDescriptionDoc(null);
              setEditingDescription(false);
            }
          }}
        >
          <RichTextEditor
            value={selected.description}
            onChange={(doc) => setDescriptionDoc(doc)}
            projectId={selected.projectId}
            storyId={selected.id}
            ariaLabel="Story description"
            // Start at one line and grow with the typed text (TipTap auto-grows;
            // this just lowers the floor from a fixed 160px box).
            minHeight="1.5rem"
            autoFocus
          />
        </div>
      ) : (
        <div
          ref={descriptionViewRef}
          role="button"
          tabIndex={0}
          aria-label="Edit description"
          onClick={() => {
            // Don't hijack a text selection: if the user just highlighted text
            // (to copy it), leave the read view up so the selection survives.
            // A plain click collapses any selection, so this opens the editor.
            if (window.getSelection()?.toString()) return;
            setEditingDescription(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setEditingDescription(true);
            }
          }}
          // No fixed floor: empty shows the one-line "No description yet."; with
          // content the box grows to fit it.
          className="flex w-full cursor-text flex-col rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-input hover:bg-muted/40 focus-visible:border-input focus-visible:bg-muted/40 focus-visible:outline-none"
        >
          <RichTextView value={selected.description} />
        </div>
      )}
    </section>
  );

  // ── Acceptance criteria ──────────────────────────────────────────────
  const acBlock = (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Acceptance criteria</h3>
        {!editingAcceptanceCriteria && canUseAi ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={runAutoWriteAc}
            disabled={acGenerating}
            className="gap-1.5 text-xs"
            title="Draft acceptance criteria with AI — opens in the editor for review"
          >
            {acGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            )}
            {acGenerating ? 'Writing…' : 'Auto-write'}
          </Button>
        ) : null}
        {editingAcceptanceCriteria ? (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAcceptanceCriteriaDraft(
                  withInitialCheckboxPrefix(selected.acceptanceCriteria),
                );
                setEditingAcceptanceCriteria(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                const trimmed =
                  acceptanceCriteriaDraft.trim() === CHECKBOX_PREFIX.trim()
                    ? ''
                    : acceptanceCriteriaDraft;
                await save({ acceptanceCriteria: trimmed || null });
                setEditingAcceptanceCriteria(false);
              }}
            >
              Save
            </Button>
          </div>
        ) : null}
      </div>
      {editingAcceptanceCriteria ? (
        <textarea
          id="story-ac"
          ref={acceptanceCriteriaRef}
          autoFocus
          value={acceptanceCriteriaDraft}
          onChange={(e) => setAcceptanceCriteriaDraft(e.target.value)}
          onFocus={(e) => {
            if (e.target.value.length === 0) {
              setAcceptanceCriteriaDraft(CHECKBOX_PREFIX);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setAcceptanceCriteriaDraft(
                withInitialCheckboxPrefix(selected.acceptanceCriteria),
              );
              setEditingAcceptanceCriteria(false);
              return;
            }
            if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) {
              return;
            }
            e.preventDefault();
            const target = e.currentTarget;
            const { value: next, caret } = insertCheckboxNewline(
              target.value,
              target.selectionStart,
              target.selectionEnd,
            );
            setAcceptanceCriteriaDraft(next);
            requestAnimationFrame(() => {
              const node = acceptanceCriteriaRef.current;
              if (node) {
                node.setSelectionRange(caret, caret);
              }
            });
          }}
          rows={1}
          className="flex min-h-[2.25rem] w-full resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="- [ ] Given … when … then …"
        />
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="Edit acceptance criteria"
          onClick={() => {
            // Same as the description: a highlighted selection means the user is
            // copying, so don't flip into edit and destroy it. A plain click
            // (no selection) opens the editor.
            if (window.getSelection()?.toString()) return;
            setEditingAcceptanceCriteria(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setEditingAcceptanceCriteria(true);
            }
          }}
          // One-line floor when empty; grows to fit the checklist as items are
          // added — mirrors the description box.
          className="flex min-h-[2.25rem] w-full cursor-text flex-col rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-input hover:bg-muted/40 focus-visible:border-input focus-visible:bg-muted/40 focus-visible:outline-none"
        >
          <AcceptanceCriteriaChecklist
            value={selected.acceptanceCriteria}
            onChange={(next) => void save({ acceptanceCriteria: next })}
          />
        </div>
      )}
    </section>
  );

  const timeTrackingBlock = (
    // key by story id so switching stories in-place (linked issue / subtask /
    // parent breadcrumb, drawer staying mounted) remounts the panel with fresh
    // worklog state instead of showing the previous story's cached entries.
    <TimeTrackingPanel
      key={selected.id}
      story={selected}
      onEstimateChange={(minutes) => {
        void save({ originalEstimateMinutes: minutes });
      }}
    />
  );

  const imageImportBlock = selected.sourceImageImportId ? (
    <ImageImportPreview imageImportId={selected.sourceImageImportId} />
  ) : null;

  const attachmentsBlock = (
    <AttachmentGallery
      storyId={selected.id}
      projectId={selected.projectId}
      canUpload={canInProject('attachment:upload')}
      onCountChange={setAttachmentCount}
    />
  );

  // Parent link — shown only when this story IS a subtask. A clear, clickable
  // card back to the parent; the identity-row breadcrumb is easy to miss.
  const parentBlock = selected.parent ? (
    <button
      type="button"
      onClick={() => openStory(selected.parent!.key)}
      title={`Open parent story ${selected.parent.key}`}
      className="flex w-full items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/60"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Parent
      </span>
      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
        {selected.parent.key}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{selected.parent.title}</span>
    </button>
  ) : null;

  // Subtasks — hidden when this story is itself a subtask (depth 1).
  const subtasksBlock = !selected.parentStoryId ? (
    <SubtaskList
      parent={selected}
      subtasks={selected.subtasks ?? []}
      canCreate={canInProject('story:create')}
      canEdit={canInProject('story:edit') || canInProject('story:status')}
      canDelete={canInProject('story:delete')}
      onChanged={() => void dispatch(fetchStoryThunk(selected.id))}
    />
  ) : null;

  const linkedBlock = (
    <LinkedIssues
      story={selected}
      canEdit={canInProject('story:edit')}
      onOpenStory={(key) => openStory(key)}
    />
  );

  const commentsBlock = <CommentsThread storyId={selected.id} projectId={selected.projectId} />;
  const activityBlock = (
    <section>
      <button
        type="button"
        onClick={() => setShowActivity((v) => !v)}
        aria-expanded={showActivity}
        className="flex items-center gap-2 text-sm font-semibold text-foreground transition-colors hover:text-primary"
      >
        <History className="h-4 w-4" aria-hidden />
        {showActivity ? 'Activity' : 'View activity'}
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            showActivity && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {showActivity ? (
        <div className="mt-3">
          <ActivityFeed storyId={selected.id} hideHeader />
        </div>
      ) : null}
    </section>
  );

  // AI enhancement review — applying routes through the same save() as any
  // manual edit, so activity log + notifications behave identically.
  const enhanceDialog = (
    <EnhanceStoryDialog
      story={selected}
      draft={enhanceDraft}
      open={enhanceOpen}
      onOpenChange={(o) => {
        setEnhanceOpen(o);
        if (!o) setEnhanceDraft(null);
      }}
      onApply={async (patch) => {
        await save(patch);
        toast.success('AI enhancement applied');
      }}
    />
  );

  // In-app unsaved-changes prompt — replaces the browser `confirm` box and
  // also fronts the page's navigation blocker. Dismissing it (Esc / overlay /
  // corner X) counts as "keep editing".
  const discardDialog = (
    <Dialog
      open={discardOpen}
      onOpenChange={(open) => {
        if (!open) keepEditing();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription>
            This issue has edits that haven’t been saved yet. Leaving now will discard them.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={keepEditing}>
            Keep editing
          </Button>
          <Button variant="destructive" onClick={confirmDiscard}>
            Discard changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ── Drawer layout — right-side overlay, single stacked column ─────────
  if (mode === 'drawer') {
    return (
      <>
        <button
          type="button"
          aria-label="Close story"
          className={`fixed inset-0 z-40 bg-black/30 ${
            closing
              ? 'animate-out fade-out-0 fill-mode-forwards duration-200'
              : 'animate-in fade-in-0 duration-300'
          }`}
          onClick={attemptClose}
        />
        <aside
          className={`fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-xl ${
            closing
              ? 'animate-out slide-out-to-right fill-mode-forwards duration-200 ease-in'
              : 'animate-in slide-in-from-right duration-300 ease-out'
          }`}
          style={{ width: drawerWidth, maxWidth: '95vw' }}
          role="dialog"
          aria-labelledby="story-panel-title"
          onAnimationEnd={handleAsideAnimationEnd}
        >
          {/* Resize handle — drag the left edge to widen/narrow; double-click to
              reset. Width persists across stories and sessions. */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize story panel"
            title="Drag to resize · double-click to reset"
            onPointerDown={startResize}
            onDoubleClick={resetDrawerWidth}
            className="group absolute left-0 top-0 z-10 flex h-full w-2 -translate-x-1/2 cursor-col-resize touch-none items-stretch justify-center"
          >
            <span className="w-0.5 bg-transparent transition-colors group-hover:bg-primary/40" />
          </div>
          <header className="border-b px-5 py-3">{identity}</header>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {titleBlock}
            {parentBlock ? <div className="mt-4">{parentBlock}</div> : null}
            <div className="mt-5">{fieldsBlock}</div>
            <Separator className="my-5" />
            {descriptionBlock}
            <Separator className="my-5" />
            {acBlock}
            <Separator className="my-5" />
            {attachmentsBlock}
            <Separator className="my-5" />
            {imageImportBlock ? (
              <>
                {imageImportBlock}
                <Separator className="my-5" />
              </>
            ) : null}
            {timeTrackingBlock}
            <Separator className="my-5" />
            {linkedBlock}
            <Separator className="my-5" />
            {subtasksBlock ? (
              <>
                {subtasksBlock}
                <Separator className="my-5" />
              </>
            ) : null}
            {commentsBlock}
            <Separator className="my-5" />
            {activityBlock}
          </div>
        </aside>
        {discardDialog}
        {enhanceDialog}
        {guardDialog}
      </>
    );
  }

  // ── Page layout — full-width route, two columns (main + metadata) ─────
  return (
    <div className="mx-auto max-w-6xl pb-12">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {backLabel}
      </button>

      {/* Solid card surface. Without it the story content sits straight on the
          app's dotted-grid body background and reads as "transparent". The
          drawer mode gets this for free via its `bg-background` aside; the page
          needs the panel explicitly. */}
      <article className="mt-3 overflow-hidden rounded-xl border bg-card shadow-sm">
        <header className="border-b bg-muted/30 px-5 py-4 sm:px-7">{identity}</header>
        <div className="px-5 py-6 sm:px-7">
          <div>{titleBlock}</div>
          {parentBlock ? <div className="mt-4">{parentBlock}</div> : null}

          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* Main column */}
            <div className="min-w-0 space-y-6">
              {descriptionBlock}
              <Separator />
              {acBlock}
              {imageImportBlock ? (
                <>
                  <Separator />
                  {imageImportBlock}
                </>
              ) : null}
              <Separator />
              {attachmentsBlock}
              <Separator />
              {linkedBlock}
              {subtasksBlock ? (
                <>
                  <Separator />
                  {subtasksBlock}
                </>
              ) : null}
              <Separator />
              {commentsBlock}
              <Separator />
              {activityBlock}
            </div>

            {/* Metadata sidebar — sticky so fields stay in view while scrolling.
                Nested inside the bg-card article, so these panels use bg-muted
                for separation (bg-card on bg-card would be invisible). */}
            <aside className="space-y-4 lg:sticky lg:top-2 lg:self-start">
              <div className="rounded-lg border bg-muted/40 p-4">
                <h3 className="mb-3 text-sm font-semibold">Details</h3>
                {fieldsBlock}
              </div>
              <div className="rounded-lg border bg-muted/40 p-4">{timeTrackingBlock}</div>
            </aside>
          </div>
        </div>
      </article>
      {discardDialog}
      {enhanceDialog}
      {guardDialog}
    </div>
  );
}

/** A small board-colored dot for each status row in the dropdown list, so the
 *  options stay scannable by color while the trigger itself carries the tint. */
function StatusDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}
