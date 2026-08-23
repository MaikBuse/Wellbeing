import {
  NUTRIENT_META,
  UNIT_LABEL,
  type NutrientGroup,
  type NutrientKey,
} from '@/lib/nutrients';
import { formatGermanNumber } from '@/lib/nutrition';
import type { GoalMeterStatus } from '@/components/ui/goal-meter';
import type { NutrientAssessment } from '@/services/nutrition/types';
import type { TargetValue } from '@/services/nutrition/targets/types';

/**
 * German wording for the nutrient targets.
 *
 * Presentation only — no arithmetic beyond rounding for display. The words in
 * here do a job the colours are not allowed to do on their own: "mindestens"
 * and "höchstens" are what tell a minimum from a limit, everywhere in the app.
 */

export const DIRECTION_WORD = {
  min: 'mindestens',
  max: 'höchstens',
  range: 'Zielbereich',
} as const;

/**
 * `info` is the generic word. `statusWord` below picks the specific one, because
 * "this nutrient is never judged" and "this day cannot carry a verdict yet" are
 * different statements and the bar looks identical in both.
 */
export const STATUS_WORD: Record<GoalMeterStatus, string> = {
  below: 'unter dem Ziel',
  in: 'im Ziel',
  over: 'über der Grenze',
  info: 'ohne Bewertung',
  unmeasured: 'zu wenig Messwerte',
};

/** The word under the bar. Splits `info` by whether the nutrient is judged. */
export function statusWord(
  status: GoalMeterStatus,
  judged: boolean
): string {
  if (status !== 'info') return STATUS_WORD[status];
  return judged ? 'noch nicht bewertbar' : 'nur zur Einordnung';
}

/**
 * German names for the nutrient groups.
 *
 * Lives here rather than in the settings page because two screens print them
 * now — that page and the per-day detail list on /nutrition. Two copies of the
 * same labels are exactly the drift `revalidate.ts` and `nutrients.ts` open
 * their files complaining about.
 *
 * "Fettsäuren und Ballaststoffe" is wider than `fat_quality` sounds: the group
 * also holds `fiberSoluble`.
 */
export const GROUP_LABEL: Record<NutrientGroup, string> = {
  energy: 'Energie',
  macro: 'Makronährstoffe',
  fat_quality: 'Fettsäuren und Ballaststoffe',
  vitamin: 'Vitamine',
  mineral: 'Mineralstoffe',
};

/** Format an amount in the nutrient's own unit. */
export function formatAmount(value: number | null, key: NutrientKey): string {
  if (value === null) return '–';
  const meta = NUTRIENT_META[key];
  const number = formatGermanNumber(value, meta.decimals);
  const unit = UNIT_LABEL[meta.unit];
  return unit === '' ? number : `${number} ${unit}`;
}

/** "mindestens 90 g", "höchstens 6 g", "Zielbereich 65–78 g". */
export function formatTarget(target: TargetValue, key: NutrientKey): string {
  if (target.unavailableReason !== null) return 'kein Zielwert';

  if (target.direction === 'range' && target.min !== null) {
    const upper = target.max ?? target.bandMax;
    if (upper !== null) {
      const meta = NUTRIENT_META[key];
      const unit = UNIT_LABEL[meta.unit];
      const low = formatGermanNumber(target.min, meta.decimals);
      const high = formatGermanNumber(upper, meta.decimals);
      return `${DIRECTION_WORD.range} ${low}–${high}${unit === '' ? '' : ` ${unit}`}`;
    }
  }
  if (target.max !== null && target.min === null) {
    return `${DIRECTION_WORD.max} ${formatAmount(target.max, key)}`;
  }
  if (target.min !== null) {
    return `${DIRECTION_WORD.min} ${formatAmount(target.min, key)}`;
  }
  return 'kein Zielwert';
}

/**
 * 'unknown' is not one state, it is two.
 *
 * `showValue` is the split: a nutrient that is never judged, a day whose
 * amounts were not stated and a day with a single main meal all arrive here as
 * 'unknown' WITH a defensible number, and only a genuinely unmeasured nutrient
 * arrives without one. Collapsing all four into 'unmeasured' is what left the
 * day screen showing four empty dashed bars after a normal quick-add.
 */
export function meterStatus(assessment: NutrientAssessment): GoalMeterStatus {
  switch (assessment.status) {
    case 'met':
      return 'in';
    case 'exceeded':
      return 'over';
    case 'missed':
      return 'below';
    default:
      return assessment.showValue ? 'info' : 'unmeasured';
  }
}

/**
 * How far along the bar the value sits, with 1 at the notch.
 *
 * For a minimum the notch is the target; for a limit it is the allowance. A
 * target with neither cannot be drawn, and the caller will be showing the
 * unmeasured state anyway.
 */
export function meterFill(assessment: NutrientAssessment): number {
  const value = assessment.total.total;
  if (value === null) return 0;
  const bound = assessment.target.min ?? assessment.target.max;
  if (bound === null || bound <= 0) return 0;
  return value / bound;
}

/** The share of the bar that came from a preparation. */
export function supplementFill(assessment: NutrientAssessment): number {
  const value = assessment.total.total;
  if (value === null || value <= 0) return 0;
  const bound = assessment.target.min ?? assessment.target.max;
  if (bound === null || bound <= 0) return 0;
  return assessment.total.fromSupplement / bound;
}

export type GoalMeterView = {
  key: NutrientKey;
  label: string;
  valueText: string | null;
  targetText: string;
  statusText: string;
  status: GoalMeterStatus;
  fill: number;
  supplementFill: number;
  isLowerBound: boolean;
  /** False when the notch is the bottom of a band rather than a scored limit. */
  hasScoredLimit: boolean;
  /** "davon 25 µg aus Präparat", or null. */
  supplementNote: string | null;
};

export function toMeterView(assessment: NutrientAssessment): GoalMeterView {
  const status = meterStatus(assessment);
  const fromSupplement = assessment.total.fromSupplement;

  return {
    key: assessment.key,
    label: NUTRIENT_META[assessment.key].labelDe,
    // Only a genuinely unmeasured nutrient hides its number. 'info' prints
    // one, prefixed with "mind." wherever the day can only understate it.
    valueText:
      status === 'unmeasured'
        ? null
        : formatAmount(assessment.total.total, assessment.key),
    targetText: formatTarget(assessment.target, assessment.key),
    statusText: statusWord(status, assessment.judged),
    status,
    fill: meterFill(assessment),
    supplementFill: supplementFill(assessment),
    isLowerBound: status !== 'unmeasured' && assessment.isLowerBound,
    hasScoredLimit: assessment.target.max !== null,
    supplementNote:
      fromSupplement > 0
        ? `davon ${formatAmount(fromSupplement, assessment.key)} aus einem Präparat`
        : null,
  };
}

/**
 * The three macronutrients the day screen shows, in this order.
 *
 * Carbohydrates, protein, fat — and no micronutrient. All three come from the
 * frozen `meal_item` snapshot, so they carry a number the moment anything is
 * logged. The previous list led with `calcium` and `epaDha`, which exist only
 * in `food_catalog` and are reachable only through `food.bls_catalog_id`: two of
 * four bars were structurally blank for every self-made food and every Open
 * Food Facts product.
 *
 * NOT the same thing as `DAY_PRIORITY` in `services/nutrition/loader.ts`. That
 * one is the mascot's focus ranking, where a calcium gap is exactly what should
 * rank first. This one is what the meters print.
 */
export const DAY_MACRO_KEYS: readonly NutrientKey[] = [
  'carbs',
  'protein',
  'fat',
];

/**
 * Which nutrients the day screen shows.
 *
 * A fixed list, plus AT MOST ONE exceeded limit APPENDED to it. Appended and
 * not swapped in: the three macros were asked for by name, and dropping fat
 * because the salt limit was passed would answer a different question than the
 * one the row is there to answer.
 *
 * An exceeded limit earns the fourth row because it is the only state here that
 * is both actionable and provable on a thin day — over a limit is a fact even
 * when half the amounts are guesses.
 */
export function selectDayNutrients(
  nutrients: readonly NutrientAssessment[],
  keys: readonly NutrientKey[] = DAY_MACRO_KEYS
): NutrientAssessment[] {
  const byKey = new Map(nutrients.map((entry) => [entry.key, entry]));
  const chosen: NutrientAssessment[] = [];

  for (const key of keys) {
    const entry = byKey.get(key);
    if (entry) chosen.push(entry);
  }

  const exceeded = nutrients.find(
    (entry) => entry.status === 'exceeded' && !chosen.includes(entry)
  );
  if (exceeded) chosen.push(exceeded);

  return chosen;
}

/**
 * Everything the day screen did NOT show, grouped, for the detail list.
 *
 * The complement of `selectDayNutrients`, computed from the same `shown` array
 * rather than from `DAY_MACRO_KEYS`, so an exceeded limit promoted to the day
 * card is not then repeated further down.
 */
export function groupRemainingNutrients(
  nutrients: readonly NutrientAssessment[],
  shown: readonly NutrientAssessment[]
): { group: NutrientGroup; entries: NutrientAssessment[] }[] {
  const skip = new Set(shown.map((entry) => entry.key));
  const grouped = new Map<NutrientGroup, NutrientAssessment[]>();

  // `nutrients` arrives in `targetDisplayOrder` already (see `nutritionDay`),
  // so insertion order is the display order and nothing re-sorts here.
  for (const entry of nutrients) {
    if (skip.has(entry.key)) continue;
    const group = NUTRIENT_META[entry.key].group;
    const list = grouped.get(group);
    if (list) list.push(entry);
    else grouped.set(group, [entry]);
  }

  return [...grouped.entries()].map(([group, entries]) => ({ group, entries }));
}

/** The PAL chips, number and plain words. */
export const PAL_CHOICES = [
  { value: 'sedentary', number: '1,2', labelDe: 'fast nur liegend oder sitzend' },
  { value: 'light', number: '1,4', labelDe: 'überwiegend sitzend' },
  { value: 'moderate', number: '1,6', labelDe: 'sitzend, mit Wegen und Stehen' },
  { value: 'active', number: '1,8', labelDe: 'überwiegend stehend oder gehend' },
  { value: 'very_active', number: '1,9', labelDe: 'körperlich schwere Arbeit' },
] as const;

export const GOAL_CHOICES = [
  { value: 'maintain', labelDe: 'Gewicht halten' },
  { value: 'lose', labelDe: 'abnehmen' },
  { value: 'gain', labelDe: 'zunehmen' },
] as const;

export const DIET_CHOICES = [
  { value: 'omnivore', labelDe: 'omnivor' },
  { value: 'pescetarian', labelDe: 'pescetarisch' },
  { value: 'vegetarian', labelDe: 'vegetarisch' },
  { value: 'vegan', labelDe: 'vegan' },
] as const;

export const SEX_CHOICES = [
  { value: 'female', labelDe: 'weiblich' },
  { value: 'male', labelDe: 'männlich' },
] as const;

export const MENOPAUSE_CHOICES = [
  { value: 'pre', labelDe: 'davor' },
  { value: 'peri', labelDe: 'mittendrin' },
  { value: 'post', labelDe: 'danach' },
] as const;

/** Consequence text under an answer, so the effect is visible while choosing. */
export const CONSEQUENCE: Record<string, string> = {
  lose: 'Rechnet mit 15 % weniger Energie als der Bedarf — nie unter den Grundumsatz. Das Eiweißziel bleibt unverändert hoch.',
  vegan:
    'Vitamin B12 steckt in keinem pflanzlichen Lebensmittel in nennenswerter Menge. Das Ziel bleibt in der Liste, wird aber nicht als Versäumnis gewertet. Eisen und Zink bekommen einen Aufschlag, weil pflanzliches Eisen schlechter aufgenommen wird und Phytat Zink bindet.',
  vegetarian:
    'Zink bekommt einen Aufschlag, weil Phytat aus Vollkorn und Hülsenfrüchten die Aufnahme senkt.',
  sarcopenia: 'Hebt das Eiweißziel von 1,0–1,2 auf 1,5 g je kg Körpergewicht.',
  renal:
    'Eiweiß bekommt dadurch zusätzlich eine Obergrenze. In der Tagesansicht wird daraus ein Zielbereich statt eines Mindestwerts, und die Obergrenze geht der Anhebung bei Sarkopenie vor.',
  steroid:
    'Calcium steigt von 1000 auf 1200 mg, Vitamin D von 20 auf 25 µg — so steht es in der Leitlinie zur kortisonbedingten Osteoporose.',
};

export const COVERAGE_EXPLANATION_DE =
  'Mikronährstoffe stehen nur für Lebensmittel aus dem Bundeslebensmittelschlüssel zur Verfügung. Selbst angelegte Lebensmittel und Produkte aus Open Food Facts haben keine Messwerte für Calcium oder Vitamin D — diese Gramm zählen nicht als null, sondern als unbekannt. Sonst wäre jeder Wert systematisch zu niedrig, und zwar am stärksten an den Tagen mit Fertigprodukten.';
