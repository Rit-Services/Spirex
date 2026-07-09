// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

export function MarkdownView({ value, className }: { value: string | null; className?: string }) {
  if (!value || !value.trim()) {
    return <p className={cn('text-sm italic text-muted-foreground', className)}>No description yet.</p>;
  }
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none text-foreground',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]',
        '[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3',
        '[&_a]:text-primary [&_a]:underline',
        '[&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:list-decimal [&_ol]:pl-5',
        '[&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold',
        className,
      )}
    >
      <ReactMarkdown>{value}</ReactMarkdown>
    </div>
  );
}
