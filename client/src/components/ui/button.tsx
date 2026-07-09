// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // `relative` anchors the hover-only `::after` hit-extender below.
        // The button lifts 1px on hover (`-translate-y-px`); that vacates a
        // 1px strip at the bottom, so the `::after` extends the *clickable*
        // area ~4px downward whenever the button is lifted — the hit area
        // grows past the cursor instead of moving away from it, which is
        // what keeps the bottom edge reliably clickable.
        default:
          "relative bg-gradient-to-b from-primary to-primary/85 text-primary-foreground shadow-sm hover:-translate-y-px hover:shadow-glow active:translate-y-0 active:shadow-sm hover:after:absolute hover:after:inset-x-0 hover:after:top-full hover:after:h-1 hover:after:content-['']",
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'hover:bg-accent hover:text-accent-foreground',
        link:
          'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-xl px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { buttonVariants };
