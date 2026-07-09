import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        // Landing-only editorial display face (loaded lazily by landing.css).
        display: ['"Fraunces"', 'Georgia', 'serif'],
      },
      colors: {
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // ── Landing-only palette (tokens defined in views/landing/landing.css).
        //    Alpha-value form so opacity modifiers (bg-brand/60) work. None of
        //    these names are used by the product app — purely additive.
        paper: 'hsl(var(--paper) / <alpha-value>)',
        ink: {
          DEFAULT: 'hsl(var(--ink) / <alpha-value>)',
          soft:    'hsl(var(--ink-soft) / <alpha-value>)',
          faint:   'hsl(var(--ink-faint) / <alpha-value>)',
        },
        line: 'hsl(var(--line) / <alpha-value>)',
        brand: {
          DEFAULT: 'hsl(var(--brand) / <alpha-value>)',
          deep:    'hsl(var(--brand-deep) / <alpha-value>)',
          tint:    'hsl(var(--brand-tint) / <alpha-value>)',
          wash:    'hsl(var(--brand-wash) / <alpha-value>)',
        },
        gold: {
          DEFAULT: 'hsl(var(--gold) / <alpha-value>)',
          tint:    'hsl(var(--gold-tint) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg:   'var(--radius)',
        md:   'calc(var(--radius) - 2px)',
        sm:   'calc(var(--radius) - 4px)',
        xl:   'calc(var(--radius) + 4px)',
        '2xl':'calc(var(--radius) + 8px)',
        '3xl':'1.5rem',
        '4xl':'2.25rem',
      },
      boxShadow: {
        card:     '0 1px 3px 0 hsl(var(--shadow-color) / 0.08), 0 1px 2px -1px hsl(var(--shadow-color) / 0.06)',
        elevated: '0 4px 6px -1px hsl(var(--shadow-color) / 0.10), 0 2px 4px -2px hsl(var(--shadow-color) / 0.08)',
        float:    '0 10px 15px -3px hsl(var(--shadow-color) / 0.12), 0 4px 6px -4px hsl(var(--shadow-color) / 0.10)',
        glow:     'var(--glow-primary)',
        'glow-strong': 'var(--glow-strong)',
        // Landing-only soft elevation set (additive; app uses none of these).
        soft: '0 1px 2px hsl(var(--l-shadow) / 0.05), 0 4px 12px -4px hsl(var(--l-shadow) / 0.08)',
        lift: '0 10px 30px -12px hsl(var(--l-shadow) / 0.18), 0 2px 6px -2px hsl(var(--l-shadow) / 0.08)',
        ring: 'inset 0 0 0 1px hsl(var(--line))',
      },
      letterSpacing: {
        tightest: '-0.045em',
        tighter2: '-0.03em',
      },
      keyframes: {
        shimmer: {
          from: { backgroundPosition: '-200% center' },
          to:   { backgroundPosition: '200% center'  },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)'    },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)'    },
          '50%':      { transform: 'translateY(-9px)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 12px hsl(var(--primary) / 0.22)' },
          '50%':      { boxShadow: '0 0 32px hsl(var(--primary) / 0.44)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        // Landing-only.
        floaty: {
          '0%, 100%': { transform: 'translateY(0)'     },
          '50%':      { transform: 'translateY(-10px)' },
        },
        marquee: {
          from: { transform: 'translateX(0)'    },
          to:   { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        shimmer:     'shimmer 2.2s linear infinite',
        float:       'float 6s ease-in-out infinite',
        'glow-pulse':'glowPulse 3s ease-in-out infinite',
        'slide-up':  'slideUp 0.55s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in':   'fadeIn 0.45s ease-out both',
        // Landing-only.
        floaty:      'floaty 7s ease-in-out infinite',
        marquee:     'marquee 38s linear infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
