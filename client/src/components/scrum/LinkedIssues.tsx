// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';
import { Link2, X } from 'lucide-react';
import { storyApi } from '@/apis/storyApi';
import { extractError } from '@/config/httpClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LinkStoryDialog } from './LinkStoryDialog';
import { StoryTypeIcon } from './StoryTypeIcon';
import { useProjectStatuses } from '@/hooks/useProjectStatuses';
import {
  LINK_LABELS,
  type LinkType,
  type Story,
  type StoryLink,
} from '@/types/scrum';
import { toast } from 'sonner';

interface Props {
  story: Story;
  canEdit: boolean;
  onOpenStory: (key: string) => void;
}

export function LinkedIssues({ story, canEdit, onOpenStory }: Props) {
  const [links, setLinks] = useState<StoryLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { rows: workflowRows, byCore: statusByCore } = useProjectStatuses(story.projectId);

  // Resolve a linked story's status label from its ACTUAL column (statusId) —
  // links are same-project, so the current project's rows apply. Falls back to
  // the first row matching the core status, then the collapsed default label.
  const labelFor = (t: { status: Story['status']; statusId: string | null }) => {
    if (t.statusId) {
      const row = workflowRows.find((w) => w.id === t.statusId);
      if (row) return row.label;
    }
    return workflowRows.find((w) => w.coreStatus === t.status)?.label ?? statusByCore[t.status].label;
  };

  const refresh = async () => {
    setLoading(true);
    try {
      const rows = await storyApi.listLinks(story.id);
      setLinks(rows);
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id]);

  const onUnlink = async (link: StoryLink) => {
    try {
      await storyApi.removeLink(story.id, link.id);
      await refresh();
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  const grouped: Record<LinkType, StoryLink[]> = {
    blocks: [], blocked_by: [], duplicates: [], duplicated_by: [], relates_to: [],
    reiterates: [], reiterated_by: [],
  };
  for (const l of links) grouped[l.type].push(l);

  const hasAny = links.length > 0;

  return (
    <section>
      <header className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="h-4 w-4" />
          Linked issues
          {hasAny ? (
            <span className="text-xs font-normal text-muted-foreground">· {links.length}</span>
          ) : null}
        </h3>
        {canEdit ? (
          <Button size="sm" variant="ghost" onClick={() => setDialogOpen(true)}>
            Link issue
          </Button>
        ) : null}
      </header>

      {!hasAny ? (
        <p className="text-xs italic text-muted-foreground">
          {loading ? 'Loading…' : 'No linked issues yet.'}
        </p>
      ) : (
        <div className="max-h-48 space-y-3 overflow-y-auto pr-1">
          {(Object.keys(grouped) as LinkType[]).map((t) => {
            const rows = grouped[t];
            if (rows.length === 0) return null;
            return (
              <div key={t}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {LINK_LABELS[t]}
                </div>
                <ul className="divide-y rounded-md border bg-card">
                  {rows.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm"
                      data-link-type={l.type}
                    >
                      {l.target ? <StoryTypeIcon type={l.target.type} /> : null}
                      <button
                        type="button"
                        onClick={() => l.target && onOpenStory(l.target.key)}
                        className="min-w-0 flex-1 truncate text-left hover:underline"
                        disabled={!l.target}
                      >
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {l.target?.key ?? '—'}
                        </span>{' '}
                        {l.target?.title ?? 'Story removed'}
                      </button>
                      {l.target ? (
                        <Badge variant="outline" className="text-[10px]">
                          {labelFor(l.target)}
                        </Badge>
                      ) : null}
                      {canEdit ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onUnlink(l)}
                          aria-label={`Unlink ${l.target?.key ?? 'issue'}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <LinkStoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sourceStory={story}
        existingTargetIds={links.map((l) => l.target?.id).filter((v): v is string => !!v)}
        onLinked={refresh}
      />
    </section>
  );
}
