import { NUTRIENT_META, type NutrientKey, type NutrientUnit } from '@/lib/nutrients';
import type { LogDate } from '@/lib/time';
import type { SupplementContribution } from './types';

/**
 * What a preparation contributed towards a nutrient target.
 *
 * ONLY `taken` COUNTS, and that is deliberately the opposite of what
 * `steroid.ts` does. There the planned series is regenerated through
 * `expandDueDoses`, because plan-plus-correction is the best estimate of
 * EXPOSURE — a cortisone dose almost certainly happened even if nobody tapped
 * it. Here the question is what was actually swallowed, and an untapped past
 * dose has no row at all. Regenerating one would invent vitamin D nobody took,
 * and the target would report itself met on the strength of a schedule.
 *
 * Do not "fix" this into the other shape.
 *
 * The amount is always PER PIECE, and a nutrient-carrying medication must be
 * scheduled in `dose_unit = 'piece'`. Vitamin D at 1000 IU per drop with a dose
 * of 2 is 2000 IU. That convention removes a `basis` discriminator from the
 * table and a whole class of unit mix-ups with it; the price is one data-entry
 * rule, enforced in the action and in db:check.
 */

/** A logged intake, as `intakeRange` returns it. */
export type IntakeRow = {
  logDate: LogDate;
  medicationId: string;
  status: string;
  doseAmount: number;
  doseUnit: string;
};

/** One row of `medication_nutrient`. */
export type MedicationNutrientRow = {
  medicationId: string;
  nutrientKey: NutrientKey;
  amountPerPiece: number;
  unit: string;
};

/** What a supplement label may state. */
export type SupplementUnit = 'g' | 'mg' | 'ug' | 'iu';

const MASS_TO_UG: Record<'g' | 'mg' | 'ug', number> = {
  g: 1_000_000,
  mg: 1_000,
  ug: 1,
};

/**
 * International units per microgram, where the conversion is unambiguous.
 *
 * Vitamin D is 40 IU per µg, settled. Vitamin A is 3⅓ IU per µg retinol
 * equivalent.
 *
 * VITAMIN E IS DELIBERATELY ABSENT. One milligram of RRR-alpha-tocopherol is
 * 1.49 IU, one milligram of the synthetic all-rac form is about 1 IU, and the
 * label does not always say which. Guessing would be a fifty-percent error on a
 * nutrient whose RA target happens to be stated in IU. The value stays in the
 * unit it was entered in and is shown separately until someone says which form
 * it is.
 */
const IU_PER_UG: Partial<Record<NutrientKey, number>> = {
  vitD: 40,
  vitA: 10 / 3,
};

/**
 * Convert a supplement amount into the nutrient's own unit.
 *
 * Returns null when there is no defensible conversion. The caller must then
 * show the value separately rather than fold an invented number into a total.
 */
export function convertNutrientAmount(
  key: NutrientKey,
  amount: number,
  from: SupplementUnit
): number | null {
  const to: NutrientUnit = NUTRIENT_META[key].unit;
  if (to === 'kcal' || to === 'ratio') return null;

  if (from === 'iu') {
    const perUg = IU_PER_UG[key];
    if (perUg === undefined) return null;
    const ug = amount / perUg;
    return ug / MASS_TO_UG[to];
  }

  return (amount * MASS_TO_UG[from]) / MASS_TO_UG[to];
}

export function isSupplementUnit(unit: string): unit is SupplementUnit {
  return unit === 'g' || unit === 'mg' || unit === 'ug' || unit === 'iu';
}

/**
 * Fold the day's taken doses into per-nutrient contributions.
 *
 * A dose whose unit is not `piece` is skipped rather than guessed at: the
 * per-piece convention is the only thing that makes the arithmetic meaningful,
 * and a millilitre of an unknown concentration is not a number.
 */
export function supplementContributions(
  intakes: readonly IntakeRow[],
  mapping: readonly MedicationNutrientRow[]
): SupplementContribution[] {
  const byMedication = new Map<string, MedicationNutrientRow[]>();
  for (const row of mapping) {
    const list = byMedication.get(row.medicationId);
    if (list) list.push(row);
    else byMedication.set(row.medicationId, [row]);
  }

  const out = new Map<string, SupplementContribution>();

  for (const intake of intakes) {
    if (intake.status !== 'taken') continue;
    if (intake.doseUnit !== 'piece') continue;
    const nutrients = byMedication.get(intake.medicationId);
    if (!nutrients) continue;

    for (const nutrient of nutrients) {
      if (!isSupplementUnit(nutrient.unit)) continue;
      const converted = convertNutrientAmount(
        nutrient.nutrientKey,
        nutrient.amountPerPiece * intake.doseAmount,
        nutrient.unit
      );
      if (converted === null) continue;

      const slot = `${intake.logDate}:${nutrient.nutrientKey}`;
      const existing = out.get(slot);
      if (existing) existing.amount += converted;
      else {
        out.set(slot, {
          logDate: intake.logDate,
          nutrientKey: nutrient.nutrientKey,
          amount: converted,
        });
      }
    }
  }

  return [...out.values()];
}
