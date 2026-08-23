import { describe, expect, it } from 'vitest';
import { maxTarget, minTarget } from '@/services/nutrition/__tests__/fixtures';
import type {
  MascotFocus,
  MascotMood,
  MascotQuiet,
  MascotState,
} from '@/services/nutrition/mascot';
import type { NextStep } from '@/services/nutrition/next-step';
import {
  MOOD_LABEL,
  bondText,
  mascotCopy,
  type MascotScope,
} from '../mascot-copy';

/**
 * Completeness, not prose taste.
 *
 * The failure this guards against is a `Record` lookup that silently returns
 * undefined and renders the word "undefined" on the day screen — which is the
 * kind of thing nobody notices until it happens on the one mood they rarely
 * see.
 */

const MOODS: MascotMood[] = ['happy', 'concerned', 'curious', 'neutral'];
const SCOPES: MascotScope[] = ['day', 'meal', 'close', 'week'];
const QUIETS: MascotQuiet[] = [
  'kein_profil',
  'schub',
  'zu_wenig_erfasst',
  'zu_wenig_bekannt',
];

const focus: MascotFocus = {
  key: 'fiber',
  labelDe: 'Ballaststoffe',
  kind: 'gap',
  cadence: 'daily',
  remaining: 12,
  target: minTarget(30),
  measured: 18,
  isLowerBound: false,
};

const step: NextStep = {
  foodId: 'a',
  name: 'Haferflocken',
  perPortion: 6,
  portionGrams: 60,
  shareOfGap: 0.5,
};

function state(over: Partial<MascotState> = {}): MascotState {
  return { mood: 'curious', focus, quiet: null, score: 60, ...over };
}

describe('mascotCopy', () => {
  it('has a mood word for every mood', () => {
    for (const mood of MOODS) {
      expect(MOOD_LABEL[mood], mood).toBeTruthy();
    }
  });

  it('produces one non-empty sentence for every mood and scope', () => {
    for (const mood of MOODS) {
      for (const scope of SCOPES) {
        for (const withFocus of [true, false]) {
          const copy = mascotCopy({
            state: state({ mood, focus: withFocus ? focus : null }),
            step: null,
            scope,
          });
          const label = `${mood}/${scope}/${withFocus}`;
          expect(copy.headline.length, label).toBeGreaterThan(3);
          expect(copy.moodLabel, label).toBeTruthy();
          for (const value of Object.values(copy)) {
            expect(String(value), label).not.toContain('undefined');
            expect(String(value), label).not.toContain('NaN');
          }
        }
      }
    }
  });

  it('has words for every reason it cannot say anything', () => {
    for (const quiet of QUIETS) {
      const copy = mascotCopy({
        state: state({ mood: 'neutral', focus: null, quiet }),
        step: null,
        scope: 'day',
      });
      expect(copy.headline, quiet).toBeTruthy();
      expect(copy.stepText, quiet).toBeNull();
    }
  });

  it('never suggests anything while it is staying quiet', () => {
    for (const quiet of QUIETS) {
      const copy = mascotCopy({
        state: state({ mood: 'neutral', quiet }),
        step,
        scope: 'day',
      });
      expect(copy.stepText, quiet).toBeNull();
    }
  });

  it('prints no number without a unit', () => {
    const copy = mascotCopy({ state: state(), step, scope: 'day' });
    expect(copy.headline).toContain('12 g');
    expect(copy.stepText).toContain('60 g');
    expect(copy.stepText).toContain('6 g');
  });

  it('says "diese Woche" for a weekly target', () => {
    const copy = mascotCopy({
      state: state({ focus: { ...focus, cadence: 'weekly' } }),
      step: null,
      scope: 'day',
    });
    expect(copy.headline).toContain('in dieser Woche');
  });

  /*
 * A 'limit' focus always comes from a max target — `status: 'exceeded'`
 * requires `target.max` — so the fixture has to be one, or the sentence reads
 * "gegenüber mindestens 30 g" about a limit.
 */
  const overLimit = (isLowerBound: boolean) =>
    mascotCopy({
      state: state({
        mood: 'concerned',
        focus: {
          ...focus,
          key: 'salt',
          labelDe: 'Salz',
          kind: 'limit',
          remaining: null,
          target: maxTarget(6),
          measured: 8.4,
          isLowerBound,
        },
      }),
      step: null,
      scope: 'day',
    });

  /* Over a limit is proven; the exact figure on a thin day is not. */
  it('says "mindestens" when the total can only be an underestimate', () => {
    expect(overLimit(true).detail).toBe('mindestens 8,4 g gegenüber höchstens 6 g.');
  });

  it('drops the hedge when the day is well covered', () => {
    expect(overLimit(false).detail).toBe('8,4 g gegenüber höchstens 6 g.');
  });

  it('scales the wording to how much a portion actually covers', () => {
    const full = mascotCopy({
      state: state(),
      step: { ...step, shareOfGap: 1 },
      scope: 'day',
    });
    const some = mascotCopy({
      state: state(),
      step: { ...step, shareOfGap: 0.2 },
      scope: 'day',
    });
    expect(full.stepText).not.toEqual(some.stepText);
  });
});

describe('bondText', () => {
  it('says nothing before the first recorded day', () => {
    expect(bondText({ stage: 0, days: 0 })).toBeNull();
  });

  it('counts days, never levels or points', () => {
    const text = bondText({ stage: 2, days: 34 }) ?? '';
    expect(text).toContain('34');
    expect(text).not.toMatch(/stufe|level|punkt/i);
  });

  it('gets the singular right', () => {
    expect(bondText({ stage: 0, days: 1 })).toContain('einem');
  });
});
