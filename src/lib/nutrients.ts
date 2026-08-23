/**
 * The one place a nutrient is declared.
 *
 * Five subsystems have to agree on what "calcium" is: the catalog column, the
 * target catalog, the supplement mapping, the daily aggregation and the UI. If
 * each carried its own list they would drift, so they all read this one, and
 * `src/lib/__tests__/nutrients.test.ts` checks the declared columns against the
 * actual drizzle tables.
 *
 * Two sources, and the difference matters:
 *
 * - `snapshot` reads a frozen column on `meal_item`. Those eight values were
 *   resolved when the meal was logged and a later correction to the food does
 *   not rewrite them (see the comment on `meal_item`).
 * - `catalog` joins `food_catalog` live through `food.bls_catalog_id`, exactly
 *   as `mealMeasuredRange` already does for the trigger nutrients. There is
 *   nothing to freeze: micronutrients have no edit path, `bls_catalog_id` is
 *   never re-pointed, and a value that only exists in an untouched reference
 *   is knowledge rather than a measurement of this meal. The honest
 *   consequence is that a future BLS release shifts historic micronutrient
 *   numbers — the same retroactivity `food_tag` has, and CLAUDE.md says that
 *   asymmetry is deliberate.
 *
 * UNITS ARE BLS-NATIVE and never normalised. `select vit_d_100 from
 * food_catalog` should print a number that can be checked against a package
 * label. Note the two that surprise people: vitamin B6 is in µg here, so its
 * D-A-CH value of 1.4 mg is stated as 1400; niacin is the EQUIVALENT (NIAEQ),
 * because that is what D-A-CH references.
 *
 * NOT PRESENT: selenium. The BLS carries exactly sixteen elements and selenium
 * is not among them, so a selenium target cannot be tracked from this data and
 * is not offered. Saying so is the point — quietly omitting it would look like
 * an oversight.
 */

export const NUTRIENT_KEYS = [
  // energy and the eight label macros, all from the meal_item snapshot
  'energy',
  'protein',
  'fat',
  'satFat',
  'carbs',
  'sugar',
  'fiber',
  'salt',
  // fat quality and fibre detail, from the catalog
  'fiberSoluble',
  'mufa',
  'pufa',
  'omega3',
  'ala',
  'epaDha',
  'omega6',
  'linoleic',
  'arachidonic',
  'n6n3Ratio',
  // vitamins
  'vitA',
  'vitD',
  'vitE',
  'vitK',
  'vitC',
  'vitB1',
  'vitB2',
  'niacin',
  'vitB6',
  'folate',
  'vitB12',
  // minerals
  'calcium',
  'magnesium',
  'iron',
  'zinc',
  'iodine',
  'potassium',
  'phosphorus',
  'sodium',
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** 'ratio' is unitless. 'iu' never appears here — only on a supplement label. */
export type NutrientUnit = 'kcal' | 'g' | 'mg' | 'ug' | 'ratio';

export type NutrientGroup =
  | 'energy'
  | 'macro'
  | 'fat_quality'
  | 'vitamin'
  | 'mineral';

export type NutrientSource =
  /** A frozen column on `meal_item`. */
  | { kind: 'snapshot'; column: string }
  /** A per-100 column on `food_catalog`, joined live. */
  | { kind: 'catalog'; column: string }
  /** Computed from other nutrients; has no column of its own. */
  | { kind: 'derived' };

export type NutrientMeta = {
  key: NutrientKey;
  labelDe: string;
  unit: NutrientUnit;
  /** Decimals for display. Sums are carried at full precision until then. */
  decimals: number;
  group: NutrientGroup;
  source: NutrientSource;
};

function snapshot(column: string): NutrientSource {
  return { kind: 'snapshot', column };
}
function catalog(column: string): NutrientSource {
  return { kind: 'catalog', column };
}

export const NUTRIENT_META: Record<NutrientKey, NutrientMeta> = {
  energy: {
    key: 'energy',
    labelDe: 'Energie',
    unit: 'kcal',
    decimals: 0,
    group: 'energy',
    source: snapshot('kcal'),
  },
  protein: {
    key: 'protein',
    labelDe: 'Eiweiß',
    unit: 'g',
    decimals: 0,
    group: 'macro',
    source: snapshot('proteinG'),
  },
  fat: {
    key: 'fat',
    labelDe: 'Fett',
    unit: 'g',
    decimals: 0,
    group: 'macro',
    source: snapshot('fatG'),
  },
  satFat: {
    key: 'satFat',
    labelDe: 'gesättigte Fettsäuren',
    unit: 'g',
    decimals: 1,
    group: 'macro',
    source: snapshot('satFatG'),
  },
  carbs: {
    key: 'carbs',
    labelDe: 'Kohlenhydrate',
    unit: 'g',
    decimals: 0,
    group: 'macro',
    source: snapshot('carbsG'),
  },
  sugar: {
    key: 'sugar',
    labelDe: 'Zucker',
    unit: 'g',
    decimals: 1,
    group: 'macro',
    source: snapshot('sugarG'),
  },
  fiber: {
    key: 'fiber',
    labelDe: 'Ballaststoffe',
    unit: 'g',
    decimals: 1,
    group: 'macro',
    source: snapshot('fiberG'),
  },
  salt: {
    key: 'salt',
    labelDe: 'Salz',
    unit: 'g',
    decimals: 1,
    group: 'macro',
    source: snapshot('saltG'),
  },

  fiberSoluble: {
    key: 'fiberSoluble',
    labelDe: 'lösliche Ballaststoffe',
    unit: 'g',
    decimals: 1,
    group: 'fat_quality',
    source: catalog('fiberSoluble100'),
  },
  mufa: {
    key: 'mufa',
    labelDe: 'einfach ungesättigte Fettsäuren',
    unit: 'g',
    decimals: 1,
    group: 'fat_quality',
    source: catalog('mufa100'),
  },
  pufa: {
    key: 'pufa',
    labelDe: 'mehrfach ungesättigte Fettsäuren',
    unit: 'g',
    decimals: 1,
    group: 'fat_quality',
    source: catalog('pufa100'),
  },
  omega3: {
    key: 'omega3',
    labelDe: 'Omega-3-Fettsäuren',
    unit: 'g',
    decimals: 2,
    group: 'fat_quality',
    source: catalog('omega3100'),
  },
  ala: {
    key: 'ala',
    labelDe: 'Alpha-Linolensäure',
    unit: 'g',
    decimals: 2,
    group: 'fat_quality',
    source: catalog('ala100'),
  },
  epaDha: {
    key: 'epaDha',
    labelDe: 'EPA und DHA',
    unit: 'g',
    decimals: 2,
    group: 'fat_quality',
    source: catalog('epaDha100'),
  },
  omega6: {
    key: 'omega6',
    labelDe: 'Omega-6-Fettsäuren',
    unit: 'g',
    decimals: 1,
    group: 'fat_quality',
    source: catalog('omega6100'),
  },
  linoleic: {
    key: 'linoleic',
    labelDe: 'Linolsäure',
    unit: 'g',
    decimals: 1,
    group: 'fat_quality',
    source: catalog('linoleic100'),
  },
  arachidonic: {
    key: 'arachidonic',
    labelDe: 'Arachidonsäure',
    // Milligrams, not grams: the RA limit is 50 mg and "0,05 g" reads as noise.
    // The catalog column is in grams, so the aggregation scales by 1000 — see
    // CATALOG_UNIT_FACTOR below.
    unit: 'mg',
    decimals: 0,
    group: 'fat_quality',
    source: catalog('arachidonic100'),
  },
  n6n3Ratio: {
    key: 'n6n3Ratio',
    labelDe: 'Verhältnis Omega-6 zu Omega-3',
    unit: 'ratio',
    decimals: 1,
    group: 'fat_quality',
    source: { kind: 'derived' },
  },

  vitA: {
    key: 'vitA',
    labelDe: 'Vitamin A',
    unit: 'ug',
    decimals: 0,
    group: 'vitamin',
    source: catalog('vitA100'),
  },
  vitD: {
    key: 'vitD',
    labelDe: 'Vitamin D',
    unit: 'ug',
    decimals: 1,
    group: 'vitamin',
    source: catalog('vitD100'),
  },
  vitE: {
    key: 'vitE',
    labelDe: 'Vitamin E',
    unit: 'mg',
    decimals: 1,
    group: 'vitamin',
    source: catalog('vitE100'),
  },
  vitK: {
    key: 'vitK',
    labelDe: 'Vitamin K',
    unit: 'ug',
    decimals: 0,
    group: 'vitamin',
    source: catalog('vitK100'),
  },
  vitC: {
    key: 'vitC',
    labelDe: 'Vitamin C',
    unit: 'mg',
    decimals: 0,
    group: 'vitamin',
    source: catalog('vitC100'),
  },
  vitB1: {
    key: 'vitB1',
    labelDe: 'Vitamin B1',
    unit: 'mg',
    decimals: 2,
    group: 'vitamin',
    source: catalog('vitB1100'),
  },
  vitB2: {
    key: 'vitB2',
    labelDe: 'Vitamin B2',
    unit: 'mg',
    decimals: 2,
    group: 'vitamin',
    source: catalog('vitB2100'),
  },
  niacin: {
    key: 'niacin',
    labelDe: 'Niacin-Äquivalent',
    unit: 'mg',
    decimals: 1,
    group: 'vitamin',
    source: catalog('niacinEq100'),
  },
  vitB6: {
    key: 'vitB6',
    // µg, because that is the BLS unit. D-A-CH states 1,6 / 1,4 mg, which is
    // 1600 / 1400 here.
    labelDe: 'Vitamin B6',
    unit: 'ug',
    decimals: 0,
    group: 'vitamin',
    source: catalog('vitB6100'),
  },
  folate: {
    key: 'folate',
    labelDe: 'Folat-Äquivalent',
    unit: 'ug',
    decimals: 0,
    group: 'vitamin',
    source: catalog('folate100'),
  },
  vitB12: {
    key: 'vitB12',
    labelDe: 'Vitamin B12',
    unit: 'ug',
    decimals: 1,
    group: 'vitamin',
    source: catalog('vitB12100'),
  },

  calcium: {
    key: 'calcium',
    labelDe: 'Calcium',
    unit: 'mg',
    decimals: 0,
    group: 'mineral',
    source: catalog('calcium100'),
  },
  magnesium: {
    key: 'magnesium',
    labelDe: 'Magnesium',
    unit: 'mg',
    decimals: 0,
    group: 'mineral',
    source: catalog('magnesium100'),
  },
  iron: {
    key: 'iron',
    labelDe: 'Eisen',
    unit: 'mg',
    decimals: 1,
    group: 'mineral',
    source: catalog('iron100'),
  },
  zinc: {
    key: 'zinc',
    labelDe: 'Zink',
    unit: 'mg',
    decimals: 1,
    group: 'mineral',
    source: catalog('zinc100'),
  },
  iodine: {
    key: 'iodine',
    labelDe: 'Jod',
    unit: 'ug',
    decimals: 0,
    group: 'mineral',
    source: catalog('iodine100'),
  },
  potassium: {
    key: 'potassium',
    labelDe: 'Kalium',
    unit: 'mg',
    decimals: 0,
    group: 'mineral',
    source: catalog('potassium100'),
  },
  phosphorus: {
    key: 'phosphorus',
    labelDe: 'Phosphor',
    unit: 'mg',
    decimals: 0,
    group: 'mineral',
    source: catalog('phosphorus100'),
  },
  sodium: {
    key: 'sodium',
    labelDe: 'Natrium',
    unit: 'mg',
    decimals: 0,
    group: 'mineral',
    source: catalog('sodium100'),
  },
};

/**
 * Multiplier from the catalog column's own unit to `NUTRIENT_META[key].unit`.
 *
 * Only arachidonic acid needs one: the BLS stores it in grams and the RA limit
 * is stated in milligrams. Everything else is declared in the unit its column
 * already uses, which is why this map has exactly one entry and should stay
 * that way — a second entry means someone normalised a unit for cosmetics.
 */
export const CATALOG_UNIT_FACTOR: Partial<Record<NutrientKey, number>> = {
  arachidonic: 1000,
};

/** Keys whose value comes from the frozen `meal_item` snapshot. */
export const SNAPSHOT_NUTRIENTS = NUTRIENT_KEYS.filter(
  (key) => NUTRIENT_META[key].source.kind === 'snapshot'
);

/** Keys joined live from `food_catalog`. */
export const CATALOG_NUTRIENTS = NUTRIENT_KEYS.filter(
  (key) => NUTRIENT_META[key].source.kind === 'catalog'
);

export const UNIT_LABEL: Record<NutrientUnit, string> = {
  kcal: 'kcal',
  g: 'g',
  mg: 'mg',
  ug: 'µg',
  ratio: '',
};
