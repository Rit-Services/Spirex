// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground',
        destructive:
          'border-transparent bg-destructive/15 text-destructive border-destructive/20',
        outline:
          'text-foreground',
        success:
          'border-transparent bg-emerald-500/15 text-emerald-700 border-emerald-500/20 dark:text-emerald-400',
        warning:
          'border-transparent bg-amber-500/15 text-amber-700 border-amber-500/20 dark:text-amber-400',
        info:
          'border-transparent bg-primary/10 text-primary border-primary/20',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
