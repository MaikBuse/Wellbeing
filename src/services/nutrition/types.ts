import type { NutrientKey } from '@/lib/nutrients';
import type { MealSlotKey } from '@/lib/scales';
import type { LogDate } from '@/lib/time';
import type { TargetValue } from './targets/types';

/** One logged item, with both nutrient sources attached. */
export type NutrientItemRow = {
  logDate: LogDate;
  slot: MealSlotKey;
  grams: number;
  /** The frozen `meal_item` values, by nutrient key. null = not measured. */
  snapshot: Partial<Record<NutrientKey, number | null>>;
  /**
   * Per-100 catalog values, by nutrient key. `null` for the whole object when
   * the food has no `bls_catalog_id` — which is different from a catalog entry
   * whose individual value was never measured.
   */
  per100: Partial<Record<NutrientKey, number | null>> | null;
  /** A named portion, a quantity other than one, or a non-default unit. */
  hasStatedAmount: boolean;
  /** The food's macros were hand-corrected; its micros still come from the BLS. */
  wasOverridden: boolean;
};

/** What a supplement contributed on a day, already in the nutrient's own unit. */
export type SupplementContribution = {
  logDate: LogDate;
  nutrientKey: NutrientKey;
  amount: number;
};

export type NutrientTotal = {
  /** From food. null means nothing was measured for it all day — never 0. */
  fromFood: number | null;
  fromSupplement: number;
  /** fromFood + fromSupplement, or the supplement alone, or null. */
  total: number | null;
  /** Grams of the day that carried a value for THIS nutrient. */
  coveredGrams: number;
  /** coveredGrams / totalGrams, 0..1. */
  coverage: number;
};

export type DayNutrients = {
  logDate: LogDate;
  totals: Record<NutrientKey, NutrientTotal>;
  totalGrams: number;
  /** Grams whose amount was actually stated rather than defaulted. */
  statedGrams: number;
  portionEvidenceShare: number;
  /** Grams from foods that have a catalog link at all. */
  blsGrams: number;
  blsGramsShare: number;
  /** Distinct main meal slots recorded. Under-documentation guard. */
  mainSlots: number;
  itemsWithOverriddenMacros: number;
};

export type TargetStatus = 'met' | 'missed' | 'exceeded' | 'unknown';

export type NutrientAssessment = {
  key: NutrientKey;
  target: TargetValue;
  total: NutrientTotal;
  status: TargetStatus;
  /** value / target, for ranking how far off a nutrient usually is. */
  ratio: number | null;
  /**
   * True when the measured value can only be an underestimate — an incompletely
   * recorded day never overstates intake.
   */
  isLowerBound: boolean;
  /** 0..1, or null when the nutrient is not assessable. */
  attainment: number | null;
  /** Counts towards the day score. */
  scored: boolean;
};

export type DayUnscorableReason =
  | 'zu_wenig_erfasst'
  | 'zu_wenig_bekannt'
  | 'kein_profil';

export type NutritionDay = {
  logDate: LogDate;
  /** null = not defensible. NEVER 0 for "unknown". */
  score: number | null;
  reason: DayUnscorableReason | null;
  /** A flare day is neutral: out of the numerator AND the denominator. */
  isFlare: boolean;
  nutrients: NutrientAssessment[];
  assessableCount: number;
};
