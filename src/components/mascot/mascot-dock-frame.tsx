'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useReducedMotion } from '@/lib/use-media-query';
import { MascotCanvas } from './mascot-canvas';
import type { MascotCue } from './rive-asset';
import type { MascotMood } from '@/services/nutrition/mascot';

/**
 * Where the companion stands.
 *
 * Bottom right, ON the tab bar rather than beside it: the figure is drawn 39 px
 * into its 144 px box, which puts the break at his knees — `bg-veil` +
 * `backdrop-blur-md` take the shins and the shadow underneath and soften them
 * into the glass.
 *
 * That only works from this exact layer: above the scrim (z-20), which would
 * otherwise wash him into the background, and below the bar (z-30), which has
 * to be the thing doing the blurring. No other z-index produces the effect.
 *
 * The band is zero-height and centred on the `max-w-lg` column, the same trick
 * `bottom-nav.tsx` uses for its items: on a wide screen he stands at the edge of
 * the column he belongs to instead of floating in the empty gutter.
 *
 * HE STEPS OUT AND HE STEPS BACK. The entrance is this element sliding up while
 * the drawing plays its walk cycle — the walk is on the spot, so neither half
 * reads as walking without the other. It waits for `MascotCanvas` to report a
 * loaded file, because there is no still frame behind it any more: before that
 * there is nothing to see, and an empty 144 px box that still took taps would
 * be a trap in the corner. The same transform takes him away while the page is
 * scrolled: a companion that sat on top of the last card would be furniture in
 * the way, and one that vanished entirely would be a bug.
 *
 * UNDER `prefers-reduced-motion: reduce` THERE IS NO COMPANION. The drawing is
 * the only depiction there is, and it is the one thing that preference rules
 * out, so the whole dock stays away — sentence and sheet with it. Every screen
 * still says what it has to say in its own text.
 *
 * No health data reaches the canvas. The sentence beside him and the panel
 * inside the sheet arrive as server markup through `chip` and `panel`.
 */

/** Scroll movement that counts as intent rather than as a thumb resting. */
const SCROLL_THRESHOLD = 8;

/** Quiet again this long after the last scroll event. */
const SETTLE_MS = 600;

export function MascotDockFrame({
  mood,
  pulse,
  label,
  logDate,
  chip,
  panel,
}: {
  mood: MascotMood;
  pulse: {
    foodGrams: number;
    dosesAnswered: number;
    dosesOpen: number;
    dayLogSaved: boolean;
  };
  /** Mood and sentence in one string, for anyone who cannot see the face. */
  label: string;
  /** Silence is remembered per logical day, so tomorrow starts talking again. */
  logDate: string;
  chip: ReactNode;
  panel: ReactNode;
}) {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [tucked, setTucked] = useState(false);
  const silent = useSyncExternalStore(subscribeQuiet, () => isQuiet(logDate), () => false);
  const [cue, setCue] = useState<MascotCue | null>(null);
  const [cueToken, setCueToken] = useState(0);

  const previous = useRef<typeof pulse | null>(null);

  const fire = useCallback((next: MascotCue) => {
    setCue(next);
    setCueToken((token) => token + 1);
  }, []);

  /*
   * Step out when there is something to step out with.
   *
   * `MascotCanvas` calls this from `onLoad`, so the slide-up and the walk cycle
   * begin on the same frame. Stable identity on purpose: the canvas holds this
   * for the whole life of its Rive instance and deliberately keeps it out of the
   * effect's dependencies, so a new function every render would be a lie about
   * what it is holding.
   */
  const onReadyChange = useCallback(
    (next: boolean) => {
      setReady(next);
      if (next) fire('entrance');
    },
    [fire]
  );

  /*
   * React to what the person did, by watching numbers rather than by having
   * every form announce itself.
   *
   * `revalidateDay()` and `revalidateMedications()` already re-render this tree
   * after each of these actions, so the new counter arrives on its own. Three
   * forms stay untouched, and nothing about a meal beyond "there is one more"
   * ever reaches this island.
   */
  useEffect(() => {
    const before = previous.current;
    previous.current = pulse;
    if (before === null) return;

    if (pulse.foodGrams > before.foodGrams) fire('logged');
    // The last one, not every one: three small celebrations a day for three
    // tablets would wear out in a week. Answering the last open dose is a
    // finished thing, and the only adherence the app can honestly cheer.
    else if (pulse.dosesAnswered > before.dosesAnswered && pulse.dosesOpen === 0)
      fire('dose');
    else if (pulse.dayLogSaved && !before.dayLogSaved) fire('closed');
    // `fire` is stable, so this still runs only when a counter moves.
  }, [pulse, fire]);

  // Out of the way while reading, back when the page settles.
  useEffect(() => {
    if (reduced) return;
    let last = window.scrollY;
    let settle: ReturnType<typeof setTimeout> | null = null;

    const onScroll = () => {
      const y = window.scrollY;
      const delta = y - last;
      if (Math.abs(delta) > SCROLL_THRESHOLD) {
        setTucked(delta > 0 && y > 0);
        last = y;
      }
      if (settle !== null) clearTimeout(settle);
      settle = setTimeout(() => setTucked(false), SETTLE_MS);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (settle !== null) clearTimeout(settle);
    };
  }, [reduced]);

  const hidden = !ready || tucked;

  // The drawing is the whole depiction, so without it there is no dock at all.
  if (reduced) return null;

  return (
    <div
      style={{ bottom: 'var(--nav-h)', viewTransitionName: 'site-mascot' }}
      className="pointer-events-none fixed inset-x-0 z-[25] mx-auto max-w-lg print:hidden [@media(max-height:600px)]:hidden"
    >
      <div
        className={`absolute -bottom-[39px] right-3 flex items-end justify-end gap-2 transition-transform duration-450 ease-out-soft ${
          hidden ? 'pointer-events-none' : 'pointer-events-auto'
        }`}
        style={{ transform: hidden ? 'translateY(120%)' : 'none' }}
      >
        {chip && !silent ? (
          <div className="chip-collapse mb-12 max-w-[11rem] rounded-card border border-line bg-card px-3 py-2 shadow-float">
            {chip}
          </div>
        ) : null}

        <Sheet>
          {/*
           * `size-36` is the only place the figure's size is written down. The
           * canvas sizes its drawing surface from this box, so 144 px lives
           * here and nowhere else.
           */}
          <SheetTrigger
            aria-label={label}
            className="relative block size-36 shrink-0 overflow-hidden"
          >
            <MascotCanvas
              mood={mood}
              cue={cue}
              cueToken={cueToken}
              onReadyChange={onReadyChange}
            />
          </SheetTrigger>
          <SheetContent title="Begleiter">
            {panel}
            <div className="mb-4 mt-2">
              <button
                type="button"
                onClick={() => silence(logDate)}
                disabled={silent}
                className="tap w-full rounded-control border border-line px-3 text-sm text-muted disabled:opacity-60"
              >
                {silent
                  ? 'Heute schon still gestellt'
                  : 'Heute nicht mehr ansprechen'}
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

/*
 * "Be quiet for the rest of today", kept in localStorage and read through
 * `useSyncExternalStore` rather than through an effect — the server renders a
 * talking companion, the client corrects it on hydration, and there is no
 * mismatch because `getServerSnapshot` says so out loud.
 *
 * localStorage rather than a column: what is stored is a date and the word
 * quiet. No nutrient, no medication, no meal — nothing that would make a health
 * record out of a preference, and no migration for a switch that resets itself
 * every night.
 */
const listeners = new Set<() => void>();
let cached: { key: string; value: boolean } | null = null;

function quietKey(logDate: string): string {
  return `companion:quiet:${logDate}`;
}

function subscribeQuiet(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Cached because React may call a snapshot many times per render. */
function isQuiet(logDate: string): boolean {
  const key = quietKey(logDate);
  if (cached?.key === key) return cached.value;
  let value = false;
  try {
    value = localStorage.getItem(key) !== null;
  } catch {
    // A browser that refuses storage simply keeps a talkative companion.
  }
  cached = { key, value };
  return value;
}

function silence(logDate: string): void {
  try {
    localStorage.setItem(quietKey(logDate), '1');
  } catch {
    // Then he is quiet until this page is left. Good enough.
  }
  cached = { key: quietKey(logDate), value: true };
  for (const listener of listeners) listener();
}

