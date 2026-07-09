// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { lazy, Suspense } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Zap, BarChart3, Sparkles, PhoneCall } from 'lucide-react';
import { BRAND } from '@/config/brand';
import { BrandAcronymReveal } from '@/components/BrandAcronymReveal';

const ThreeBackground = lazy(() => import('@/components/ThreeBackground'));

const FEATURES = [
  { Icon: Zap,       label: 'Sprint Planning', desc: 'Intelligent velocity tracking and sprint management'                },
  // { Icon: Columns3,  label: 'Sprint Boards',   desc: 'Drag-and-drop cards across workflow columns, scoped to each sprint' },
  { Icon: Sparkles,  label: 'AI Import',       desc: 'Turn documents, images, and voice notes into issues in seconds'    },
  { Icon: PhoneCall, label: 'Call to Issue',  desc: 'Just talk — the calling agent files the issue live while you speak' },
  { Icon: BarChart3, label: 'Deep Analytics',  desc: 'Burndown charts, time tracking, and team insights'                 },
];

const PILLARS = [
  { val: 'Agile-native', label: 'Built for sprints'   },
  { val: 'Real-time',    label: 'Live updates'         },
  { val: 'Full-stack',   label: 'End-to-end insights'  },
];

export function AuthLayout() {
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: '#070a16' }}>
      {/* Three.js constellation — lazy-loaded, fills the full page */}
      <Suspense fallback={null}>
        <ThreeBackground />
      </Suspense>

      {/* Radial vignette: darkens edges, keeps centre open */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 80% 80% at 30% 50%, transparent 28%, #070a16 82%)' }}
      />

      {/* Subtle noise grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px',
        }}
      />

      <div className="relative z-10 flex min-h-screen lg:grid lg:grid-cols-[1fr_460px]">

        {/* ── LEFT: Branding ──────────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col justify-center px-16 py-16">

          {/* Logo wordmark */}
          <div className="mb-4 flex items-center gap-3 auth-slide-up">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold"
              style={{
                background: 'rgba(79,143,255,0.14)',
                color: '#6aa3ff',
                border: '1px solid rgba(79,143,255,0.24)',
                boxShadow: '0 0 22px rgba(79,143,255,0.32)',
              }}
            >
              {BRAND.monogram}
            </div>
            <span className="text-[1.4rem] font-bold tracking-[0.12em] text-white">
              {BRAND.nameLead}<span style={{ color: '#6aa3ff' }}>{BRAND.nameAccent}</span>
            </span>
          </div>

          {/* Brand full-form — "SPIREX" sits compact, then slides open into
              Sprint · Planning · Iteration · Reporting · EXecution. */}
          <div className="mb-12 auth-slide-up" style={{ animationDelay: '40ms' }}>
            <BrandAcronymReveal />
          </div>

          {/* Hero headline */}
          <div className="auth-slide-up" style={{ animationDelay: '80ms' }}>
            <h1
              className="font-bold leading-[1.04] tracking-[-0.025em] text-white"
              style={{ fontSize: 'clamp(2.8rem, 4.5vw, 4.2rem)' }}
            >
              Ship faster.
              <br />
              <span
                style={{
                  background: 'linear-gradient(135deg, #4f8fff 0%, #a78bfa 55%, #c084fc 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Stay aligned.
              </span>
            </h1>
            <p className="mt-5 max-w-[340px] text-[1.05rem] leading-relaxed" style={{ color: 'rgba(255,255,255,0.52)' }}>
              The engineering workspace for teams who move fast. Plan sprints, visualize flow, and ship with confidence.
            </p>
          </div>

          {/* Feature list */}
          <div className="mt-11 space-y-5 auth-slide-up" style={{ animationDelay: '160ms' }}>
            {FEATURES.map(({ Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-4">
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: 'rgba(79,143,255,0.10)', border: '1px solid rgba(79,143,255,0.18)' }}
                >
                  <Icon className="h-[15px] w-[15px]" style={{ color: '#5b8dee' }} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: 'rgba(255,255,255,0.86)' }}>{label}</p>
                  <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.40)' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Pillar stats */}
          <div className="mt-12 auth-slide-up" style={{ animationDelay: '240ms' }}>
            <div
              className="flex gap-10 border-t pt-8"
              style={{ borderColor: 'rgba(255,255,255,0.07)' }}
            >
              {PILLARS.map(({ val, label }) => (
                <div key={label}>
                  <p className="text-[15px] font-bold" style={{ color: 'rgba(255,255,255,0.84)' }}>{val}</p>
                  <p className="mt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.36)' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Form panel ───────────────────────────────────────────── */}
        <div
          className="flex flex-col items-center justify-center p-6"
          style={{ background: 'rgba(255,255,255,0.016)', backdropFilter: 'blur(1px)' }}
        >
          {/* Mobile-only logo */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[13px] font-bold"
              style={{ background: 'rgba(79,143,255,0.14)', color: '#6aa3ff', border: '1px solid rgba(79,143,255,0.22)' }}
            >
              {BRAND.monogram}
            </div>
            <span className="text-xl font-bold tracking-[0.12em] text-white">
              {BRAND.nameLead}<span style={{ color: '#6aa3ff' }}>{BRAND.nameAccent}</span>
            </span>
          </div>

          {/* Glass login card */}
          <div
            className="w-full max-w-sm rounded-2xl p-8 auth-slide-up"
            style={{
              animationDelay: '100ms',
              background: 'rgba(255,255,255,0.046)',
              backdropFilter: 'blur(32px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(32px) saturate(1.8)',
              border: '1px solid rgba(255,255,255,0.088)',
              boxShadow: '0 32px 64px -16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.035)',
            }}
          >
            <Outlet />
          </div>

          <p className="mt-6 text-center text-[11px]" style={{ color: 'rgba(255,255,255,0.22)' }}>
            {BRAND.name} · {BRAND.tagline}
          </p>
          <p className="mt-1 text-center text-[11px]">
            <a
              href={BRAND.poweredByUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 transition-colors"
              style={{ color: 'rgba(255,255,255,0.42)' }}
            >
              {BRAND.poweredBy}
            </a>
          </p>
          <Link
            to="/roles"
            className="mt-2 block text-center text-[11px] underline underline-offset-2 transition-colors"
            style={{ color: 'rgba(255,255,255,0.42)' }}
          >
            Roles &amp; Permissions Guide
          </Link>
        </div>
      </div>

      <style>{`
        .auth-slide-up {
          animation: authSlideUp 0.72s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes authSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </div>
  );
}
