import Image from 'next/image';
import { Frown, Laugh, Meh, Smile } from 'lucide-react';
import type { MascotMood } from '@/services/nutrition/mascot';
import { POSTER_SRC } from './rive-asset';
import { HAS_POSTERS } from './artwork';

/**
 * The still frame. Server-rendered, always present, never the whole message.
 *
 * `alt=""` on purpose: the mood is already written out beside it in
 * `MascotView`, so describing the picture would make a screen reader say the
 * same thing twice. The rule from CLAUDE.md — colour never carries a value on
 * its own — applies to a face just as much, and the word next to it is what
 * carries it.
 *
 * `unoptimized`, for the reason spelled out in `brand/logo.tsx`: the runner
 * stage of the Dockerfile never runs `npm ci`, so sharp is not guaranteed to
 * exist.
 *
 * Falls back to a glyph while the stills are not shipped, so this never renders
 * a broken image — `artwork.ts` decides by looking rather than by a constant
 * somebody has to remember to flip.
 */

/*
 * Faces rather than anything character-specific, so replacing the artwork does
 * not leave a fallback that depicts the previous mascot.
 */
const GLYPH = {
  happy: Laugh,
  curious: Smile,
  concerned: Frown,
  neutral: Meh,
} as const;

/* Only 'concerned' leaves the calm tone, and it is the only mood that should. */
const TINT: Record<MascotMood, string> = {
  happy: 'text-primary-strong',
  curious: 'text-primary-strong',
  concerned: 'text-danger',
  neutral: 'text-muted',
};

export function MascotPoster({
  mood,
  size,
  className = '',
}: {
  mood: MascotMood;
  size: number;
  className?: string;
}) {
  // Fixed box either way, so swapping the glyph for the artwork shifts nothing.
  const box = { width: size, height: size };

  if (HAS_POSTERS) {
    return (
      <Image
        unoptimized
        src={POSTER_SRC[mood]}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 ${className}`}
      />
    );
  }

  const Glyph = GLYPH[mood];
  return (
    <span
      aria-hidden
      style={box}
      className={`flex shrink-0 items-center justify-center rounded-pill bg-bg-sunken ${TINT[mood]} ${className}`}
    >
      <Glyph style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}
