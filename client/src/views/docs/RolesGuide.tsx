// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// The manual lives inside the client so Vite can bundle it reliably.
// Imported as raw text and rendered below — single source of truth.
import manual from '@/content/rolesAndPermissions.md?raw';
import { BRAND } from '@/config/brand';

/**
 * Public, no-login page that renders the Roles & Permissions manual.
 * Linked from the authentication screen so anyone can read it.
 */
export function RolesGuide() {
  return (
    <div className="min-h-screen bg-[#f6f7f9] text-slate-800">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef3ff] text-[13px] font-bold text-[#3b6fd6]">
              {BRAND.monogram}
            </div>
            <span className="text-sm font-semibold tracking-[0.1em]">
              {BRAND.nameLead}<span className="text-[#3b6fd6]">{BRAND.nameAccent}</span>
            </span>
          </div>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <article className="roles-doc">
          <Markdown remarkPlugins={[remarkGfm]}>{manual}</Markdown>
        </article>
      </main>

      <style>{`
        .roles-doc { font-size: 15px; line-height: 1.7; }
        .roles-doc h1 { font-size: 1.9rem; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 0.4em; }
        .roles-doc h2 { font-size: 1.3rem; font-weight: 700; margin: 2em 0 0.7em; padding-bottom: 0.3em; border-bottom: 1px solid #e2e8f0; }
        .roles-doc h3 { font-size: 1.05rem; font-weight: 700; margin: 1.5em 0 0.5em; }
        .roles-doc p { margin: 0.8em 0; }
        .roles-doc ul, .roles-doc ol { margin: 0.8em 0; padding-left: 1.4em; }
        .roles-doc li { margin: 0.3em 0; }
        .roles-doc a { color: #3b6fd6; text-decoration: underline; }
        .roles-doc strong { font-weight: 700; color: #1e293b; }
        .roles-doc em { color: #475569; }
        .roles-doc code { background: #eef1f5; border-radius: 4px; padding: 0.1em 0.35em; font-size: 0.88em; }
        .roles-doc pre {
          background: #1e293b; color: #e2e8f0; border-radius: 8px;
          padding: 0.9em 1.1em; overflow-x: auto; margin: 1em 0; font-size: 13px;
        }
        .roles-doc pre code { background: transparent; padding: 0; color: inherit; }
        .roles-doc hr { border: 0; border-top: 1px solid #e2e8f0; margin: 2.2em 0; }
        .roles-doc blockquote {
          margin: 1.1em 0; padding: 0.6em 1em;
          border-left: 3px solid #3b6fd6; background: #eef3ff;
          border-radius: 0 6px 6px 0; color: #334155;
        }
        .roles-doc blockquote p { margin: 0.3em 0; }
        .roles-doc table {
          width: 100%; border-collapse: collapse; margin: 1.1em 0;
          font-size: 13.5px; display: block; overflow-x: auto;
        }
        .roles-doc th, .roles-doc td {
          border: 1px solid #e2e8f0; padding: 0.5em 0.7em; text-align: left;
        }
        .roles-doc th { background: #f1f5f9; font-weight: 700; }
        .roles-doc tbody tr:nth-child(even) { background: #fafbfc; }
      `}</style>
    </div>
  );
}
