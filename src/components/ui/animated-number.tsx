'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';

/**
 * Counts up to `value` on mount.
 *
 * Deliberately not the React Bits CountUp: that one formats numbers itself and
 * would render German values wrongly (1234.5 as "1,234.5"). Everything here
 * goes through toLocaleString('de-DE'), matching formatGermanNumber in
 * lib/nutrition.ts.
 *
 * The value arrives as a prop from a server component — this island holds no
 * health data of its own and logs nothing.
 */
export function AnimatedNumber({
  value,
  digits = 0,
  duration = 700,
  className,
  ...props
}: React.ComponentProps<'span'> & {
  value: number;
  /** Decimal places, rendered with a German comma. */
  digits?: number;
  duration?: number;
}) {
  const reduced = useReducedMotion();
  // Starts at 0 on both server and client so the two first renders agree; the
  // count-up is what carries it to `value`.
  const [shown, setShown] = useState(0);
  // Tracks what is actually on screen, so a value that changes mid-flight
  // retargets from there instead of restarting from zero.
  //
  // This must hold the *displayed* number, never the target. Storing the target
  // here (e.g. in the effect cleanup) breaks under StrictMode's double-invoke:
  // the cleanup would set it to `value`, the second mount would compute
  // delta === 0, bail out, and the figure would sit at 0 forever.
  const shownRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      shownRef.current = value;
      return;
    }

    const from = shownRef.current;
    const delta = value - from;
    if (delta === 0) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // Same curve as --ease-out-soft: quick departure, long settle.
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = progress < 1 ? from + delta * eased : value;
      shownRef.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  const display = reduced ? value : shown;

  return (
    <span className={cn('num', className)} {...props}>
      {display.toLocaleString('de-DE', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })}
    </span>
  );
}
