'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/use-media-query';
import type { MascotMood } from '@/services/nutrition/mascot';
import {
  GESTURE_HOLD_MS,
  IDLE_EVERY_MS,
  IDLE_TRIGGER,
  RIVE_SRC,
  STATE_MACHINE,
  applyCue,
  applyMood,
  initCharacter,
  restPose,
  type MascotCharacter,
  type MascotCue,
  type MoodTarget,
} from './rive-asset';

/**
 * The one client island in this feature.
 *
 * Props are enums and numbers. The sentence, the nutrient name and the
 * suggestion all stay in the server markup around it and never cross this
 * boundary, so the same line that stands over `animated-number.tsx` holds here:
 * this island holds no health data of its own and logs nothing.
 *
 * Four things it is careful about.
 *
 * THE RUNTIME IS NEVER LOADED SPECULATIVELY. `@rive-app/canvas-single` carries
 * its WASM inline, so the chunk is large; it is reached only through the dynamic
 * import below, exactly as `use-barcode-scanner.ts` reaches zxing. Under
 * `prefers-reduced-motion: reduce` the frame does not render this component at
 * all and the effect below returns before the import anyway — two floors under
 * the same thing, because the global CSS rule only stops CSS animations and
 * cannot stop a download.
 *
 * ONE INSTANCE PER PAGE. The dock is the only caller now, but the module-level
 * claim is the net under that: a second island mounting at the same time draws
 * nothing and never reports itself ready, rather than starting a second render
 * loop on a phone.
 *
 * THE DOCK WAITS FOR THIS FILE. There is no still frame behind the canvas any
 * more, so `onReadyChange` is what tells the frame there is something to show —
 * it stays away, untappable, until the drawing is actually loaded. Which also
 * means the walk cycle and the slide-up now start on the same frame.
 *
 * IT STOPS WHEN NOBODY IS LOOKING, BUT NOT AT ONCE. This app is installed as a
 * PWA and stays open for days (see the comment in `use-media-query.ts`), so a
 * loop that ran while the tab was hidden would just be a battery cost. A hidden
 * tab therefore pauses immediately — but an empty rectangle does not, because a
 * page change empties it for about a second and pausing on that was what made
 * him freeze mid-step and come back breathing. See `PAUSE_AFTER_MS`.
 *
 * The dock used to duck behind the bar while the page was scrolled, which took
 * the element out of the viewport and paused this loop as a side effect. That
 * tuck is gone, so while the page is visible the loop now runs. The case that
 * actually costs battery — the app sitting in the background for hours — is the
 * hidden-tab one, and that still pauses on the spot.
 *
 * EVERY POSE IS GIVEN BACK. The triggers in this file do not end by themselves —
 * see the comment over `MOOD_GESTURE`. One timer owns that, and it is shared
 * between the mood gesture and the cue so that a meal recorded during a wave
 * cancels the wave's return rather than racing it.
 */

/**
 * How long an empty rectangle has to last before it is worth pausing for.
 *
 * Longer than a view transition, and than two of them back to back. Tapping a
 * tab runs the nav slide (~550 ms) and then, because `(app)/loading.tsx` exists,
 * the skeleton-to-content handoff (~550 ms) — and for that whole time this
 * element is not being rendered directly but through
 * `::view-transition-*(site-mascot)` pseudo-elements, which the
 * IntersectionObserver below reads as gone. Pausing there froze the figure for
 * the transition and dropped him back into the breathing loop afterwards, which
 * is what "he disappears when I change pages" actually was.
 *
 * Raise this if the durations in `globals.css` are ever raised.
 */
const PAUSE_AFTER_MS = 1500;

/*
 * Module scope on purpose: this has to be shared between instances, and React
 * state cannot be. Claimed and released in an effect rather than during render,
 * because StrictMode invokes render twice and would leak the claim.
 */
let claimed = false;

export function MascotCanvas({
  character,
  mood,
  cue,
  cueToken,
  onReadyChange,
}: {
  /**
   * Which figure to draw. Read once, in `onLoad`, and never re-applied: the dock
   * keys this component on it, so a different figure is a different instance.
   */
  character: MascotCharacter;
  mood: MascotMood;
  /** The last thing the person did, or null. */
  cue: MascotCue | null;
  /**
   * Changes whenever `cue` should play again, including when the cue itself is
   * unchanged — two meals in a row are two acknowledgements, not one.
   */
  cueToken: number;
  /**
   * Called when there is, or is no longer, a drawing on screen. The frame keeps
   * the whole dock away until this says true.
   */
  onReadyChange: (ready: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const riveRef = useRef<
    | ({
        cleanup(): void;
        play(): void;
        pause(): void;
        resizeDrawingSurfaceToCanvas(): void;
      } & MoodTarget)
    | null
  >(null);
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);

  /** Hold a pose for a moment, then stand normally again. */
  const holdThenRest = useCallback(() => {
    if (restTimer.current !== null) clearTimeout(restTimer.current);
    restTimer.current = setTimeout(() => {
      restTimer.current = null;
      const rive = riveRef.current;
      if (rive !== null) restPose(rive);
    }, GESTURE_HOLD_MS);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (canvas === null) return;
    if (claimed) return;
    claimed = true;

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let idle: ReturnType<typeof setInterval> | null = null;

    // Paused for either reason, resumed only when both are clear again.
    let visible = true;
    let onScreen = true;
    let pauseTimer: ReturnType<typeof setTimeout> | null = null;
    const sync = () => {
      const rive = riveRef.current;
      if (rive === null) return;
      if (pauseTimer !== null) {
        clearTimeout(pauseTimer);
        pauseTimer = null;
      }
      if (visible && onScreen) {
        rive.play();
        return;
      }
      // A hidden tab is certain, and it costs battery now.
      if (!visible) {
        rive.pause();
        return;
      }
      // An empty rectangle is not certain — see `PAUSE_AFTER_MS`. Only a tuck
      // that actually lasts is worth pausing for.
      pauseTimer = setTimeout(() => {
        pauseTimer = null;
        riveRef.current?.pause();
      }, PAUSE_AFTER_MS);
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
          initCharacter(rive, character);
          applyMood(rive, mood);
          holdThenRest();
          // Only now is there anything to look at, which is also the moment
          // the dock is allowed to step out. A file that never loads leaves the
          // corner empty rather than leaving an invisible tap target in it.
          setReady(true);
          onReadyChange(true);
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

      /*
       * A stance change now and then. Only while nothing is being held, so this
       * can never cut a gesture short — and cheap enough at this interval that
       * it costs nothing on a screen left open.
       */
      idle = setInterval(() => {
        if (restTimer.current !== null) return;
        if (document.visibilityState !== 'visible') return;
        restPose(rive, IDLE_TRIGGER);
      }, IDLE_EVERY_MS);
    })().catch(() => {
      // Nothing was reported ready, so the corner stays empty. Nothing to say.
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (idle !== null) clearInterval(idle);
      if (pauseTimer !== null) clearTimeout(pauseTimer);
      if (restTimer.current !== null) clearTimeout(restTimer.current);
      restTimer.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
      riveRef.current?.cleanup();
      riveRef.current = null;
      claimed = false;
      setReady(false);
      onReadyChange(false);
    };
    // `mood` is applied by the effect below; re-mounting the runtime for a mood
    // change would throw away the loaded file. `onReadyChange` is left out for
    // the same reason — a new function identity must not reload the file.
    // `character` is left out as well, and unlike those two it is not re-applied
    // by any effect: `mascot-dock-frame.tsx` keys this component on it, so a
    // different figure is a different instance and the value read in `onLoad`
    // can never be stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  useEffect(() => {
    const rive = riveRef.current;
    if (rive === null || !ready) return;
    applyMood(rive, mood);
    holdThenRest();
  }, [mood, ready, holdThenRest]);

  useEffect(() => {
    const rive = riveRef.current;
    if (rive === null || !ready || cue === null) return;
    applyCue(rive, cue);
    holdThenRest();
    // `cue` is deliberately not the only dependency: the same cue twice in a row
    // is two acknowledgements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cueToken, ready]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      /*
       * No width/height attributes: `resizeDrawingSurfaceToCanvas()` derives the
       * backing store from this box times the device pixel ratio, and it runs in
       * `onLoad` before the opacity goes up, so the 300x150 default is never
       * seen. The size of the figure lives in ONE place — the Tailwind box in
       * `mascot-dock-frame.tsx` — instead of being repeated as a number here.
       */
      /* The mood is written out beside the figure, so this is decoration. */
      className="absolute inset-0 size-full transition-opacity duration-320"
      style={{ opacity: ready ? 1 : 0 }}
    />
  );
}
