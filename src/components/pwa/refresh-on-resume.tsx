'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** Below this, a tab switch is not worth a round trip. */
const MIN_HIDDEN_MS = 60_000;

/**
 * Re-fetches the screen when the app comes back after being away for a while.
 *
 * An installed PWA is resumed, not reloaded: iOS hands the page back exactly as
 * it was left. Left open overnight, the day screen keeps showing yesterday's
 * date and yesterday's entries, and no navigation ever happens to correct it.
 * That is the "the app thinks today is Friday" report.
 *
 * Deliberately no date arithmetic here. Comparing a client-computed logical day
 * against the rendered one would mean doing day-boundary maths in the browser,
 * which is exactly what src/lib/time.ts exists to keep on the server. Elapsed
 * hidden time is enough: it is monotone, needs no time zone, and the server
 * decides what "today" means when it re-renders.
 */
export function RefreshOnResume() {
  const router = useRouter();
  const hiddenSince = useRef<number | null>(null);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenSince.current = Date.now();
        return;
      }
      const since = hiddenSince.current;
      hiddenSince.current = null;
      if (since !== null && Date.now() - since >= MIN_HIDDEN_MS) {
        router.refresh();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [router]);

  return null;
}
