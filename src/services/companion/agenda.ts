import type { CompletenessBlockKey, DayCompleteness } from '@/services/progress/types';
import type { MascotState } from '@/services/nutrition/mascot';

/**
 * What the companion is about right now, across all three things it may speak
 * about, in one defensible order.
 *
 * This module decides WHICH topic speaks. It decides nothing about the topics
 * themselves: the nutrient verdict was made in `coverage.ts` and `score.ts` and
 * picked by `mascot.ts`, the open doses were rebuilt by `expandDueDoses`, and
 * the recording gap was measured by `dayCompleteness`. Nothing here re-derives
 * any of them, for the same reason `mascot.ts` refuses to compare a total
 * against a target itself: a second opinion in a second place is how two screens
 * start disagreeing about the same day.
 *
 * Pure. No clock, no database, no randomness — `agenda.test.ts` scans this file
 * for `new Date` and `Math.random` and fails on either, exactly as
 * `mascot.test.ts` does for its two.
 */

export type CompanionTopic = 'ernaehrung' | 'medikation' | 'erfassen';

/** Section anchors on the day screen. The same ones `streak-hero.tsx` links to. */
export type CompanionAnchor = '#mahlzeiten' | '#medikamente' | '#tagescheck';

export type CompanionNote = {
  topic: CompanionTopic;
  /**
   * Where to go about it, or null when there is nothing to do — a note about a
   * limit that has already been passed has no repair, and offering one would be
   * the app pretending the day can be taken back.
   */
  anchor: CompanionAnchor | null;
  /** Only on a 'medikation' note. */
  doses: { open: number; overdue: number; due: number } | null;
  /**
   * Only on an 'erfassen' note: the short German phrase `dayCompleteness`
   * already produced ("noch eine Hauptmahlzeit", "2 von 5 Kernwerten").
   *
   * Carried rather than re-worded on purpose. These phrases are shown as chips
   * in `streak-hero.tsx` today; if the companion said the same thing in its own
   * words, one of the two would drift.
   */
  missing: { block: CompletenessBlockKey; phrase: string } | null;
};

export type CompanionAgenda = {
  /**
   * The one thing the corner says. Never null: with nothing else to report the
   * figure falls back to the day's mood, which always has a sentence — the four
   * `quiet` states exist precisely so that "I cannot tell" has words.
   */
  primary: CompanionNote;
  /** Everything else, for the sheet. */
  more: CompanionNote[];
};

export type DoseTally = {
  due: number;
  answered: number;
  /** Due and neither taken nor skipped. */
  open: number;
  /** Open, and the time of day it was planned for has passed. */
  overdue: number;
};

export const EMPTY_DOSES: DoseTally = {
  due: 0,
  answered: 0,
  open: 0,
  overdue: 0,
};

const NUTRITION_NOTE: CompanionNote = {
  topic: 'ernaehrung',
  anchor: null,
  doses: null,
  missing: null,
};

/** The nutrient note earns an anchor only when there is something to add. */
function nutritionNote(state: MascotState | null): CompanionNote {
  const actionable = state?.mood === 'curious' && state.focus !== null;
  return actionable ? { ...NUTRITION_NOTE, anchor: '#mahlzeiten' } : NUTRITION_NOTE;
}

function medicationNote(doses: DoseTally): CompanionNote {
  return {
    topic: 'medikation',
    anchor: '#medikamente',
    doses: { open: doses.open, overdue: doses.overdue, due: doses.due },
    missing: null,
  };
}

const BLOCK_ANCHOR: Record<CompletenessBlockKey, CompanionAnchor> = {
  food: '#mahlzeiten',
  check: '#tagescheck',
  complaints: '#tagescheck',
  meds: '#medikamente',
};

/**
 * The weakest recorded block of the day, or null when the day is complete.
 *
 * `share` ascending and the block order as the tie-break, so the same day never
 * names two different gaps — the same determinism rule `mascot.ts` follows.
 */
function recordingNote(completeness: DayCompleteness | null): CompanionNote | null {
  if (completeness === null) return null;
  const open = completeness.blocks.filter(
    (block) => block.applicable && block.missing !== null
  );
  if (open.length === 0) return null;

  const weakest = open.reduce((worst, block) =>
    block.share < worst.share ? block : worst
  );

  return {
    topic: 'erfassen',
    anchor: BLOCK_ANCHOR[weakest.key],
    doses: null,
    missing: { block: weakest.key, phrase: weakest.missing as string },
  };
}

export function companionAgenda(input: {
  mascot: MascotState | null;
  doses: DoseTally;
  completeness: DayCompleteness | null;
  isEvening: boolean;
}): CompanionAgenda {
  const { mascot, doses, completeness, isEvening } = input;

  const nutrition = nutritionNote(mascot);
  const medication = doses.overdue > 0 ? medicationNote(doses) : null;

  /*
   * Recording gaps are an evening topic and only an evening topic.
   *
   * At eleven in the morning a half-recorded day is not a gap, it is a day in
   * progress, and a companion that says so is nagging about a diary rather than
   * helping with one. `isEveningIn` is read by the caller, because this file
   * does not get a clock.
   */
  const recording = isEvening ? recordingNote(completeness) : null;

  /*
   * The order, and why it is this one.
   *
   * 1. A measured value above a scored limit. The only PROVEN negative in the
   *    app: grams that were measured were really eaten, so `coverage.ts` holds
   *    it at any coverage. It also cannot be repaired today, which is why it
   *    outranks things that can — it is the one thing worth knowing now.
   * 2. A dose whose time has passed. Measured, repairable in the next minute,
   *    and no judgement of the person at all.
   * 3. A nutrient gap with a suggestion. Actionable, but only a proposal.
   * 4. A recording gap, in the evening. Last because it is about the diary
   *    rather than about the day.
   */
  const ranked: (CompanionNote | null)[] =
    mascot?.mood === 'concerned'
      ? [nutrition, medication, recording]
      : [medication, nutrition, recording];

  const notes = ranked.filter((note): note is CompanionNote => note !== null);
  const [primary, ...more] = notes;

  return { primary: primary ?? nutrition, more };
}
