/**
 * How thoroughly one logical day was recorded, 0-100 %.
 *
 * Separate from the streak on purpose. The streak answers "did she show up",
 * which has to stay reachable on a bad day; this answers "how much detail did
 * the day get", which is what actually decides whether a factor ever clears its
 * case-count gate. Folding the two into one number would force a single
 * threshold to serve both, and it would either shame someone through a flare or
 * stop asking for detail altogether.
 *
 * Four blocks, weighted equally. A block that cannot apply to the day is
 * DROPPED from the average rather than counted as zero — see the note on
 * `applicable` in `types.ts`.
 */
import { MAIN_MEAL_SLOTS, type MealSlotKey } from '@/lib/scales';
import { CORE_DAILY_FIELDS } from '@/lib/scales';
import type { LogDate } from '@/lib/time';
import type {
  CompletenessBlock,
  DayCompleteness,
  DayCoverage,
  DayDoses,
} from './types';

export const COMPLETENESS_LABELS = {
  food: 'Essen',
  check: 'Tagescheck',
  complaints: 'Befinden',
  meds: 'Medikamente',
} as const;

/** A day at or above this is "vollständig" for the milestone. */
export const COMPLETE_DAY_THRESHOLD = 90;

/**
 * Main slots needed for full credit on the food block.
 *
 * Two rather than three: a day with breakfast and dinner recorded is an honest
 * day of eating, and demanding all three would make lunch at the office an
 * unavoidable penalty.
 */
export const FULL_CREDIT_MAIN_SLOTS = 2;

function foodShare(slots: readonly MealSlotKey[]): number {
  if (slots.length === 0) return 0;
  const main = slots.filter((slot) =>
    (MAIN_MEAL_SLOTS as readonly MealSlotKey[]).includes(slot)
  ).length;
  // A lone snack or drink is a real entry but not a day's food, so it earns
  // half — enough to acknowledge the tap, not enough to look complete.
  if (main === 0) return 0.5;
  return Math.min(1, main / FULL_CREDIT_MAIN_SLOTS);
}

export function dayCompleteness(
  coverage: DayCoverage,
  doses: DayDoses
): DayCompleteness {
  const food = foodShare(coverage.slots);
  const check = coverage.coreFilled / CORE_DAILY_FIELDS.length;
  const complaints = coverage.hasWellbeing || coverage.hasSymptom ? 1 : 0;
  const medsApplicable = doses.due > 0;
  const meds = medsApplicable ? doses.answered / doses.due : 0;

  const blocks: CompletenessBlock[] = [
    {
      key: 'food',
      label: COMPLETENESS_LABELS.food,
      share: food,
      applicable: true,
      missing:
        food >= 1
          ? null
          : coverage.slots.length === 0
            ? 'noch keine Mahlzeit'
            : 'noch eine Hauptmahlzeit',
    },
    {
      key: 'check',
      label: COMPLETENESS_LABELS.check,
      share: check,
      applicable: true,
      missing:
        check >= 1
          ? null
          : `${CORE_DAILY_FIELDS.length - coverage.coreFilled} von ${CORE_DAILY_FIELDS.length} Kernwerten`,
    },
    {
      key: 'complaints',
      label: COMPLETENESS_LABELS.complaints,
      share: complaints,
      applicable: true,
      missing: complaints >= 1 ? null : 'Beschwerden noch offen',
    },
    {
      key: 'meds',
      label: COMPLETENESS_LABELS.meds,
      share: meds,
      applicable: medsApplicable,
      missing: !medsApplicable
        ? null
        : meds >= 1
          ? null
          : `${doses.due - doses.answered} von ${doses.due} Dosen offen`,
    },
  ];

  const applicable = blocks.filter((block) => block.applicable);
  const score =
    applicable.length === 0
      ? 0
      : Math.round(
          (applicable.reduce((sum, block) => sum + clamp(block.share), 0) /
            applicable.length) *
            100
        );

  return { logDate: coverage.logDate, score, blocks };
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Average score over a set of days. Null for an empty set. */
export function averageScore(days: readonly DayCompleteness[]): number | null {
  if (days.length === 0) return null;
  const total = days.reduce((sum, day) => sum + day.score, 0);
  return Math.round(total / days.length);
}

/**
 * The block that fell short most often — "woran es meistens lag".
 *
 * A count of days where the block was applicable and not full, so a block that
 * rarely applies cannot win by being rare. Null when nothing ever fell short.
 */
export function weakestBlock(
  days: readonly DayCompleteness[]
): { key: string; label: string; days: number } | null {
  const tally = new Map<string, { label: string; days: number }>();
  for (const day of days) {
    for (const block of day.blocks) {
      if (!block.applicable || block.share >= 1) continue;
      const entry = tally.get(block.key) ?? { label: block.label, days: 0 };
      entry.days++;
      tally.set(block.key, entry);
    }
  }
  let worst: { key: string; label: string; days: number } | null = null;
  for (const [key, entry] of tally) {
    if (!worst || entry.days > worst.days) {
      worst = { key, label: entry.label, days: entry.days };
    }
  }
  return worst;
}

/** Empty coverage for a day with no rows at all. */
export function emptyCoverage(logDate: LogDate): DayCoverage {
  return {
    logDate,
    slots: [],
    hasDailyLog: false,
    coreFilled: 0,
    hasWellbeing: false,
    hasSymptom: false,
  };
}
