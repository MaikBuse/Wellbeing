import { NUTRIENT_META, type NutrientKey } from '@/lib/nutrients';
import type { LogDate } from '@/lib/time';
import { NUTRIENT_TARGETS, TARGET_KEYS } from './catalog';
import { energyTargetKcal } from './formulas';
import type { ResolvedOverride, TargetContext, TargetValue } from './types';

/**
 * One profile version, as stored. `validTo` is null on the open one.
 *
 * Kept structural rather than importing the drizzle row type: the resolution is
 * pure and gets unit-tested against literals.
 */
export type ProfileVersion = {
  validFrom: LogDate;
  validTo: LogDate | null;
  referenceSex: 'female' | 'male' | null;
  birthYear: number | null;
  heightCm: number | null;
  activityLevel: TargetContext['activityLevel'];
  goal: TargetContext['goal'];
  hasSarcopenia: boolean;
  menopauseStage: TargetContext['menopauseStage'];
  dietForm: TargetContext['dietForm'];
  renalImpairment: boolean;
  proteinMaxGPerKg: number | null;
  weightSource: 'daily_log' | 'manual';
  referenceWeightKg: number | null;
};

/**
 * The version in force on a given day.
 *
 * Versions are half-open on the right: `validTo` is the last day a version
 * applied, matching how `medication_schedule` reads. Null means still open.
 */
export function profileForDay(
  versions: readonly ProfileVersion[],
  logDate: LogDate
): ProfileVersion | null {
  let best: ProfileVersion | null = null;
  for (const version of versions) {
    if (version.validFrom > logDate) continue;
    if (version.validTo !== null && version.validTo < logDate) continue;
    if (best === null || version.validFrom > best.validFrom) best = version;
  }
  return best;
}

/** Same shape, for the target overrides. */
export function overridesForDay<T extends { validFrom: LogDate; validTo: LogDate | null }>(
  rows: readonly T[],
  logDate: LogDate
): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    if (row.validFrom > logDate) continue;
    if (row.validTo !== null && row.validTo < logDate) continue;
    const key = (row as unknown as { nutrientKey: string }).nutrientKey;
    const current = byKey.get(key);
    if (!current || row.validFrom > current.validFrom) byKey.set(key, row);
  }
  return [...byKey.values()];
}

/**
 * Assemble the context, resolving the energy target first.
 *
 * Order matters: the E%-targets (saturated fat, sugar, total fat, ALA) divide
 * the energy TARGET, never the energy actually eaten. Against the eaten energy a
 * 3500 kcal day would raise its own saturated-fat limit.
 */
export function targetContext(
  input: Omit<TargetContext, 'energyKcal'>
): TargetContext {
  const canComputeEnergy =
    input.referenceSex !== null &&
    input.weightKg !== null &&
    input.heightCm !== null &&
    input.ageYears !== null;

  const energyKcal = canComputeEnergy
    ? energyTargetKcal({
        sex: input.referenceSex as 'female' | 'male',
        weightKg: input.weightKg as number,
        heightCm: input.heightCm as number,
        ageYears: input.ageYears as number,
        activityLevel: input.activityLevel,
        goal: input.goal,
      })
    : null;

  return { ...input, energyKcal };
}

/**
 * The full set of targets for one person on one day.
 *
 * Deterministic and side-effect free, so it can be checked against a table of
 * hand-computed numbers.
 */
export function deriveTargets(
  ctx: TargetContext,
  overrides: readonly ResolvedOverride[] = []
): Map<NutrientKey, TargetValue> {
  const out = new Map<NutrientKey, TargetValue>();

  for (const key of TARGET_KEYS) {
    const definition = NUTRIENT_TARGETS[key];
    if (!definition) continue;
    out.set(key, definition.resolve(ctx));
  }

  // Overrides last, and only over a target the catalogue already defines: the
  // direction comes from the catalogue, so an override can move the numbers but
  // can never turn "at least 30 g of fibre" into a limit.
  for (const override of overrides) {
    const base = out.get(override.nutrientKey);
    if (!base) continue;
    if (override.disabled) {
      out.delete(override.nutrientKey);
      continue;
    }
    out.set(override.nutrientKey, {
      ...base,
      min: override.min,
      max: override.max,
      bandMax: null,
      origin: 'override',
      unavailableReason: null,
      rationaleDe: override.reason
        ? `Selbst gesetzt: ${override.reason}`
        : 'Selbst gesetzter Wert.',
    });
  }

  return out;
}

/** Targets that count towards the day score. */
export function scoredTargetKeys(
  targets: ReadonlyMap<NutrientKey, TargetValue>
): NutrientKey[] {
  return [...targets.keys()].filter((key) => {
    const definition = NUTRIENT_TARGETS[key];
    if (!definition?.inScore) return false;
    const value = targets.get(key);
    if (!value || value.unavailableReason !== null) return false;
    return value.min !== null || value.max !== null;
  });
}

/** Display order: RA-specific first, then by nutrient group. */
const GROUP_ORDER: Record<string, number> = {
  energy: 0,
  macro: 1,
  fat_quality: 2,
  vitamin: 3,
  mineral: 4,
};

export function targetDisplayOrder(keys: readonly NutrientKey[]): NutrientKey[] {
  return [...keys].sort((a, b) => {
    const groupDiff =
      GROUP_ORDER[NUTRIENT_META[a].group] - GROUP_ORDER[NUTRIENT_META[b].group];
    if (groupDiff !== 0) return groupDiff;
    return NUTRIENT_META[a].labelDe.localeCompare(NUTRIENT_META[b].labelDe, 'de');
  });
}
