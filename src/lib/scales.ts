/**
 * Scale labels live here, not in the database: they are presentation, and
 * joining a lookup table for them on every render would be silly.
 *
 * Columns stay 0-10 so a slider can replace the chips later without a
 * migration, but data entry uses six chips — on a phone, six large targets beat
 * an eleven-point slider every time.
 */

export type ScaleOption = { value: number; label: string };

export const SEVERITY_ANCHORS: ScaleOption[] = [
  { value: 0, label: 'keine' },
  { value: 2, label: 'sehr leicht' },
  { value: 4, label: 'leicht' },
  { value: 6, label: 'mittel' },
  { value: 8, label: 'stark' },
  { value: 10, label: 'sehr stark' },
];

export const SEVERITY_DESCRIPTIONS: Record<number, string> = {
  0: 'keine',
  1: 'sehr leicht',
  2: 'sehr leicht',
  3: 'leicht',
  4: 'leicht',
  5: 'mittel (störend)',
  6: 'mittel (störend)',
  7: 'stark (einschränkend)',
  8: 'stark (einschränkend)',
  9: 'sehr stark (kaum erträglich)',
  10: 'sehr stark (kaum erträglich)',
};

/** Maps a 0-10 score onto the five-step severity ramp token. */
export function severityToken(value: number): string {
  if (value <= 0) return 'sev-0';
  if (value <= 3) return 'sev-1';
  if (value <= 6) return 'sev-2';
  if (value <= 8) return 'sev-3';
  return 'sev-4';
}

export const BRISTOL_SCALE: ScaleOption[] = [
  { value: 1, label: 'Einzelne harte Klümpchen, schwer auszuscheiden' },
  { value: 2, label: 'Wurstartig, klumpig' },
  { value: 3, label: 'Wurstartig mit rissiger Oberfläche' },
  { value: 4, label: 'Wurstartig, glatt und weich' },
  { value: 5, label: 'Weiche Klümpchen mit klaren Rändern' },
  { value: 6, label: 'Breiige, unförmige Stücke mit ausgefransten Rändern' },
  { value: 7, label: 'Flüssig, ohne feste Bestandteile' },
];

export function bristolGroup(value: number): string {
  if (value <= 2) return 'Verstopfungstendenz';
  if (value <= 4) return 'Normal';
  return 'Durchfalltendenz';
}

/** Quick chips for morning stiffness, in minutes. */
export const STIFFNESS_CHIPS: ScaleOption[] = [
  { value: 0, label: 'keine' },
  { value: 5, label: '5 Min' },
  { value: 15, label: '15 Min' },
  { value: 30, label: '30 Min' },
  { value: 60, label: '1 Std' },
  { value: 120, label: '2 Std' },
  { value: 180, label: 'über 2 Std' },
];

/**
 * Morning stiffness in minutes, mapped onto the 0-10 outcome scale.
 *
 * The chips ARE the data — she taps one of seven, so these anchors are the
 * observed values and anything between them is interpolated linearly. A smooth
 * transform (log1p and friends) would be arbitrary where the input is
 * genuinely ordinal.
 */
export const STIFFNESS_TO_SCORE: readonly (readonly [number, number])[] = [
  [0, 0],
  [5, 2],
  [15, 4],
  [30, 6],
  [60, 8],
  [120, 9],
  [180, 10],
];

/** Piecewise-linear lookup over STIFFNESS_TO_SCORE, clamped at both ends. */
export function stiffnessToScore(minutes: number): number {
  const points = STIFFNESS_TO_SCORE;
  if (minutes <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (minutes >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (minutes <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((minutes - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return last[1];
}

/**
 * The components of the RA-Tagesindex. Always shown beside the composite: one
 * number is what you can rank, but only the breakdown says what drives it.
 */
export const RA_COMPONENT_LABELS = {
  jointPain: 'Gelenkschmerz',
  tenderJoints: 'Gelenke markiert',
  stiffness: 'Morgensteifigkeit',
  fatigue: 'Erschöpfung',
  complaints: 'Beschwerden allgemein',
} as const;

export type RaComponent = keyof typeof RA_COMPONENT_LABELS;

export const RA_COMPONENT_ORDER: RaComponent[] = [
  'jointPain',
  'tenderJoints',
  'stiffness',
  'fatigue',
  'complaints',
];

export const SLEEP_CHIPS: ScaleOption[] = [
  { value: 240, label: '4 Std' },
  { value: 300, label: '5 Std' },
  { value: 360, label: '6 Std' },
  { value: 420, label: '7 Std' },
  { value: 480, label: '8 Std' },
  { value: 540, label: '9 Std' },
  { value: 600, label: '10 Std' },
];

/**
 * The onset buckets ARE the analysis windows, so their boundaries are part of
 * the statistics, not just copy.
 */
export const ONSET_LAG_LABELS = {
  immediate: 'unter 30 Min',
  early: '30 Min – 2 Std',
  mid: '2 – 6 Std',
  late: '6 – 12 Std',
  next_day: 'am nächsten Tag',
} as const;

export type OnsetLagKey = keyof typeof ONSET_LAG_LABELS;

/**
 * The lag buckets as explicit minute ranges, half-open `[from, to)`.
 *
 * `lagFromMinutes` above answers "which chip do we pre-select"; this answers
 * "which symptoms fall in this tag's window". They are two spellings of the
 * same fact and a test asserts they agree at every boundary — if they drift,
 * the chip a person taps stops meaning what the analysis measures.
 *
 * `next_day` is open-ended on purpose: it is a day-level window and Model B
 * never uses these bounds.
 */
export const ONSET_LAG_MINUTES: Record<
  OnsetLagKey,
  { fromMinutes: number; toMinutes: number | null }
> = {
  immediate: { fromMinutes: 0, toMinutes: 30 },
  early: { fromMinutes: 30, toMinutes: 120 },
  mid: { fromMinutes: 120, toMinutes: 360 },
  late: { fromMinutes: 360, toMinutes: 720 },
  next_day: { fromMinutes: 720, toMinutes: null },
};

export const ONSET_LAG_ORDER: OnsetLagKey[] = [
  'immediate',
  'early',
  'mid',
  'late',
  'next_day',
];

/**
 * Pre-selects the lag chip from how long ago the meal was.
 *
 * Call this from the server: the value is a default for the chips, and reading
 * the clock during a client render is impure.
 */
export function defaultLagSince(
  occurredAt: Date,
  now: Date = new Date()
): OnsetLagKey {
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - occurredAt.getTime()) / 60_000)
  );
  return lagFromMinutes(minutes);
}

/** Pre-selects the lag chip from the time elapsed since the meal. */
export function lagFromMinutes(minutes: number): OnsetLagKey {
  if (minutes < 30) return 'immediate';
  if (minutes < 120) return 'early';
  if (minutes < 360) return 'mid';
  if (minutes < 720) return 'late';
  return 'next_day';
}

export const MEAL_SLOT_LABELS = {
  breakfast: 'Frühstück',
  lunch: 'Mittagessen',
  dinner: 'Abendessen',
  snack: 'Snack',
  drink: 'Getränk',
} as const;

export type MealSlotKey = keyof typeof MEAL_SLOT_LABELS;

/**
 * Fallback time for a meal on a day that is not today.
 *
 * Quick-add used to stamp `new Date()` unconditionally, so nine breakfasts
 * entered on Sunday evening all claimed to have happened at 20:47. A typical
 * hour for the slot is a guess, but it is an honest one and it is a guess the
 * user can correct with one tap. For today, the clock is still the better
 * default.
 */
export const DEFAULT_MEAL_TIMES: Record<MealSlotKey, string> = {
  breakfast: '08:00',
  lunch: '12:30',
  dinner: '19:00',
  snack: '15:00',
  drink: '10:00',
};

export const MEAL_SLOT_ORDER: MealSlotKey[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'drink',
];

/**
 * The slots a day is normally built from.
 *
 * Used by the completeness score, which asks "was the day's eating recorded",
 * not "was anything recorded at all". A lone snack is a real entry but it is
 * not a day's food, so it counts as half — see `dayCompleteness` in
 * `src/services/progress/completeness.ts`.
 */
export const MAIN_MEAL_SLOTS: MealSlotKey[] = ['breakfast', 'lunch', 'dinner'];

export const SYMPTOM_GROUP_LABELS = {
  gi: 'Magen & Darm',
  systemic: 'Allgemein',
  msk: 'Gelenke & Muskeln',
  skin: 'Haut & Schleimhaut',
  airway: 'Atemwege',
  other: 'Sonstiges',
} as const;

export const SYMPTOM_GROUP_ORDER = [
  'gi',
  'systemic',
  'msk',
  'skin',
  'airway',
  'other',
] as const;

export const MED_FORM_LABELS = {
  tablet: 'Tablette',
  capsule: 'Kapsel',
  injection: 'Spritze',
  infusion: 'Infusion',
  drops: 'Tropfen',
  spray: 'Spray',
  ointment: 'Salbe',
  other: 'Sonstiges',
} as const;

export const MED_CATEGORY_LABELS = {
  csdmard: 'Basistherapie (csDMARD)',
  bdmard: 'Biologikum (bDMARD)',
  tsdmard: 'JAK-Hemmer (tsDMARD)',
  nsaid: 'Schmerzmittel (NSAR)',
  steroid: 'Kortison',
  analgesic: 'Analgetikum',
  supplement: 'Nahrungsergänzung',
  other: 'Sonstiges',
} as const;

export const DOSE_UNIT_LABELS = {
  mg: 'mg',
  ug: 'µg',
  g: 'g',
  ml: 'ml',
  iu: 'IE',
  piece: 'Stück',
} as const;

export const SCHEDULE_KIND_LABELS = {
  daily: 'täglich',
  weekly: 'wöchentlich',
  interval_days: 'alle X Tage',
  as_needed: 'bei Bedarf',
} as const;

export const WEEKDAY_LABELS = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
] as const;

/**
 * Two letters, not one.
 *
 * A single initial is ambiguous in German three times over — Montag/Mittwoch,
 * Dienstag/Donnerstag, Samstag/Sonntag all collide. In a full week the position
 * disambiguates them, but the day-dot row is only as long as the history: a
 * fresh account shows two tiles reading "S" and "S" and nothing on screen says
 * which is which.
 */
export const WEEKDAY_SHORT = [
  'Mo',
  'Di',
  'Mi',
  'Do',
  'Fr',
  'Sa',
  'So',
] as const;

/**
 * The five values the daily check calls its "Kernwerte".
 *
 * They were an anonymous array inside `daily-log-form.tsx`, counted there to
 * fill a ProgressRing. The completeness score needs exactly the same five, and
 * two hand-maintained copies of "which fields matter" would drift the first
 * time a field is added — so the list lives here and both read it.
 *
 * `wellbeing` is deliberately NOT among them even though it is a top-level
 * column: it is the "Beschwerden allgemein" score, and completeness counts it
 * as its own building block instead.
 */
export const CORE_DAILY_FIELDS = [
  'jointPain',
  'morningStiffnessMinutes',
  'fatigue',
  'sleepQuality',
  'stress',
] as const;

export type CoreDailyField = (typeof CORE_DAILY_FIELDS)[number];

/** How many of the five core values are filled in. */
export function countCoreDailyFields(
  values: Partial<Record<CoreDailyField, number | null>>
): number {
  return CORE_DAILY_FIELDS.filter((field) => values[field] != null).length;
}
