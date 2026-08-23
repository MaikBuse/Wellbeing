'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/use-media-query';
import type { MascotMood } from '@/services/nutrition/mascot';
import {
  RIVE_SRC,
  STATE_MACHINE,
  applyMood,
  initCharacter,
  type MoodTarget,
} from './rive-asset';

/**
 * The one client island in this feature.
 *
 * Props are an enum and a number. The sentence, the nutrient name and the
 * suggestion all stay in the server markup of `MascotView` and never cross this
 * boundary, so the same line that stands over `animated-number.tsx` holds here:
 * this island holds no health data of its own and logs nothing.
 *
 * Three things it is careful about.
 *
 * THE RUNTIME IS NEVER LOADED SPECULATIVELY. `@rive-app/canvas-single` carries
 * its WASM inline, so the chunk is large; it is reached only through the dynamic
 * import below, exactly as `use-barcode-scanner.ts` reaches zxing. Under
 * `prefers-reduced-motion: reduce` the effect returns before the import, which
 * is stricter than the global CSS rule — that one only stops CSS animations, it
 * cannot stop a download.
 *
 * ONE INSTANCE PER PAGE. `MascotView` already renders at most one `stage`
 * variant per route, but the module-level claim is the net under that: a second
 * island mounting at the same time renders nothing and leaves the poster
 * standing, rather than starting a second render loop on a phone.
 *
 * IT STOPS WHEN NOBODY IS LOOKING. This app is installed as a PWA and stays
 * open for days (see the comment in `use-media-query.ts`), so a loop that ran
 * while the tab was hidden or the figure scrolled away would just be a battery
 * cost.
 */

/*
 * Module scope on purpose: this has to be shared between instances, and React
 * state cannot be. Claimed and released in an effect rather than during render,
 * because StrictMode invokes render twice and would leak the claim.
 */
let claimed = false;

export function MascotCanvas({
  mood,
  size,
}: {
  mood: MascotMood;
  size: number;
}) {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const riveRef = useRef<{
    cleanup(): void;
    play(): void;
    pause(): void;
    resizeDrawingSurfaceToCanvas(): void;
  } & MoodTarget | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    if (claimed) return;
    claimed = true;

    let cancelled = false;
    let observer: IntersectionObserver | null = null;

    // Paused for either reason, resumed only when both are clear again.
    let visible = true;
    let onScreen = true;
    const sync = () => {
      const rive = riveRef.current;
      if (rive === null) return;
      if (visible && onScreen) rive.play();
      else rive.pause();
    };

    const onVisibility = () => {
      visible = document.visibilityState === 'visible';
      sync();
    };

    (async () => {
      const { Rive } = await import('@rive-app/canvas-single');
      if (cancelled) return;

      const rive = new Rive({
        canvas,
        src: RIVE_SRC,
        stateMachines: STATE_MACHINE,
        autoplay: true,
        // The whole control surface of this file is a bound ViewModel; without
        // this there is nothing to set. See the comment in `rive-asset.ts`.
        autoBind: true,
        onLoad: () => {
          if (cancelled) return;
          rive.resizeDrawingSurfaceToCanvas();
          initCharacter(rive);
          applyMood(rive, mood);
          // Only now does the canvas cover the poster, so a failure to load
          // leaves the still frame visible instead of an empty box.
          setReady(true);
        },
        // Deliberately silent: a missing or renamed asset is a degraded
        // drawing, not an error worth a console line on this screen.
        onLoadError: () => undefined,
      });
      riveRef.current = rive;

      observer = new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        sync();
      });
      observer.observe(canvas);
      document.addEventListener('visibilitychange', onVisibility);
    })().catch(() => {
      // The poster stays. Nothing else to do and nothing to say.
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      riveRef.current?.cleanup();
      riveRef.current = null;
      claimed = false;
      setReady(false);
    };
    // `mood` is applied by the effect below; re-mounting the runtime for a mood
    // change would throw away the loaded file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  useEffect(() => {
    const rive = riveRef.current;
    if (rive !== null && ready) applyMood(rive, mood);
  }, [mood, ready]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      width={size * 2}
      height={size * 2}
      aria-hidden
      /* The mood is written out beside the figure, so this is decoration. */
      className="absolute inset-0 size-full transition-opacity duration-320"
      style={{ opacity: ready ? 1 : 0 }}
    />
  );
}
