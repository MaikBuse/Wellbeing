import { NUTRIENT_KEYS, type NutrientKey } from '@/lib/nutrients';
import type { LogDate } from '@/lib/time';
import { emptyDayNutrients } from '../aggregate';
import type { DayNutrients, NutrientItemRow, NutrientTotal } from '../types';
import type { TargetValue } from '../targets/types';

/** A total with full coverage unless said otherwise. */
export function total(
  value: number | null,
  opts: { coverage?: number; fromSupplement?: number } = {}
): NutrientTotal {
  const coverage = opts.coverage ?? 1;
  const fromSupplement = opts.fromSupplement ?? 0;
  const combined =
    value === null ? (fromSupplement > 0 ? fromSupplement : null) : value;
  return {
    fromFood: value === null ? null : value - fromSupplement,
    fromSupplement,
    total: combined,
    coveredGrams: coverage * 1000,
    coverage,
  };
}

/**
 * A day that clears every gate, so a test can vary one thing at a time.
 *
 * Two main slots, stated portions, catalog-linked grams — the boring case.
 */
export function dayWith(
  totals: Partial<Record<NutrientKey, NutrientTotal>>,
  opts: Partial<Omit<DayNutrients, 'totals' | 'logDate'>> & { logDate?: LogDate } = {}
): DayNutrients {
  const day = emptyDayNutrients(opts.logDate ?? '2026-08-20');
  for (const key of NUTRIENT_KEYS) {
    const given = totals[key];
    if (given) day.totals[key] = given;
  }
  day.totalGrams = opts.totalGrams ?? 1000;
  day.statedGrams = opts.statedGrams ?? 1000;
  day.portionEvidenceShare = opts.portionEvidenceShare ?? 1;
  day.blsGrams = opts.blsGrams ?? 1000;
  day.blsGramsShare = opts.blsGramsShare ?? 1;
  day.mainSlots = opts.mainSlots ?? 2;
  day.itemsWithOverriddenMacros = opts.itemsWithOverriddenMacros ?? 0;
  return day;
}

export function minTarget(min: number, extra: Partial<TargetValue> = {}): TargetValue {
  return {
    direction: 'min',
    min,
    max: null,
    bandMax: null,
    unit: 'g',
    cadence: 'daily',
    sourceKeys: ['dach'],
    rationaleDe: 'Testziel',
    origin: 'derived',
    unavailableReason: null,
    ...extra,
  };
}

export function maxTarget(max: number, extra: Partial<TargetValue> = {}): TargetValue {
  return {
    direction: 'max',
    min: null,
    max,
    bandMax: null,
    unit: 'g',
    cadence: 'daily',
    sourceKeys: ['dach'],
    rationaleDe: 'Testziel',
    origin: 'derived',
    unavailableReason: null,
    ...extra,
  };
}

export function item(
  overrides: Partial<NutrientItemRow> & Pick<NutrientItemRow, 'grams'>
): NutrientItemRow {
  return {
    logDate: '2026-08-20',
    slot: 'lunch',
    snapshot: {},
    per100: null,
    hasStatedAmount: true,
    wasOverridden: false,
    ...overrides,
  };
}

/**
 * An item in the shape `quickAddFood` actually writes.
 *
 * `quantity 1`, `unit 'portion'`, `portionId null` — which `hasStatedAmount`
 * reads as "no amount was stated" — and no catalog link. The defaults above are
 * the opposite of this on both counts, which is why the day screen could ship
 * with four permanently empty bars and a green test suite.
 */
export function quickAddItem(
  overrides: Partial<NutrientItemRow> & Pick<NutrientItemRow, 'grams'>
): NutrientItemRow {
  return item({ hasStatedAmount: false, ...overrides });
}
