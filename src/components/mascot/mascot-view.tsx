import Link from 'next/link';
import type { MascotBond, MascotState } from '@/services/nutrition/mascot';
import type { NextStep } from '@/services/nutrition/next-step';
import { mascotCopy, type MascotScope } from '@/lib/mascot-copy';
import { MascotPoster } from './mascot-poster';
import { MascotCanvas } from './mascot-canvas';
import { HAS_RIVE } from './artwork';

/**
 * The mascot, wherever it appears.
 *
 * A server component, and everything readable in it is server markup: the mood
 * word, the sentence, the caveat and the suggestion all arrive in the HTML. The
 * animated canvas is an optional layer on top of this, not a precondition for
 * it — with JavaScript off, with reduced motion on, or with no artwork in the
 * repository, this still says everything it has to say.
 *
 * Two variants and the difference is not decorative:
 *
 *  - `stage` is the one that may animate. One per route, at most, and even then
 *    only if the .riv is actually shipped — the canvas sits ON TOP of the
 *    poster, so a file that fails to load leaves the still frame in place.
 *  - `whisper` is a line of text with a small still frame. No client JS at all,
 *    which is why the two appearances on the meal section and the daily check
 *    cost the day screen nothing.
 */
export function MascotView({
  state,
  step,
  scope,
  variant,
  bond = null,
  className = '',
}: {
  state: MascotState;
  step: NextStep | null;
  scope: MascotScope;
  variant: 'stage' | 'whisper';
  bond?: MascotBond | null;
  className?: string;
}) {
  const copy = mascotCopy({ state, step, scope, bond });

  if (variant === 'whisper') {
    return (
      <div className={`flex items-start gap-2 ${className}`}>
        <MascotPoster mood={state.mood} size={44} />
        <div className="min-w-0 pt-1">
          <p className="text-sm text-fg">{copy.headline}</p>
          {copy.stepText ? (
            <p className="text-xs text-muted">{copy.stepText}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const size = 72;

  return (
    <div className={`flex items-start gap-3 ${className}`}>
      {/* Fixed box, poster underneath, canvas over it. Nothing shifts when the
       * animation appears, and nothing is missing if it never does. */}
      <span
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <MascotPoster mood={state.mood} size={size} />
        {HAS_RIVE ? <MascotCanvas mood={state.mood} size={size} /> : null}
      </span>
      <div className="min-w-0 flex-1">
        {/* The mood as a word. Never omitted — see MascotPoster. */}
        <p className="text-eyebrow uppercase text-muted">{copy.moodLabel}</p>
        <p className="text-sm font-medium text-fg">{copy.headline}</p>
        {copy.detail ? (
          <p className="mt-0.5 text-xs text-muted">{copy.detail}</p>
        ) : null}
        {copy.stepText && step ? (
          <Link
            href={`/foods/${step.foodId}`}
            className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-primary-strong"
          >
            {copy.stepText}
          </Link>
        ) : null}
        {copy.bondText ? (
          <p className="mt-0.5 text-xs text-muted">{copy.bondText}</p>
        ) : null}
      </div>
    </div>
  );
}
