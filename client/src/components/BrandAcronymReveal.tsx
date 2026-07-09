// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronsLeftRight, ChevronsRightLeft } from 'lucide-react';
import { BRAND } from '@/config/brand';

interface BrandAcronymRevealProps {
  className?: string;
  /** Colour of the leading letters (they spell SPIREX when collapsed). */
  accentColor?: string;
  /** Colour of the expanded tails + separators. */
  restColor?: string;
  /** ms to hold the compact "SPIREX" before the first auto slide-open. */
  holdMs?: number;
}

/**
 * SPIREX acronym reveal — the leading letters sit tight as "SPIREX", then each
 * word's tail SLIDES OPEN horizontally, left-to-right, expanding the mark into
 * its full form: Sprint · Planning · Iteration · Reporting · EXecution.
 *
 * It auto-opens once on mount (after a short hold), then the trailing toggle
 * button hands control to the user — collapse it back to SPIREX or pop it open
 * again, with the same staggered, dragged-open motion either way.
 *
 * State-driven CSS transitions (not a one-shot keyframe) so open AND close both
 * animate. Themeable via props, reduced-motion safe. Defaults suit a dark panel.
 */
export function BrandAcronymReveal({
  className = '',
  accentColor = '#6aa3ff',
  restColor = 'rgba(255,255,255,0.42)',
  holdMs = 900,
}: BrandAcronymRevealProps) {
  const last = BRAND.acronym.length - 1;
  const fullForm = BRAND.acronym.map((w) => w.hi + w.rest).join(', ');
  const [open, setOpen] = useState(false);

  // Auto-reveal once on mount; afterwards it's fully user-controlled.
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), holdMs);
    return () => clearTimeout(t);
  }, [holdMs]);

  return (
    <div
      className={`spx-acro ${open ? 'is-open' : ''} ${className}`}
      style={
        {
          '--spx-accent': accentColor,
          '--spx-rest': restColor,
        } as CSSProperties
      }
    >
      <span className="spx-words" aria-label={`SPIREX — ${fullForm}`}>
        {BRAND.acronym.map((w, i) => (
          <span className="spx-word" key={w.hi} style={{ '--i': i } as CSSProperties} aria-hidden="true">
            <span className="spx-hi">{w.hi}</span>
            {/* The tail (plus a trailing separator for all but the last word) is
                what slides open. Collapsed → width 0 → only the initial shows. */}
            <span className="spx-rest">
              {w.rest}
              {i < last ? ' · ' : ''}
            </span>
          </span>
        ))}
      </span>

      <button
        type="button"
        className="spx-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Collapse to SPIREX' : 'Expand SPIREX full name'}
        title={open ? 'Collapse' : 'Expand'}
      >
        {open ? <ChevronsRightLeft className="spx-ic" /> : <ChevronsLeftRight className="spx-ic" />}
      </button>

      <style>{`
        .spx-acro {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          line-height: 1.5;
        }
        .spx-words { display: inline-flex; flex-wrap: wrap; align-items: baseline; }
        .spx-word { display: inline-flex; align-items: baseline; white-space: nowrap; }
        .spx-hi { font-weight: 700; color: var(--spx-accent); }
        .spx-rest {
          display: inline-block;
          overflow: hidden;
          max-width: 0;
          opacity: 0;
          color: var(--spx-rest);
          transform: translateX(-3px);
          /* Each tail opens/closes on a left-to-right stagger, so the whole mark
             reads like it's being dragged open (and zipped back shut). */
          transition:
            max-width 0.55s cubic-bezier(0.16, 1, 0.3, 1),
            opacity 0.4s ease,
            transform 0.55s cubic-bezier(0.16, 1, 0.3, 1);
          transition-delay: calc(var(--i) * 110ms);
        }
        .spx-acro.is-open .spx-rest { max-width: 18ch; opacity: 1; transform: translateX(0); }

        .spx-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 20px;
          width: 20px;
          flex-shrink: 0;
          border-radius: 6px;
          color: var(--spx-accent);
          border: 1px solid color-mix(in srgb, var(--spx-accent) 32%, transparent);
          background: color-mix(in srgb, var(--spx-accent) 12%, transparent);
          cursor: pointer;
          transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }
        .spx-toggle:hover {
          background: color-mix(in srgb, var(--spx-accent) 22%, transparent);
          transform: translateY(-1px);
          box-shadow: 0 0 12px color-mix(in srgb, var(--spx-accent) 35%, transparent);
        }
        .spx-toggle:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--spx-accent) 60%, transparent);
          outline-offset: 2px;
        }
        .spx-ic { width: 13px; height: 13px; }

        @media (prefers-reduced-motion: reduce) {
          .spx-rest { transition: none; }
          .spx-toggle { transition: none; }
        }
      `}</style>
    </div>
  );
}
