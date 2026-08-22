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

export const MEAL_SLOT_ORDER: MealSlotKey[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'drink',
];

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
