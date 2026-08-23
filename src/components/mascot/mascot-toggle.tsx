'use client';

import { useOptimistic, useTransition } from 'react';
import { Smile, SmilePlus } from 'lucide-react';
import { toast } from 'sonner';
import { setShowMascotFigure } from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/lib/use-media-query';
import { setLeaving } from './dock-visibility';

/**
 * Send the figure away, and fetch him back, from wherever you happen to be.
 *
 * This is in the header rather than in the tab bar or on the drawing itself,
 * and each of those was ruled out rather than overlooked. A sixth tab does
 * not fit — `bottom-nav.tsx` says so four times over, and its active indicator
 * is wired to `w-1/5`. A long press on the drawing would be the only pointer
 * gesture in the app besides the chart scrub, and it would have to fight the
 * Radix dialog click on a 144 px trigger. The header had an `action` slot
 * standing empty on every screen of the group, which is exactly the reach this
 * needs: it has to work in the direction where there is no figure to tap.
 *
 * It writes a column and not `localStorage`, unlike the "quiet for today" key
 * next to it: staying away is the kind of preference that should survive the
 * night and the device, and one that resets every morning would have to be
 * tapped every morning.
 *
 * Optimistic, like the three switches in settings — the icon flips on the tap
 * and the drawing follows when the tree re-renders. `setLeaving` is what fills
 * that gap: without it the figure would blink out instead of stepping back.
 *
 * NOT SHOWN UNDER `prefers-reduced-motion: reduce`. The figure never renders
 * there at all, so this button would write a real column and change nothing on
 * screen — an action with no observable effect, which reads as broken however
 * honest the write is. The labelled row in settings stays reachable, because a
 * preference is allowed to be a preference; a button in the chrome is a verb.
 * The cost is that it is server-rendered before the media query is known and
 * leaves again on hydration, which is the same trade `mascot-dock-frame.tsx`
 * already makes one line above its own `if (reduced) return null`.
 */
export function MascotToggle({ enabled }: { enabled: boolean }) {
  const reduced = useReducedMotion();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(enabled);

  function toggle() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      // Duck behind the bar now; the server render removes him a beat later,
      // by which time he is already out of sight.
      setLeaving(!next);
      const result = await setShowMascotFigure({ showMascotFigure: next });
      if (!result.ok) {
        setLeaving(false);
        toast.error(result.error);
      }
    });
  }

  /*
   * Two signals, not one. The icon changes AND `aria-pressed` carries the
   * state, because the label names the ACTION — which is what an icon button
   * should say — and the state has to come from somewhere else.
   *
   * A face rather than a cat, for the reason `c3b2839` moved the poster
   * fallback to faces: character-neutral, so swapping the artwork does not
   * leave behind an icon of the previous mascot. The plus means "bring one
   * back".
   */
  const Icon = optimistic ? Smile : SmilePlus;

  if (reduced) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      disabled={pending}
      aria-pressed={optimistic}
      aria-label={optimistic ? 'Figur ausblenden' : 'Figur zeigen'}
      className={optimistic ? 'text-fg' : 'text-muted'}
    >
      <Icon className="size-5" strokeWidth={optimistic ? 2.2 : 1.8} />
    </Button>
  );
}
