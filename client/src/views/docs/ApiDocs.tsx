// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { BookOpen, KeyRound } from 'lucide-react';
// The external-API docs live in the repo's docs/ folder (single source of
// truth — the same files GitHub renders). Imported here as raw text via the
// @docs alias and rendered below, so the in-app guide never drifts from the
// committed documentation.
import guideDoc from '@docs/external-api-guide.md?raw';
import referenceDoc from '@docs/external-api-reference.md?raw';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type DocKey = 'guide' | 'reference';

const DOCS: Record<DocKey, { label: string; body: string }> = {
  guide: { label: 'Integration Guide', body: guideDoc },
  reference: { label: 'API Reference', body: referenceDoc },
};

// Map the cross-doc markdown links onto tab keys so an internal link switches
// tabs instead of navigating the SPA to a dead route. Both the current file
// names and the older pre-rename / pre-merge names resolve to the right tab.
const FILE_TO_TAB: Record<string, DocKey> = {
  'external-api-guide.md': 'guide',
  'external-api-reference.md': 'reference',
  // legacy filenames (pre-rename / pre-merge) still resolve
  'external-api-integration-guide.md': 'guide',
  'external-api.md': 'reference',
  'external-api-writes.md': 'reference',
};

export function ApiDocs() {
  const [tab, setTab] = useState<DocKey>('guide');

  const renderMarkdown = (body: string) => (
    <article className="api-doc">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const file = href?.split('#')[0] ?? '';
            const target = FILE_TO_TAB[file];
            if (target) {
              return (
                <a
                  href={`#${target}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setTab(target);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  {children}
                </a>
              );
            }
            // Real external link — open in a new tab.
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
        }}
      >
        {body}
      </Markdown>
    </article>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BookOpen className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">External API</h1>
          <p className="text-sm text-muted-foreground">
            How to read from and write to Spirex from external services using an
            API key.
          </p>
        </div>
      </header>

      <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          You'll need an API key. Create one under{' '}
          <a href="/profile" className="font-medium text-primary underline">
            Profile → API Keys
          </a>
          . Every action made with a key is attributed to your user.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as DocKey)}>
        <TabsList>
          {(Object.keys(DOCS) as DocKey[]).map((k) => (
            <TabsTrigger key={k} value={k}>
              {DOCS[k].label}
            </TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(DOCS) as DocKey[]).map((k) => (
          <TabsContent key={k} value={k}>
            <div className="rounded-2xl border bg-card p-6 shadow-card sm:p-8">
              {renderMarkdown(DOCS[k].body)}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <style>{`
        .api-doc { font-size: 14.5px; line-height: 1.7; color: hsl(var(--foreground)); }
        .api-doc h1 { font-size: 1.7rem; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 0.5em; }
        .api-doc h2 { font-size: 1.2rem; font-weight: 700; margin: 1.8em 0 0.7em; padding-bottom: 0.3em; border-bottom: 1px solid hsl(var(--border)); }
        .api-doc h3 { font-size: 1rem; font-weight: 700; margin: 1.4em 0 0.5em; }
        .api-doc p { margin: 0.8em 0; }
        .api-doc ul, .api-doc ol { margin: 0.8em 0; padding-left: 1.4em; }
        .api-doc li { margin: 0.3em 0; }
        .api-doc a { color: hsl(var(--primary)); text-decoration: underline; cursor: pointer; }
        .api-doc strong { font-weight: 700; color: hsl(var(--foreground)); }
        .api-doc em { color: hsl(var(--muted-foreground)); }
        .api-doc code { background: hsl(var(--muted)); border-radius: 4px; padding: 0.1em 0.35em; font-size: 0.88em; }
        .api-doc pre {
          background: #1e293b; color: #e2e8f0; border-radius: 8px;
          padding: 0.9em 1.1em; overflow-x: auto; margin: 1em 0; font-size: 12.5px;
        }
        .api-doc pre code { background: transparent; padding: 0; color: inherit; }
        .api-doc hr { border: 0; border-top: 1px solid hsl(var(--border)); margin: 2em 0; }
        .api-doc blockquote {
          margin: 1.1em 0; padding: 0.6em 1em;
          border-left: 3px solid hsl(var(--primary)); background: hsl(var(--primary) / 0.06);
          border-radius: 0 6px 6px 0; color: hsl(var(--foreground));
        }
        .api-doc blockquote p { margin: 0.3em 0; }
        .api-doc table {
          width: 100%; border-collapse: collapse; margin: 1.1em 0;
          font-size: 13px; display: block; overflow-x: auto;
        }
        .api-doc th, .api-doc td {
          border: 1px solid hsl(var(--border)); padding: 0.5em 0.7em; text-align: left;
        }
        .api-doc th { background: hsl(var(--muted) / 0.5); font-weight: 700; }
      `}</style>
    </div>
  );
}
