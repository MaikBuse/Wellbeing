import { NUTRIENT_META, type NutrientKey } from '@/lib/nutrients';
import type { TargetCadence, TargetValue } from './targets/types';
import { NUTRITION_GOOD_DAY } from './score';
import type { NutritionSummary } from './period';
import type { NutrientAssessment, NutritionDay } from './types';

/**
 * One mood, one focus, from a day that has already been assessed.
 *
 * The whole point of this file is that it adds no judgement of its own. Every
 * verdict it acts on was decided in `coverage.ts` and `score.ts`, which know
 * about coverage, about flare days and about the nutrients that must never be
 * called short. This file only picks which of those verdicts a face gets to
 * show.
 *
 * That is why the reading rule below is absolute: this module looks at
 * `status`, `attainment` and `ratio`, and NEVER compares `total.total` against
 * `target.min` or `target.max` itself. `assessNutrient` sets `status` to
 * 'unknown' for every nutrient with `showVerdict: false` — iron, folate,
 * energy, fat, the n-6:n-3 ratio — and re-deriving a comparison here would walk
 * straight past that. Iron is the case that matters: anaemia in RA is largely
 * anaemia of inflammation, and a worried face about iron pushes towards a
 * supplement that cannot work.
 *
 * Pure. No clock, no database, no randomness — `mascot.test.ts` scans this file
 * for `new Date` and `Math.random` and fails on either.
 */

export type MascotMood = 'happy' | 'concerned' | 'curious' | 'neutral';

/**
 * Why the mascot is saying nothing about the day.
 *
 * Kept separate from the mood on purpose: all five of these are `neutral`, but
 * they need different sentences. "No profile yet" is an invitation, a flare day
 * is a deliberate refusal to judge, and 'zu_wenig_erfasst' is a statement about
 * the record rather than about the food.
 */
export type MascotQuiet =
  | 'kein_profil'
  | 'schub'
  | 'zu_wenig_erfasst'
  | 'zu_wenig_bekannt';

export type MascotFocus = {
  key: NutrientKey;
  labelDe: string;
  /** 'gap' = below a minimum. 'limit' = over a scored upper bound. */
  kind: 'gap' | 'limit';
  /** From the target, so the sentence can say "diese Woche" for EPA+DHA. */
  cadence: TargetCadence;
  /**
   * What is still missing, in the nutrient's own unit.
   *
   * Only ever set for a 'gap' whose minimum and measured total are both known
   * AND still positive. Null means "no number anybody can defend", and
   * `rankNextStep` refuses to make a suggestion without one.
   */
  remaining: number | null;
  /**
   * Null for a window focus: `weakest` is a count of days on which a nutrient
   * fell short, not a measurement against one target, so there is no single
   * target it belongs to. `rankNextStep` refuses a suggestion without one.
   */
  target: TargetValue | null;
  /** What was measured, in the nutrient's own unit. Null over a window. */
  measured: number | null;
  /**
   * The measured value can only be an underestimate, so the text says
   * "mindestens" in front of it. Carried through from `evaluateTarget` rather
   * than re-derived, because the coverage rule lives there.
   */
  isLowerBound: boolean;
};

export type MascotState = {
  mood: MascotMood;
  focus: MascotFocus | null;
  quiet: MascotQuiet | null;
  /** For the sentence only. Never the sole carrier of anything. */
  score: number | null;
};

/** Days recorded, and the stage that follows from it. */
export type MascotBond = {
  stage: 0 | 1 | 2 | 3;
  days: number;
};

/** Recorded days at which the next stage begins. */
export const BOND_STAGE_DAYS = [0, 7, 30, 90] as const;

/**
 * How long the two of you have been at this.
 *
 * The input is `count(distinct log_date)` over the user's own meals, and it is
 * that rather than `summary.assessableDays` for one reason: `loadNutrition`
 * rolls a 90-day window, so an assessable-day count SHRINKS as old days fall
 * out of it, and a bond that can regress is exactly the loss aversion that
 * `streak.ts` and `score.ts` avoid everywhere else. A distinct-day count only
 * ever grows.
 *
 * It counts RECORDING, not eating well. Nothing about the food can take this
 * away, which is the entire idea.
 */
export function mascotBond(loggedDayCount: number): MascotBond {
  const days = Math.max(0, Math.floor(loggedDayCount));
  let stage: MascotBond['stage'] = 0;
  for (let i = BOND_STAGE_DAYS.length - 1; i >= 0; i -= 1) {
    if (days >= BOND_STAGE_DAYS[i]) {
      stage = i as MascotBond['stage'];
      break;
    }
  }
  return { stage, days };
}

function focusFrom(
  assessment: NutrientAssessment,
  kind: 'gap' | 'limit'
): MascotFocus {
  const { target, total } = assessment;
  // Only a positive, fully known shortfall becomes a number.
  const remaining =
    kind === 'gap' && target.min !== null && total.total !== null
      ? Math.max(0, target.min - total.total) || null
      : null;

  return {
    key: assessment.key,
    labelDe: NUTRIENT_META[assessment.key].labelDe,
    kind,
    cadence: target.cadence,
    remaining,
    target,
    measured: total.total,
    isLowerBound: assessment.isLowerBound,
  };
}

/**
 * Deterministic ordering, so the same day never shows two different faces.
 *
 * Same tie-break chain as `weakestNutrients`: the metric first, then the
 * display priority the day screen already uses, then the German label. Without
 * the last two, two nutrients with identical attainment would swap places on
 * re-render for no reason a reader could see.
 */
function byPriority(
  priority: readonly NutrientKey[]
): (a: NutrientAssessment, b: NutrientAssessment) => number {
  return (a, b) => {
    const ia = priority.indexOf(a.key);
    const ib = priority.indexOf(b.key);
    const ra = ia === -1 ? priority.length : ia;
    const rb = ib === -1 ? priority.length : ib;
    if (ra !== rb) return ra - rb;
    return NUTRIENT_META[a.key].labelDe.localeCompare(
      NUTRIENT_META[b.key].labelDe,
      'de'
    );
  };
}

export function mascotMoodForDay(input: {
  day: NutritionDay | null;
  blocked: 'kein_profil' | null;
  priority?: readonly NutrientKey[];
}): MascotState {
  const { day, blocked } = input;
  const priority = input.priority ?? [];
  const tie = byPriority(priority);

  if (blocked !== null) {
    return { mood: 'neutral', focus: null, quiet: blocked, score: null };
  }
  if (day === null) {
    return { mood: 'neutral', focus: null, quiet: null, score: null };
  }

  /*
   * A flare day outranks everything, including a breached limit.
   *
   * `score.ts` takes a flare day out of both the numerator and the denominator
   * — not a miss, not a free pass, simply not counted. A worried face on a
   * flare day would tell someone their flare was a dietary failure, which is
   * the one reading this whole feature exists to prevent.
   */
  if (day.isFlare) {
    return { mood: 'neutral', focus: null, quiet: 'schub', score: day.score };
  }

  /*
   * Over a limit beats "nothing is provable yet", and the order of these two
   * blocks IS the coverage asymmetry from `coverage.ts`.
   *
   * A breached upper bound holds at ANY coverage: grams that were measured were
   * really eaten, so more measurement can only push the total higher. A gap
   * holds only once the day is documented well enough, because an incomplete
   * record can only understate. So 'concerned' can appear on a day with no
   * score at all, and 'curious' can never.
   */
  const exceeded = day.nutrients.filter((n) => n.status === 'exceeded');
  if (exceeded.length > 0) {
    const worst = [...exceeded].sort(
      (a, b) => (b.ratio ?? 0) - (a.ratio ?? 0) || tie(a, b)
    )[0];
    return {
      mood: 'concerned',
      focus: focusFrom(worst, 'limit'),
      quiet: null,
      score: day.score,
    };
  }

  // Under-documentation is not under-nutrition: no face, no focus, a sentence
  // about the record instead.
  if (day.reason !== null) {
    const quiet: MascotQuiet =
      day.reason === 'kein_profil' ? 'kein_profil' : day.reason;
    return { mood: 'neutral', focus: null, quiet, score: null };
  }

  if (day.score !== null && day.score >= NUTRITION_GOOD_DAY) {
    return { mood: 'happy', focus: null, quiet: null, score: day.score };
  }

  const missed = day.nutrients.filter((n) => n.status === 'missed');
  const pool = missed.length > 0 ? missed : day.nutrients.filter((n) => n.scored);
  if (pool.length === 0) {
    return { mood: 'neutral', focus: null, quiet: null, score: day.score };
  }

  const weakest = [...pool].sort((a, b) => {
    const aa = a.attainment ?? Number.POSITIVE_INFINITY;
    const bb = b.attainment ?? Number.POSITIVE_INFINITY;
    return aa - bb || tie(a, b);
  })[0];

  return {
    mood: 'curious',
    focus: focusFrom(weakest, 'gap'),
    quiet: null,
    score: day.score,
  };
}

/** Share of assessable days at or above the good-day bar that reads as "good". */
export const WEEK_HAPPY_RATIO = 0.6;

/**
 * The same idea over a window, for the progress screen.
 *
 * Two differences from the day, both deliberate. There is no 'concerned':
 * `weakest` counts "missed" and "exceeded" in one bucket, so a worried face
 * over a week could not say which it was, and a week is not something anybody
 * can act on in the next hour anyway. And the whole thing is gated on having
 * enough assessable days — three good days out of three recorded is not a good
 * week, it is a thin one.
 */
export function mascotMoodForWeek(input: {
  summary: NutritionSummary;
  minEvaluableDays: number;
}): MascotState {
  const { summary, minEvaluableDays } = input;

  if (summary.assessableDays < minEvaluableDays || summary.ratio === null) {
    return {
      mood: 'neutral',
      focus: null,
      quiet: 'zu_wenig_erfasst',
      score: null,
    };
  }

  if (summary.ratio >= WEEK_HAPPY_RATIO) {
    return { mood: 'happy', focus: null, quiet: null, score: summary.average };
  }

  const weakest = summary.weakest[0];
  return {
    mood: 'curious',
    focus:
      weakest === undefined
        ? null
        : {
            key: weakest.key,
            labelDe: weakest.labelDe,
            kind: 'gap',
            cadence: 'daily',
            remaining: null,
            target: null,
            measured: null,
            isLowerBound: true,
          },
    quiet: null,
    score: summary.average,
  };
}
