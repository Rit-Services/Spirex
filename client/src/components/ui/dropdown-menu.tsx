// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const DropdownMenu         = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger  = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup    = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal   = DropdownMenuPrimitive.Portal;
export const DropdownMenuSub      = DropdownMenuPrimitive.Sub;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/* ── Content ──────────────────────────────────────────────────────────────── */
export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[10rem] overflow-hidden rounded-xl p-1.5 text-card-foreground',
        'border border-border/70 bg-card',
        // Layered shadow: depth + ambient + inner top highlight
        'shadow-[0_8px_30px_-4px_hsl(var(--shadow-color)/0.22),0_3px_10px_-3px_hsl(var(--shadow-color)/0.14),inset_0_1px_0_0_hsl(var(--primary)/0.07)]',
        // Enter / exit animations (tailwindcss-animate)
        'data-[state=open]:animate-in  data-[state=open]:fade-in-0  data-[state=open]:zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-2  data-[side=top]:slide-in-from-bottom-2',
        'data-[side=left]:slide-in-from-right-2  data-[side=right]:slide-in-from-left-2',
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

/* ── Sub trigger ──────────────────────────────────────────────────────────── */
export const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      'flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium outline-none',
      'transition-colors duration-100',
      'focus:bg-primary/[0.08] focus:text-foreground data-[state=open]:bg-primary/[0.08]',
      '[&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:transition-colors',
      inset && 'pl-8',
      className,
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/50" />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger';

/* ── Sub content ──────────────────────────────────────────────────────────── */
export const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      'z-50 min-w-[9rem] overflow-hidden rounded-xl border border-border/70 bg-card p-1.5 text-card-foreground',
      'shadow-[0_8px_30px_-4px_hsl(var(--shadow-color)/0.22),0_3px_10px_-3px_hsl(var(--shadow-color)/0.14)]',
      'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
      'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
      className,
    )}
    {...props}
  />
));
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent';

/* ── Item ─────────────────────────────────────────────────────────────────── */
export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'group relative flex cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium outline-none',
      'transition-all duration-100',
      'focus:bg-primary/[0.08] focus:text-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-35',
      '[&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:transition-colors [&>svg]:duration-100',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

/* ── Checkbox item ────────────────────────────────────────────────────────── */
export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-lg py-2.5 pl-8 pr-2.5 text-sm font-medium outline-none',
      'transition-colors duration-100 focus:bg-primary/[0.08] focus:text-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-35',
      className,
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5 text-primary" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

/* ── Radio item ───────────────────────────────────────────────────────────── */
export const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-lg py-2.5 pl-8 pr-2.5 text-sm font-medium outline-none',
      'transition-colors duration-100 focus:bg-primary/[0.08] focus:text-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-35',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-primary text-primary" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem';

/* ── Label ────────────────────────────────────────────────────────────────── */
export const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      'px-2.5 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

/* ── Separator ────────────────────────────────────────────────────────────── */
export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn(
      '-mx-1.5 my-1 h-px bg-gradient-to-r from-transparent via-border/80 to-transparent',
      className,
    )}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

/* ── Shortcut ─────────────────────────────────────────────────────────────── */
export function DropdownMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'ml-auto rounded-md border border-border/50 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] tracking-widest text-muted-foreground/60 group-focus:border-primary/20 group-focus:text-primary/60',
        className,
      )}
      {...props}
    />
  );
}
DropdownMenuShortcut.displayName = 'DropdownMenuShortcut';
