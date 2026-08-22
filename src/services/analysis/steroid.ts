/**
 * Daily prednisolone-equivalent dose.
 *
 * `medication.ts` names this a covariate for a concrete reason: cortisone damps
 * symptoms directly, so a food eaten while tapering off it would otherwise look
 * protective. The deviation-from-own-median outcome removes the cortisone
 * *level* for free; what it cannot remove is the *change* during a taper, and
 * that is what this feeds.
 */
import { expandDueDoses, type Schedule } from '@/services/medication/schedule';
import type { LogDate } from '@/lib/time';
import type { SteroidStep } from './types';

/**
 * Potency relative to prednisolone. Standard clinical equivalences.
 *
 * Budesonide is 0 on purpose: the oral formulation used in gut disease is
 * near-entirely first-pass metabolised and does not act as a systemic
 * anti-inflammatory dose in this sense.
 */
export const PREDNISOLONE_EQUIVALENT: Record<string, number> = {
  prednisolon: 1,
  prednison: 1,
  prednisone: 1,
  methylprednisolon: 1.25,
  triamcinolon: 1.25,
  dexamethason: 6.7,
  betamethason: 8.3,
  hydrocortison: 0.25,
  cortison: 0.2,
  budesonid: 0,
};

export type SteroidIntake = {
  medicationId: string;
  scheduleDoseId: string | null;
  status: 'taken' | 'skipped' | 'missed';
  doseAmount: number;
  doseUnit: string;
};

export type SteroidMedication = {
  id: string;
  activeSubstance: string | null;
  name: string;
};

export type SteroidDayResult = {
  mg: number;
  /** True when a substance could not be matched and factor 1.0 was assumed. */
  factorAssumed: boolean;
};

/**
 * Loose match on the lower-cased active substance, falling back to the trade
 * name. An unmatched substance that is nonetheless categorised as a steroid
 * gets factor 1.0 AND raises `factorAssumed`, so a reviewer can see that a
 * guess was made rather than discovering it later in a chart.
 */
export function prednisoloneFactor(
  medication: SteroidMedication
): { factor: number; assumed: boolean } {
  const haystack = `${medication.activeSubstance ?? ''} ${medication.name}`
    .toLowerCase()
    .trim();
  for (const [substance, factor] of Object.entries(PREDNISOLONE_EQUIVALENT)) {
    if (haystack.includes(substance)) return { factor, assumed: false };
  }
  return { factor: 1, assumed: true };
}

/**
 * Planned mg for the day, corrected by what actually happened.
 *
 * The planned series has to come from `expandDueDoses` because
 * `medication_intake` rows are created lazily: an untouched past dose has no
 * row at all. A `skipped` or `missed` row means the dose was not taken and
 * contributes 0; an as-needed intake (no `scheduleDoseId`) is added on top,
 * because a rescue dose of prednisolone is exactly the kind of thing that
 * damps the next day.
 *
 * Non-mg units contribute 0 and raise `factorAssumed` — a steroid dosed in ml
 * or drops cannot be converted without a concentration this app does not store.
 */
export function steroidMgForDay(
  schedules: Schedule[],
  medications: ReadonlyMap<string, SteroidMedication>,
  intakes: SteroidIntake[],
  logDate: LogDate
): SteroidDayResult {
  let mg = 0;
  let factorAssumed = false;

  const byScheduleDose = new Map<string, SteroidIntake>();
  for (const intake of intakes) {
    if (intake.scheduleDoseId) byScheduleDose.set(intake.scheduleDoseId, intake);
  }

  const add = (
    medicationId: string,
    amount: number,
    unit: string
  ): void => {
    const medication = medications.get(medicationId);
    if (!medication) return;
    if (unit !== 'mg') {
      factorAssumed = true;
      return;
    }
    const { factor, assumed } = prednisoloneFactor(medication);
    if (assumed) factorAssumed = true;
    mg += amount * factor;
  };

  for (const planned of expandDueDoses(schedules, logDate)) {
    if (!medications.has(planned.medicationId)) continue;
    const intake = byScheduleDose.get(planned.scheduleDoseId);
    // No row at all means untouched, which for a *planned* steroid dose is
    // most plausibly taken — she is on a standing dose, not ticking boxes.
    // A row that says skipped or missed is an explicit statement otherwise.
    if (intake && intake.status !== 'taken') continue;
    const amount = intake?.doseAmount ?? planned.doseAmount;
    const unit = intake?.doseUnit ?? planned.doseUnit;
    add(planned.medicationId, amount, unit);
  }

  for (const intake of intakes) {
    if (intake.scheduleDoseId) continue;
    if (intake.status !== 'taken') continue;
    add(intake.medicationId, intake.doseAmount, intake.doseUnit);
  }

  return { mg, factorAssumed };
}

/**
 * Four steps, pre-registered. This is the ONE variable Model B stratifies on;
 * a second stratification variable would empty the cells at a few hundred days.
 */
export function steroidStep(mg: number | null): SteroidStep {
  if (mg === null || mg <= 0) return 'none';
  if (mg <= 5) return 'low';
  if (mg <= 10) return 'medium';
  return 'high';
}
