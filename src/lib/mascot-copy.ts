import { NUTRIENT_META } from '@/lib/nutrients';
import { formatAmount, formatTarget } from '@/lib/nutrition-goals';
import type { CompanionNote } from '@/services/companion/agenda';
import type { CompletenessBlockKey } from '@/services/progress/types';
import type {
  MascotBond,
  MascotMood,
  MascotQuiet,
  MascotState,
} from '@/services/nutrition/mascot';
import type { NextStep } from '@/services/nutrition/next-step';

/**
 * Every German sentence the mascot says. Presentation only — no arithmetic.
 *
 * Separate from `mascot.ts` for the same reason `nutrition-goals.ts` is
 * separate from `score.ts`: the decision of WHICH verdict to show is testable
 * arithmetic, and the wording of it is a judgement call that changes far more
 * often. Keeping them apart means a reworded sentence cannot alter a mood.
 *
 * The tone is deliberately flat. This screen is opened by someone who may be in
 * a flare, and a cheering mascot on a bad morning is worse than a quiet one.
 * Nothing here congratulates, nothing here scolds, and nothing here says
 * anything about a day the record cannot support — the four `quiet` sentences
 * exist precisely so that "I cannot tell" has words of its own instead of
 * defaulting to bad news.
 *
 * `wording.test.ts` scans this file: no "Mangel" (a diagnosis this app cannot
 * make), no "verpasst", no "gescheitert", no "versagt".
 */

export type MascotScope = 'day' | 'meal' | 'close' | 'week';

/**
 * The mood in words, and it is never optional.
 *
 * CLAUDE.md: colour never carries a value on its own. The same holds for a
 * face — this label sits next to the figure in every variant, so the state is
 * readable without seeing the drawing at all.
 */
export const MOOD_LABEL: Record<MascotMood, string> = {
  happy: 'zufrieden',
  concerned: 'aufmerksam',
  curious: 'neugierig',
  neutral: 'ruhig',
};

/*
 * "aufmerksam", not "besorgt".
 *
 * The state behind it is one measured value above one limit. A worried face is
 * the drawing's job; the word next to it should say what happened, and being
 * over a salt limit on one day is a thing to notice rather than a thing to be
 * anxious about. The stronger word would also be the one read on the day
 * someone is already unwell.
 */

const QUIET_HEADLINE: Record<MascotQuiet, string> = {
  kein_profil: 'Für Nährstoffziele fehlt noch dein Profil.',
  schub: 'Schubtag. Heute bewerte ich nichts.',
  zu_wenig_erfasst: 'Noch zu wenig erfasst, um etwas zu sagen.',
  zu_wenig_bekannt: 'Von den erfassten Mengen sind zu wenige Werte bekannt.',
};

const QUIET_DETAIL: Record<MascotQuiet, string | null> = {
  kein_profil: 'Ohne Profil gibt es keine Zielwerte, gegen die ich rechnen könnte.',
  schub: 'Ein Schubtag zählt weder als guter noch als schlechter Tag.',
  zu_wenig_erfasst:
    'Ein unvollständig erfasster Tag kann nur zu niedrig aussehen, nie zu hoch.',
  zu_wenig_bekannt:
    'Für die meisten Mengen fehlt der Katalogbezug, aus dem die Werte kommen.',
};

const HAPPY_HEADLINE: Record<MascotScope, string> = {
  day: 'Der Tag liegt im Ziel.',
  meal: 'Das passt gut zum bisherigen Tag.',
  close: 'Ein runder Tag.',
  week: 'Die Woche liegt überwiegend im Ziel.',
};

/** "diese Woche" for the two targets that are only meaningful over seven days. */
function when(cadence: 'daily' | 'weekly', scope: MascotScope): string {
  if (scope === 'week') return 'in dieser Woche';
  return cadence === 'weekly' ? 'in dieser Woche' : 'heute';
}

/** "deckt das ab" / "gut die Hälfte davon" / "einen Teil davon". */
function shareWord(share: number): string {
  if (share >= 0.9) return 'deckt das ab';
  if (share >= 0.45) return 'deckt gut die Hälfte davon';
  return 'deckt einen Teil davon';
}

export type MascotCopy = {
  /** Always present. The mood as a word, beside the drawing. */
  moodLabel: string;
  /** Always present. One sentence. */
  headline: string;
  /** The caveat or the numbers behind the headline. */
  detail: string | null;
  /** The one concrete thing to do, or nothing. */
  stepText: string | null;
  /** How long the two of you have been at this. Never a score. */
  bondText: string | null;
};

/**
 * The bond in words.
 *
 * No "Stufe 2 von 3", no points, and no countdown to the next stage — the
 * count it is built on can only grow, but a visible countdown would still turn
 * a companion into a progress bar. It names recorded days, which is the one
 * thing nothing about the food can take away.
 */
export function bondText(bond: MascotBond): string | null {
  if (bond.days < 1) return null;
  if (bond.days === 1) return 'Seit einem erfassten Tag dabei.';
  return `Seit ${bond.days} erfassten Tagen dabei.`;
}

export function mascotCopy(input: {
  state: MascotState;
  step: NextStep | null;
  scope: MascotScope;
  bond?: MascotBond | null;
}): MascotCopy {
  const { state, step, scope } = input;
  const focus = state.focus;

  const base: MascotCopy = {
    moodLabel: MOOD_LABEL[state.mood],
    headline: '',
    detail: null,
    stepText: null,
    bondText: input.bond ? bondText(input.bond) : null,
  };

  if (state.quiet !== null) {
    return {
      ...base,
      headline: QUIET_HEADLINE[state.quiet],
      detail: QUIET_DETAIL[state.quiet],
    };
  }

  if (state.mood === 'concerned' && focus !== null) {
    // "mindestens" whenever the day could only have understated the total —
    // over a limit is proven either way, the exact figure is not.
    const prefix = focus.isLowerBound ? 'mindestens ' : '';
    const measured = `${prefix}${formatAmount(focus.measured, focus.key)}`;
    return {
      ...base,
      headline: `${focus.labelDe} liegt über der Grenze.`,
      detail:
        focus.target === null
          ? null
          : `${measured} gegenüber ${formatTarget(focus.target, focus.key)}.`,
    };
  }

  if (state.mood === 'curious' && focus !== null) {
    const unit = NUTRIENT_META[focus.key];
    const headline =
      focus.remaining === null
        ? `Bei ${focus.labelDe} ist noch Platz.`
        : `${focus.labelDe}: ${formatAmount(focus.remaining, focus.key)} fehlen ${when(focus.cadence, scope)} noch.`;

    return {
      ...base,
      headline,
      detail:
        focus.target === null
          ? null
          : `Ziel: ${formatTarget(focus.target, focus.key)}.`,
      stepText:
        step === null
          ? null
          : `Eine Portion ${step.name} (${formatGrams(step.portionGrams)}) ${shareWord(step.shareOfGap)} — etwa ${formatAmount(step.perPortion, focus.key)} ${unit.labelDe}.`,
    };
  }

  if (state.mood === 'happy') {
    return { ...base, headline: HAPPY_HEADLINE[scope] };
  }

  return { ...base, headline: 'Ich schaue mit.' };
}

/** Portion weights are whole grams here; nobody needs 59,5 g of oats. */
function formatGrams(grams: number): string {
  return `${Math.round(grams)} g`;
}

/*
 * The two topics that are not about food.
 *
 * They live here rather than in a second copy file because `wording.test.ts`
 * scans this path, and because the tone has to match: the figure says the same
 * kind of sentence about an open dose as it does about a nutrient, or it turns
 * into two different characters depending on the subject.
 *
 * Nothing here scolds. An open dose is "noch offen", never the other word — a
 * dose that was deliberately skipped is a recorded decision, and one that was
 * simply not reached yet is not a failure at seven in the evening either.
 */

const RECORDING_HEADLINE: Record<CompletenessBlockKey, string> = {
  food: 'Vom Essen ist heute noch nicht alles erfasst.',
  check: 'Im Tagescheck fehlen noch Werte.',
  complaints: 'Zum Befinden steht für heute noch nichts.',
  meds: 'Bei den Medikamenten ist für heute noch etwas offen.',
};

export type NoteCopy = { headline: string; detail: string | null };

/**
 * A note in words. Returns null for the nutrient topic, whose sentence comes
 * from `mascotCopy` — there is exactly one place that phrases a verdict about
 * food, and it is above this line.
 */
export function noteCopy(note: CompanionNote): NoteCopy | null {
  if (note.topic === 'medikation' && note.doses !== null) {
    const { overdue, due } = note.doses;
    const answered = due - note.doses.open;
    return {
      headline:
        overdue === 1
          ? 'Eine Dosis von heute ist noch offen.'
          : `${overdue} Dosen von heute sind noch offen.`,
      detail:
        due > overdue
          ? `${answered} von ${due} für heute sind beantwortet.`
          : null,
    };
  }

  if (note.topic === 'erfassen' && note.missing !== null) {
    return {
      headline: RECORDING_HEADLINE[note.missing.block],
      // The phrase verbatim from `dayCompleteness`, so this and the chips in
      // `streak-hero.tsx` cannot drift apart.
      detail: `Offen: ${note.missing.phrase}.`,
    };
  }

  return null;
}
