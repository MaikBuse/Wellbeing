import type { NutrientKey, NutrientUnit } from '@/lib/nutrients';

export type TargetDirection = 'min' | 'max' | 'range';

/**
 * Some targets are only meaningful over a week.
 *
 * Two oily-fish meals a week is the recommendation, and scoring EPA+DHA per day
 * would report "missed" on the five days that are exactly right.
 *
 * A weekly target is compared against the SEVEN-DAY MEAN rather than the
 * seven-day sum, so the number the user reads stays "1 g pro Tag" instead of
 * becoming an unfamiliar 7 g per week.
 */
export type TargetCadence = 'daily' | 'weekly';

export type SourceKey =
  | 'dach'
  | 'dge_fiber'
  | 'dge_rheuma_aa'
  | 'who_salt'
  | 'who_sugar'
  | 'efsa_epa_dha'
  | 'eular_lifestyle'
  | 'acr_giop'
  | 'ra_protein'
  | 'ra_vitamin_e'
  | 'mifflin';

export type TargetValue = {
  direction: TargetDirection;
  /** Lower bound, or null for a pure limit. */
  min: number | null;
  /**
   * A SCORED upper limit. Exceeding it costs attainment.
   *
   * Deliberately separate from `bandMax`: 1,5 g/kg of protein is above the
   * recommended band and must cost nothing, while 7 g of salt is above a limit
   * and must. Folding both into one field would make the renal protein cap and
   * the top of a healthy range indistinguishable, and the wrong one of those
   * two is a restriction nobody ordered.
   */
  max: number | null;
  /** Top of the recommended band. Shown, never scored. */
  bandMax: number | null;
  unit: NutrientUnit;
  cadence: TargetCadence;
  /**
   * How fast attainment falls above `max`. 1.5 means zero at 150 % of the
   * limit. Only set where the default is wrong.
   */
  overSlack?: number;
  sourceKeys: SourceKey[];
  /** The arithmetic, in one German sentence. Shown in the disclosure. */
  rationaleDe: string;
  origin: 'derived' | 'override';
  /** Why it could not be derived. Null when it was. */
  unavailableReason: string | null;
};

/**
 * Everything the derivation is allowed to look at.
 *
 * A plain value object so `deriveTargets` stays pure and testable against a
 * table of hand-computed numbers. Nothing in here reads the database.
 */
export type TargetContext = {
  referenceSex: 'female' | 'male' | null;
  ageYears: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'maintain' | 'lose' | 'gain';
  hasSarcopenia: boolean;
  menopauseStage: 'pre' | 'peri' | 'post' | null;
  dietForm: 'omnivore' | 'pescetarian' | 'vegetarian' | 'vegan';
  renalImpairment: boolean;
  proteinMaxGPerKg: number | null;
  /**
   * Long-term glucocorticoids, derived from `medication.category = 'steroid'`
   * rather than asked: >= 2.5 mg prednisolone equivalent on at least 60 of the
   * last 90 days, which is the ACR GIOP threshold.
   */
  steroidLongTerm: boolean;
  /** Energy target in kcal, resolved first so E%-targets can build on it. */
  energyKcal: number | null;
};

export type TargetDefinition = {
  key: NutrientKey;
  evidence: 'ra_specific' | 'dge_general' | 'dach_reference';
  /**
   * false = show the number, never call it met or missed.
   *
   * Iron is the case this exists for: anaemia in RA is 30-60 % anaemia of
   * inflammation, hepcidin blocks absorption, and more iron does not help. A
   * bar reading "missed" would push towards a supplement that cannot work.
   */
  showVerdict: boolean;
  /**
   * false = show it, keep it out of the day score.
   *
   * Energy (an energy target is a weight target, and a "340 kcal left" counter
   * invites restriction), folate (under methotrexate it is a prescribed weekly
   * regimen with timing rules, not a more-is-better bar) and the n-6:n-3 ratio
   * (an orientation with no guideline value).
   */
  inScore: boolean;
  /** Standing caveat, shown next to the value. */
  cautionDe: string | null;
  /** Always returns a value; an underivable one carries `unavailableReason`. */
  resolve(ctx: TargetContext): TargetValue;
};

export type ResolvedOverride = {
  nutrientKey: NutrientKey;
  min: number | null;
  max: number | null;
  unit: string;
  disabled: boolean;
  reason: string | null;
};
