'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribes to a media query.
 *
 * useSyncExternalStore rather than useState + useEffect for the same reason
 * install-prompt.tsx uses it: matchMedia is an external store, and reading it
 * with a synchronous setState inside an effect causes a cascading render (and
 * trips react-hooks/set-state-in-effect).
 *
 * The `change` subscription matters here beyond correctness — this app is
 * installed as a PWA and can stay open for days, so a one-shot read would keep
 * animating after the OS setting was flipped.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query]
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query]
  );

  // The server cannot know the preference, so it renders the motion-allowed
  // branch and hydration corrects it. Nothing animates before hydration.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** True only on devices with a real pointer — false on the phone. */
export function useHasPointer(): boolean {
  return useMediaQuery('(hover: hover) and (pointer: fine)');
}
