// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { commentApi } from '@/apis/commentApi';
import { projectApi } from '@/apis/projectApi';
import { storyApi } from '@/apis/storyApi';
import { extractError } from '@/config/httpClient';
import type { MentionItem } from '@/components/editor/MentionList';
import type { TicketItem } from '@/components/editor/TicketMentionList';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { RichTextEditor, type RichTextEditorHandle } from '@/components/editor/RichTextEditor';
import { RichTextView } from '@/components/editor/RichTextView';
import { stringifyDescription, type TiptapDoc } from '@/utils/legacyDescription';
import { userLabel } from '@/lib/userLabel';
import { MessageCircle, Pencil, Trash2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import type { Comment } from '@/types/scrum';

interface Props {
  storyId: string;
  projectId: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function CommentsThread({ storyId, projectId }: Props) {
  const { user, activeOrg } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft,    setDraft]    = useState('');
  const [draftDoc, setDraftDoc] = useState<TiptapDoc | null>(null);
  const [posting,  setPosting]  = useState(false);
  const [focused,  setFocused]  = useState(false);

  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editDraft,  setEditDraft]  = useState('');
  const [editDoc,    setEditDoc]    = useState<TiptapDoc | null>(null);
  const [resetKey,   setResetKey]   = useState(0);
  const [members,    setMembers]    = useState<MentionItem[]>([]);
  const [tickets,    setTickets]    = useState<TicketItem[]>([]);

  const composeRef = useRef<HTMLDivElement>(null);
  const composeEditorRef = useRef<RichTextEditorHandle>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await projectApi.listMembers(projectId);
        if (cancelled) return;
        setMembers(
          list.map((m) => ({
            id: m.user.id,
            label: m.user.name,
            email: m.user.email,
          })),
        );
      } catch {
        // Silent — comments still work without mention suggestions.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const mentionItems = useMemo(() => members, [members]);

  // Project stories for `#` ticket tags — project-scoped by construction. The
  // story being commented on is excluded (tagging a ticket in itself is noise).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await storyApi.list({ projectId });
        if (cancelled) return;
        setTickets(
          list
            .filter((s) => s.id !== storyId)
            .map((s) => ({ id: s.id, key: s.key, title: s.title, projectId })),
        );
      } catch {
        // Silent — comments still work without ticket suggestions.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, storyId]);

  const ticketItems = useMemo(() => tickets, [tickets]);

  const refresh = async () => {
    try {
      setComments(await commentApi.listByStory(storyId));
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await commentApi.listByStory(storyId);
        if (!cancelled) setComments(rows);
      } catch (err) {
        if (!cancelled) toast.error(extractError(err).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  // ── Deep-link to a specific comment ───────────────────────────────────────
  // Email / notification links carry `?comment=<id>` (see the server's
  // notificationService). Once that comment has loaded, scroll it into view and
  // briefly highlight it. A ref guards it to ONE run per target so a later
  // refresh (e.g. after posting) doesn't yank the view back.
  const [searchParams] = useSearchParams();
  const targetCommentId = searchParams.get('comment');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const handledTargetRef = useRef<string | null>(null);

  useEffect(() => {
    if (!targetCommentId || comments.length === 0) return;
    if (handledTargetRef.current === targetCommentId) return;
    if (!comments.some((c) => c.id === targetCommentId)) return; // not on this story
    handledTargetRef.current = targetCommentId;
    const scroll = setTimeout(() => {
      document
        .getElementById(`comment-${targetCommentId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightId(targetCommentId);
    }, 120);
    const fade = setTimeout(() => setHighlightId(null), 2800);
    return () => {
      clearTimeout(scroll);
      clearTimeout(fade);
    };
  }, [targetCommentId, comments]);

  const onPost = async () => {
    const payload = draftDoc != null ? stringifyDescription(draftDoc) : draft.trim() || null;
    if (!payload) return;
    setPosting(true);
    try {
      await commentApi.create({ storyId, body: payload });
      setDraft('');
      setDraftDoc(null);
      setFocused(false);
      setResetKey((k) => k + 1);
      await refresh();
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setPosting(false);
    }
  };

  const onSaveEdit = async (id: string) => {
    const payload = editDoc != null ? stringifyDescription(editDoc) : editDraft.trim() || null;
    if (!payload) { toast.error('Comment body required'); return; }
    try {
      await commentApi.update(id, payload);
      setEditingId(null);
      setEditDoc(null);
      await refresh();
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await commentApi.remove(id);
      toast.success('Comment deleted');
      await refresh();
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  const hasContent =
    (draftDoc != null && stringifyDescription(draftDoc) != null) ||
    (draftDoc == null && draft.trim().length > 0);

  return (
    <section className="flex flex-col gap-4">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5">
        <MessageCircle className="h-4 w-4 text-primary/70" />
        <h3 className="text-sm font-semibold">Comments</h3>
        {comments.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-bold text-muted-foreground tabular-nums">
            {comments.length}
          </span>
        )}
      </div>

      {/* ── Thread list ─────────────────────────────────────────────────── */}
      {comments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-8 text-center">
          <MessageCircle className="h-7 w-7 text-muted-foreground/25" />
          <p className="text-xs text-muted-foreground/55">
            No comments yet — be the first to add one below.
          </p>
        </div>
      ) : (
        <ul className="max-h-[22rem] space-y-0.5 overflow-y-auto">
          {comments.map((c) => {
            const canEdit   = user?.id === c.authorId;
            const canDelete = canEdit || activeOrg?.role === 'admin';
            const isEditing = editingId === c.id;

            return (
              <li
                key={c.id}
                id={`comment-${c.id}`}
                className={cn(
                  'group relative flex items-start gap-3 rounded-xl px-3 py-3 transition-colors duration-500',
                  highlightId === c.id
                    ? 'bg-primary/10 ring-2 ring-primary/35'
                    : 'hover:bg-muted/40',
                )}
              >
                <Avatar name={c.author?.name ?? null} size="md" className="mt-0.5 shrink-0" />

                <div className="min-w-0 flex-1">
                  {/* Meta row */}
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-[13px] font-semibold leading-none text-foreground">
                      {userLabel(c.author, 'Unknown')}
                    </span>
                    <span className="text-[11px] text-muted-foreground/60">
                      {timeAgo(c.createdAt)}
                    </span>
                    {c.updatedAt !== c.createdAt && (
                      <span className="rounded bg-muted px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                        edited
                      </span>
                    )}
                  </div>

                  {/* Body / edit form */}
                  {isEditing ? (
                    <div className="rounded-xl border bg-card focus-within:ring-2 focus-within:ring-primary/25 focus-within:border-primary/30 transition-all">
                      <RichTextEditor
                        value={editDraft}
                        onChange={(doc) => setEditDoc(doc)}
                        projectId={projectId}
                        storyId={storyId}
                        ariaLabel="Edit comment body"
                        minHeight="80px"
                        mentionItems={mentionItems}
                        ticketItems={ticketItems}
                      />
                      <div className="flex justify-end gap-2 border-t px-3 py-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => { setEditingId(null); setEditDoc(null); }}
                        >
                          Cancel
                        </Button>
                        <Button size="sm" className="h-7 text-xs" onClick={() => onSaveEdit(c.id)}>
                          Save changes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed text-foreground/90">
                      <RichTextView value={c.body} emptyLabel="" />
                    </div>
                  )}
                </div>

                {/* Action buttons — appear on hover */}
                {!isEditing && (canEdit || canDelete) && (
                  <div className="absolute right-3 top-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {canEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit comment"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditDraft(c.body);
                          setEditDoc(null);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete comment"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => onDelete(c.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Compose ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <Avatar name={user?.name ?? null} size="md" className="mt-2 shrink-0" />

        {/* Unified compose card */}
        <div
          ref={composeRef}
          className={cn(
            'min-w-0 flex-1 overflow-hidden rounded-xl border bg-card transition-all duration-200',
            focused
              ? 'border-primary/35 ring-2 ring-primary/18 shadow-[0_0_0_4px_hsl(var(--primary)/0.06)]'
              : 'hover:border-border/80',
          )}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            if (!composeRef.current?.contains(e.relatedTarget as Node)) {
              setFocused(false);
            }
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              void onPost();
            }
          }}
        >
          <RichTextEditor
            key={resetKey}
            ref={composeEditorRef}
            value={draft}
            onChange={(doc) => setDraftDoc(doc)}
            projectId={projectId}
            storyId={storyId}
            ariaLabel="New comment body"
            minHeight="80px"
            placeholder="Add a comment — @ to mention a teammate, # to tag an issue"
            mentionItems={mentionItems}
            ticketItems={ticketItems}
          />

          {/* Action row */}
          <div
            className={cn(
              'flex items-center justify-between border-t px-3 py-2 transition-colors',
              focused ? 'border-primary/20 bg-primary/[0.02]' : 'border-border/60 bg-muted/20',
            )}
          >
            {/* Persistent helper — the placeholder disappears once the user
                types, so the @ / # affordances live here where they stay
                visible. The @ and # are real buttons: clicking them focuses
                the editor and inserts the trigger char so the suggestion menu
                pops, for users who don't know the keyboard shortcut.
                onMouseDown is prevented so clicking doesn't blur the editor
                before insertTrigger re-focuses it. */}
            <div className="hidden items-center gap-1 text-[10px] text-muted-foreground/45 sm:flex">
              <button
                type="button"
                aria-label="Mention a teammate"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => composeEditorRef.current?.insertTrigger('@')}
                className="group inline-flex items-center rounded px-0.5 transition-colors hover:text-foreground"
              >
                <kbd className="cursor-pointer rounded border border-border/60 bg-background px-1 py-px font-mono text-[9px] group-hover:border-primary/40 group-hover:text-foreground">
                  @
                </kbd>
                <span className="ml-1">mention</span>
              </button>
              <span className="mx-1 text-muted-foreground/25">·</span>
              <button
                type="button"
                aria-label="Tag an issue"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => composeEditorRef.current?.insertTrigger('#')}
                className="group inline-flex items-center rounded px-0.5 transition-colors hover:text-foreground"
              >
                <kbd className="cursor-pointer rounded border border-border/60 bg-background px-1 py-px font-mono text-[9px] group-hover:border-primary/40 group-hover:text-foreground">
                  #
                </kbd>
                <span className="ml-1">tag an issue</span>
              </button>
              <span className="mx-1 text-muted-foreground/25">·</span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-border/60 bg-background px-1 py-px font-mono text-[9px]">
                  {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}
                </kbd>
                <kbd className="rounded border border-border/60 bg-background px-1 py-px font-mono text-[9px]">
                  ↵
                </kbd>
                <span className="ml-0.5">to post</span>
              </span>
            </div>

            <Button
              size="sm"
              className="ml-auto h-7 gap-1.5 px-3 text-xs"
              onClick={onPost}
              disabled={posting || !hasContent}
            >
              {posting ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border border-primary-foreground/30 border-t-primary-foreground" />
                  Posting…
                </>
              ) : (
                <>
                  <Send className="h-3 w-3" />
                  Post
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
