// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { BRAND } from '@/config/brand';

interface BrandLoaderProps {
  /** Caption under the mark. Defaults to a neutral "Loading…". */
  label?: string;
}

/**
 * SPIREX brand loader — the full-screen reveal shown while the session
 * resolves on first load. The stacked-layers glyph assembles layer-by-layer
 * (depth → iteration), the wordmark sweeps with a shimmer, and the acronym
 * spells itself out: S·P·I·R·EX.
 *
 * Self-contained: theme-driven colours via --primary, animations inlined so it
 * works before the rest of the app paints. Honours prefers-reduced-motion.
 */
export function BrandLoader({ label = 'Loading workspace…' }: BrandLoaderProps) {
  return (
    <div className="brand-loader flex min-h-screen flex-col items-center justify-center gap-7 bg-background">
      {/* ── Animated glyph ───────────────────────────────────────────── */}
      <div className="bl-glow relative flex h-20 w-20 items-center justify-center">
        <svg
          width="64"
          height="64"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="bl-grad-a" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(var(--primary))" />
              <stop offset="100%" stopColor="hsl(var(--primary) / 0.6)" />
            </linearGradient>
            <linearGradient id="bl-grad-b" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="hsl(var(--primary) / 0.55)" />
              <stop offset="100%" stopColor="hsl(var(--primary) / 0.25)" />
            </linearGradient>
          </defs>
          {/* Back → mid → front, each fading/sliding in on a stagger */}
          <rect className="bl-layer bl-layer-3" x="10" y="3" width="19" height="19" rx="5" fill="url(#bl-grad-b)" />
          <rect className="bl-layer bl-layer-2" x="6.5" y="6.5" width="19" height="19" rx="5" fill="url(#bl-grad-b)" />
          <rect className="bl-layer bl-layer-1" x="3" y="10" width="19" height="19" rx="5" fill="url(#bl-grad-a)" />
          {/* Momentum tick */}
          <path className="bl-tick" d="M9 22.5 L16 14" stroke="hsl(var(--primary-foreground))" strokeWidth="2.2" strokeLinecap="round" />
          <circle className="bl-tick" cx="16" cy="14" r="1.6" fill="hsl(var(--primary-foreground))" />
        </svg>
      </div>

      {/* ── Wordmark with shimmer sweep ──────────────────────────────── */}
      <div className="flex flex-col items-center gap-3">
        <span className="bl-word relative text-[2rem] font-bold leading-none tracking-[0.14em]">
          <span className="text-foreground">{BRAND.nameLead}</span>
          <span className="text-primary">{BRAND.nameAccent}</span>
          <span className="bl-sheen" aria-hidden="true" />
        </span>

        {/* ── Acronym spelling itself out ────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1">
          {BRAND.acronym.map((w, i) => (
            <span
              key={w.hi}
              className="bl-acro text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/55"
              style={{ animationDelay: `${600 + i * 130}ms` }}
            >
              <span className="font-bold text-primary/80">{w.hi}</span>
              {w.rest}
            </span>
          ))}
        </div>
      </div>

      <p className="bl-caption text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground/40">
        {label}
      </p>

      <style>{`
        .brand-loader { animation: blFade 0.4s ease both; }

        /* Glyph layers assemble back-to-front */
        .bl-layer { opacity: 0; transform-box: fill-box; transform-origin: center; }
        .bl-layer-3 { animation: blLayer 0.5s cubic-bezier(0.16,1,0.3,1) 0.05s both; }
        .bl-layer-2 { animation: blLayer 0.5s cubic-bezier(0.16,1,0.3,1) 0.18s both; }
        .bl-layer-1 { animation: blLayer 0.5s cubic-bezier(0.16,1,0.3,1) 0.31s both; }
        .bl-tick    { opacity: 0; animation: blFade 0.4s ease 0.5s both; }
        @keyframes blLayer {
          from { opacity: 0; transform: translate(2px, -4px) scale(0.9); }
          to   { opacity: 1; transform: translate(0, 0) scale(1); }
        }

        /* Soft breathing glow behind the glyph */
        .bl-glow::before {
          content: '';
          position: absolute;
          inset: -30%;
          border-radius: 9999px;
          background: radial-gradient(circle, hsl(var(--primary) / 0.28), transparent 68%);
          filter: blur(6px);
          animation: blPulse 2.6s ease-in-out infinite;
        }
        @keyframes blPulse {
          0%, 100% { opacity: 0.45; transform: scale(0.94); }
          50%      { opacity: 0.85; transform: scale(1.06); }
        }

        /* Wordmark fades up, then a sheen sweeps across it */
        .bl-word { opacity: 0; animation: blRise 0.6s cubic-bezier(0.16,1,0.3,1) 0.45s both; }
        .bl-sheen {
          position: absolute;
          inset: 0;
          background: linear-gradient(105deg, transparent 35%, hsl(var(--primary) / 0.45) 50%, transparent 65%);
          mix-blend-mode: screen;
          background-size: 220% 100%;
          animation: blSheen 2.4s ease-in-out 1.1s infinite;
        }
        @keyframes blSheen {
          0%   { background-position: 160% 0; opacity: 0; }
          18%  { opacity: 1; }
          55%  { background-position: -60% 0; opacity: 0; }
          100% { background-position: -60% 0; opacity: 0; }
        }

        .bl-acro    { opacity: 0; animation: blRise 0.5s cubic-bezier(0.16,1,0.3,1) both; }
        .bl-caption { opacity: 0; animation: blRise 0.5s ease 1.25s both; }

        @keyframes blRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blFade { from { opacity: 0; } to { opacity: 1; } }

        @media (prefers-reduced-motion: reduce) {
          .brand-loader *, .brand-loader *::before {
            animation-duration: 0.01ms !important;
            animation-delay: 0ms !important;
            opacity: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}
