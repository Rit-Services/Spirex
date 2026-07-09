// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const getMatch = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState<boolean>(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => setMatches(e.matches);
    onChange(mql);
    if ('addEventListener' in mql) {
      mql.addEventListener('change', onChange as (e: MediaQueryListEvent) => void);
      return () => mql.removeEventListener('change', onChange as (e: MediaQueryListEvent) => void);
    }
    // Safari < 14 fallback
    const legacy = mql as unknown as {
      addListener: (cb: (e: MediaQueryListEvent) => void) => void;
      removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
    };
    legacy.addListener(onChange as (e: MediaQueryListEvent) => void);
    return () => legacy.removeListener(onChange as (e: MediaQueryListEvent) => void);
  }, [query]);

  return matches;
}
