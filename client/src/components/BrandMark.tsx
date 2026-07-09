// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { Link } from 'react-router-dom';
import { BRAND } from '@/config/brand';

interface BrandMarkProps {
  size?: number;
  showWordmark?: boolean;
  to?: string;
  className?: string;
}

/**
 * SPIREX brand mark — a stacked-layers glyph (three offset rounded squares)
 * conveying depth and iteration. Pairs with the "SPIREX" wordmark.
 */
export function BrandMark({
  size = 30,
  showWordmark = true,
  to = '/',
  className = '',
}: BrandMarkProps) {
  const Inner = (
    <span className={`group inline-flex items-center gap-2.5 ${className}`}>
      <span
        className="relative inline-flex shrink-0 items-center justify-center"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-[0_0_8px_hsl(var(--primary)/0.35)] transition-[filter] duration-300 group-hover:drop-shadow-[0_0_14px_hsl(var(--primary)/0.55)]"
        >
          <defs>
            <linearGradient id="bm-grad-a" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(var(--primary))" />
              <stop offset="100%" stopColor="hsl(var(--primary) / 0.6)" />
            </linearGradient>
            <linearGradient id="bm-grad-b" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(var(--primary) / 0.55)" />
              <stop offset="100%" stopColor="hsl(var(--primary) / 0.25)" />
            </linearGradient>
          </defs>

          {/* Back layer — faded, offset up-right */}
          <rect
            x="10"
            y="3"
            width="19"
            height="19"
            rx="5"
            fill="url(#bm-grad-b)"
            opacity="0.55"
          />

          {/* Mid layer */}
          <rect
            x="6.5"
            y="6.5"
            width="19"
            height="19"
            rx="5"
            fill="url(#bm-grad-b)"
            opacity="0.8"
          />

          {/* Front layer — primary face */}
          <rect
            x="3"
            y="10"
            width="19"
            height="19"
            rx="5"
            fill="url(#bm-grad-a)"
          />

          {/* Inner monogram tick — a subtle slash representing momentum */}
          <path
            d="M9 22.5 L16 14"
            stroke="hsl(var(--primary-foreground))"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.92"
          />
          <circle cx="16" cy="14" r="1.6" fill="hsl(var(--primary-foreground))" />
        </svg>
      </span>

      {showWordmark && (
        <span className="hidden flex-col leading-none sm:flex">
          <span className="text-[15px] font-bold tracking-[0.06em] text-foreground">
            {BRAND.nameLead}<span className="text-primary">{BRAND.nameAccent}</span>
          </span>
          <span className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
            {BRAND.subtitle}
          </span>
        </span>
      )}
    </span>
  );

  if (to) {
    return (
      <Link to={to} aria-label={`${BRAND.name} home`} className="outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md">
        {Inner}
      </Link>
    );
  }
  return Inner;
}
