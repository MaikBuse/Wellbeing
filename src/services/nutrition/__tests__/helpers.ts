import type { NutrientKey } from '@/lib/nutrients';
import { nutritionDay } from '../score';
import type { DayNutrients } from '../types';
import type { TargetValue } from '../targets/types';
import { maxTarget, minTarget } from './fixtures';

/**
 * A small target set for score tests.
 *
 * Five entries rather than the full catalogue, so the day gate needs four
 * assessable nutrients rather than half of twenty — these tests are about the
 * arithmetic, not about assembling a realistic diet.
 *
 * The mix is deliberate: fibre, calcium and salt are `ra_specific` in the real
 * catalogue and therefore carry weight 2, while vitamin C and magnesium are
 * plain D-A-CH references at weight 1. `tierOf` reads the real catalogue, not
 * this map, so a test set of five RA nutrients could not show a weighting
 * difference at all.
 */
export const NUTRITION_TEST_TARGETS: ReadonlyMap<NutrientKey, TargetValue> =
  new Map<NutrientKey, TargetValue>([
    ['fiber', minTarget(30)],
    ['calcium', minTarget(1000, { unit: 'mg' })],
    ['salt', maxTarget(6)],
    ['vitC', minTarget(100, { unit: 'mg' })],
    ['magnesium', minTarget(300, { unit: 'mg' })],
  ]);

/** Every nutrient in NUTRITION_TEST_TARGETS exactly on target. */
export const ON_TARGET = {
  fiber: 30,
  calcium: 1000,
  salt: 5,
  vitC: 100,
  magnesium: 300,
} as const;

export function scoreOf(
  day: DayNutrients,
  targets: ReadonlyMap<NutrientKey, TargetValue>
): number | null {
  return nutritionDay(day, targets, { isFlare: false }).score;
}
