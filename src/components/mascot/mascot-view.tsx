import Link from 'next/link';
import type { MascotBond, MascotState } from '@/services/nutrition/mascot';
import type { NextStep } from '@/services/nutrition/next-step';
import { mascotCopy, type MascotScope } from '@/lib/mascot-copy';

/**
 * What the mascot has to say, wherever it says it.
 *
 * Server markup throughout: the mood word, the sentence, the caveat and the
 * suggestion all arrive in the HTML. With JavaScript off, with reduced motion
 * on, or with no artwork in the repository at all, this still says everything
 * it has to say.
 *
 * THERE IS NO DRAWING IN HERE ANY MORE, and that is the point. The figure
 * stands in one place — the dock in the bottom right corner — because a
 * companion that appears three times on one screen, twice as a still frame, is
 * an ornament in a list rather than somebody looking back. What used to sit
 * beside these words now sits in the corner and reacts; the words stayed where
 * they are readable.
 *
 * Two variants, and the difference is only how much is said: `stage` carries
 * the caveat, the suggestion and the bond, `whisper` is a line and at most a
 * follow-up.
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
      <div className={`min-w-0 ${className}`}>
        <p className="text-sm text-fg">{copy.headline}</p>
        {copy.stepText ? (
          <p className="text-xs text-muted">{copy.stepText}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`min-w-0 ${className}`}>
      {/* The mood as a word. Never omitted — CLAUDE.md: colour never carries a
       * value on its own, and a face carries one no better. */}
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
  );
}
