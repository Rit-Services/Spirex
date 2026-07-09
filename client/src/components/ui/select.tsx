// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Select        = SelectPrimitive.Root;
export const SelectGroup   = SelectPrimitive.Group;
export const SelectValue   = SelectPrimitive.Value;

/* ── Trigger ──────────────────────────────────────────────────────────────── */
export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-sm',
      'ring-offset-background transition-colors duration-150',
      'placeholder:text-muted-foreground',
      'hover:border-primary/35 hover:bg-muted/30',
      'focus:outline-none focus:border-primary/45 focus:ring-2 focus:ring-primary/18',
      'disabled:cursor-not-allowed disabled:opacity-50',
      '[&>span]:line-clamp-1 [&>span]:text-left',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200 data-[state=open]:rotate-180" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

/* ── Scroll buttons ───────────────────────────────────────────────────────── */
export const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1 text-muted-foreground/60', className)}
    {...props}
  >
    <ChevronUp className="h-3.5 w-3.5" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

export const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn('flex cursor-default items-center justify-center py-1 text-muted-foreground/60', className)}
    {...props}
  >
    <ChevronDown className="h-3.5 w-3.5" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

/* ── Content ──────────────────────────────────────────────────────────────── */
export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={6}
      className={cn(
        'relative z-50 overflow-hidden rounded-xl p-1.5 text-card-foreground',
        'border border-border/70 bg-card',
        'shadow-[0_8px_30px_-4px_hsl(var(--shadow-color)/0.22),0_3px_10px_-3px_hsl(var(--shadow-color)/0.14),inset_0_1px_0_0_hsl(var(--primary)/0.07)]',
        position === 'popper' && [
          'min-w-[var(--radix-select-trigger-width)]',
          'max-h-[min(var(--radix-select-content-available-height),22rem)]',
        ],
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
        'data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2',
        className,
      )}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport className="p-0">
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

/* ── Label ────────────────────────────────────────────────────────────────── */
export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      'px-2.5 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50',
      className,
    )}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

/* ── Item ─────────────────────────────────────────────────────────────────── */
export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-lg py-2.5 pl-2.5 pr-8 text-sm font-medium outline-none',
      'transition-colors duration-100',
      'focus:bg-primary/[0.08] focus:text-foreground',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-35',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="absolute right-2.5 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-3.5 w-3.5 text-primary" />
      </SelectPrimitive.ItemIndicator>
    </span>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

/* ── Separator ────────────────────────────────────────────────────────────── */
export const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn(
      '-mx-1.5 my-1 h-px bg-gradient-to-r from-transparent via-border/80 to-transparent',
      className,
    )}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;
