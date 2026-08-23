import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { appUsers } from './auth';
import { foodTagDefs } from './lookup';
import { createdAt, num, pk, tsz, updatedAt } from './_helpers';
import { foldExpr, squashExpr } from '../search-expr';
import { foodSource, portionUnit, tagConfidence, tagSource } from './enums';

/**
 * Global cache of what Open Food Facts said. Shared across users, never edited.
 *
 * `raw` is kept deliberately — not for display, but so tag rules can be
 * re-evaluated over stored ingredient text later without refetching hundreds
 * of products. The rules will change repeatedly in the first year.
 */
export const offProducts = pgTable(
  'off_product',
  {
    id: pk(),
    barcode: text('barcode').notNull(),
    productName: text('product_name'),
    brands: text('brands'),
    quantity: text('quantity'),
    servingSize: text('serving_size'),
    categoriesTags: text('categories_tags').array(),
    allergensTags: text('allergens_tags').array(),
    tracesTags: text('traces_tags').array(),
    additivesTags: text('additives_tags').array(),
    ingredientsText: text('ingredients_text'),
    novaGroup: smallint('nova_group'),
    kcal100: num('kcal_100'),
    protein100: num('protein_100'),
    fat100: num('fat_100'),
    satFat100: num('sat_fat_100'),
    carbs100: num('carbs_100'),
    sugar100: num('sugar_100'),
    fiber100: num('fiber_100'),
    salt100: num('salt_100'),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    fetchedAt: createdAt(),
  },
  (t) => [uniqueIndex('off_product_barcode_uq').on(t.barcode)]
);

/**
 * The Bundeslebensmittelschlüssel 4.0 as a read-only reference. Global, seeded
 * from a committed CSV, never edited — the same contract as `off_product`
 * above, and for the same reason: `food` is the working library that carries
 * `use_count`, corrections and `overridden_fields`, and mixing 7140 reference
 * rows into it would flood the picker and make a corrected catalog value
 * indistinguishable from real library upkeep. Picking one copies it into
 * `food` (see `createFoodFromCatalog`).
 *
 * Beyond nutrients this is what makes several trigger tags measurable instead
 * of guessed. A rule keyed on the name "käse" tags hard cheese as lactose,
 * which is wrong — Schnittkäse measures 0 g while milk measures 3.89 g. And
 * nothing keyed on a name would ever find the 0.58 g of alcohol in
 * "Weinkraut mit Apfel gedünstet". Histamine, tyramine, salicylate and
 * nightshade are NOT in the BLS and stay rule-derived.
 *
 * Max Rubner-Institut (2025), BLS 4.0, CC BY 4.0 —
 * DOI 10.25826/Data20251217-134202-0. Attribution is a licence condition and
 * lives in README.md and on /settings.
 */
export const foodCatalog = pgTable(
  'food_catalog',
  {
    id: pk(),
    blsCode: text('bls_code').notNull(),
    nameDe: text('name_de').notNull(),
    /** Leading letter of the BLS code: 'F' fruit, 'T' fish, 'U' meat, … */
    groupKey: text('group_key').notNull(),
    /** Ranking hint for the picker, from seed/data/bls-everyday.ts. */
    isEveryday: boolean('is_everyday').notNull().default(false),
    kcal100: num('kcal_100'),
    protein100: num('protein_100'),
    fat100: num('fat_100'),
    satFat100: num('sat_fat_100'),
    carbs100: num('carbs_100'),
    sugar100: num('sugar_100'),
    fiber100: num('fiber_100'),
    salt100: num('salt_100', 10, 3),
    /*
     * Trigger and RA nutrients at three decimals: a `bls_measured` threshold
     * sits at 0.5 g and lactose-free milk measures 0.05, so scale 2 would be
     * cutting it close, and EPA/DHA are routinely in the hundredths.
     *
     * NULL means "not measured" and must never satisfy a threshold. 0 means
     * measured-and-none, including the BLS `<LOD` sentinel, and legitimately
     * withholds a tag.
     */
    lactose100: num('lactose_100', 10, 3),
    fructose100: num('fructose_100', 10, 3),
    glucose100: num('glucose_100', 10, 3),
    sorbitol100: num('sorbitol_100', 10, 3),
    mannitol100: num('mannitol_100', 10, 3),
    alcohol100: num('alcohol_100', 10, 3),
    omega3100: num('omega3_100', 10, 3),
    epaDha100: num('epa_dha_100', 10, 3),
    arachidonic100: num('arachidonic_100', 10, 3),
    /** Curated extra search words, from seed/data/bls-aliases.ts. */
    searchAlias: text('search_alias'),
    /** Normalised for search; see ../search-expr.ts for why these are stored. */
    searchFolded: text('search_folded').generatedAlwaysAs(
      foldExpr(sql`"name_de"`)
    ),
    searchSquashed: text('search_squashed').generatedAlwaysAs(
      squashExpr(sql`"name_de"`)
    ),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('food_catalog_bls_code_uq').on(t.blsCode),
    index('food_catalog_name_lower_idx').on(sql`lower(${t.nameDe})`),
    index('food_catalog_everyday_idx')
      .on(sql`lower(${t.nameDe})`)
      .where(sql`${t.isEveryday}`),
    index('food_catalog_search_folded_idx').on(t.searchFolded),
    index('food_catalog_search_squashed_idx').on(t.searchSquashed),
  ]
);

/**
 * The shared food library with the effective values.
 *
 * Foods used to be per-user, on the theory that with one or two users the
 * duplication cost nothing and it avoided the "whose tags win" question. In use
 * that was simply wrong: whoever enters a food is not necessarily whoever eats
 * it, and a library that is invisible to the other account is a library that
 * gets typed twice.
 *
 * So a food is now global, like `off_product` above and like the `user_id IS
 * NULL` rows in lookup.ts. `created_by_user_id` is provenance only — it is NOT a
 * scope, and nothing may filter on it. The column was renamed from `user_id`
 * precisely so that any leftover `eq(foods.userId, …)` fails to compile instead
 * of silently returning nothing.
 *
 * What stays personal is the ranking: `frequentFoodsForSlot` counts the
 * *caller's* meals. `use_count` and `last_used_at` are shared, which is what
 * makes "Zuletzt benutzt" a household list.
 */
export const foods = pgTable(
  'food',
  {
    id: pk(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    brand: text('brand'),
    source: foodSource('source').notNull().default('manual'),
    offProductId: uuid('off_product_id').references(() => offProducts.id, {
      onDelete: 'set null',
    }),
    blsCatalogId: uuid('bls_catalog_id').references(() => foodCatalog.id, {
      onDelete: 'set null',
    }),
    barcode: text('barcode'),
    /** 'g' for solids, 'ml' for drinks — nutrients are per 100 of this. */
    basisUnit: portionUnit('basis_unit').notNull().default('g'),
    kcal100: num('kcal_100'),
    protein100: num('protein_100'),
    fat100: num('fat_100'),
    satFat100: num('sat_fat_100'),
    carbs100: num('carbs_100'),
    sugar100: num('sugar_100'),
    fiber100: num('fiber_100'),
    salt100: num('salt_100'),
    densityGPerMl: num('density_g_per_ml', 6, 3).default(1),
    defaultPortionGrams: num('default_portion_grams'),
    isBeverage: boolean('is_beverage').notNull().default(false),
    /**
     * Per-field override tracking. An OFF refresh may only touch fields that
     * are NOT listed here, so a manual correction is never clobbered.
     */
    overriddenFields: text('overridden_fields')
      .array()
      .notNull()
      .default(sql`'{}'`),
    isFavorite: boolean('is_favorite').notNull().default(false),
    /**
     * Denormalised on purpose: the food picker is the hottest query in the app
     * and joining/aggregating meal_item on every render is a mobile-latency
     * mistake. Bumped in the same transaction as the meal write.
     */
    useCount: integer('use_count').notNull().default(0),
    lastUsedAt: tsz('last_used_at'),
    archivedAt: tsz('archived_at'),
    /**
     * Brand is folded in with the name: the picker searches both, and one
     * column means one scan and one ranking instead of two that disagree.
     * See ../search-expr.ts for why these are stored rather than computed.
     */
    searchFolded: text('search_folded').generatedAlwaysAs(
      foldExpr(sql`("name" || ' ' || coalesce("brand", ''))`)
    ),
    searchSquashed: text('search_squashed').generatedAlwaysAs(
      squashExpr(sql`("name" || ' ' || coalesce("brand", ''))`)
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Uniqueness is global now. Two accounts entering "Haferflocken" is one
    // food, not two, and the analysis depends on that being true.
    uniqueIndex('food_name_uq').on(
      sql`lower(${t.name})`,
      sql`coalesce(lower(${t.brand}), '')`
    ),
    uniqueIndex('food_barcode_uq')
      .on(t.barcode)
      .where(sql`${t.barcode} is not null`),
    index('food_picker_idx')
      .on(t.lastUsedAt.desc())
      .where(sql`${t.archivedAt} is null`),
    index('food_name_lower_idx').on(sql`lower(${t.name})`),
    index('food_search_folded_idx').on(t.searchFolded),
    index('food_search_squashed_idx').on(t.searchSquashed),
  ]
);

/**
 * Tags as a join table, not a text[]: the per-assignment `source` and
 * `confidence` are what let the analysis exclude "traces of soy" — 2 g of soy
 * lecithin is not a soy day.
 */
export const foodTags = pgTable(
  'food_tag',
  {
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => foodTagDefs.id, { onDelete: 'cascade' }),
    source: tagSource('source').notNull().default('manual'),
    confidence: tagConfidence('confidence').notNull().default('certain'),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.foodId, t.tagId] }),
    index('food_tag_tag_idx').on(t.tagId),
  ]
);

/** Household measures: "1 Scheibe" = 35 g. Seeded from OFF serving_size. */
export const foodPortions = pgTable(
  'food_portion',
  {
    id: pk(),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),
    labelDe: text('label_de').notNull(),
    grams: num('grams').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    sortOrder: smallint('sort_order').notNull().default(100),
  },
  (t) => [
    index('food_portion_food_idx').on(t.foodId),
    uniqueIndex('food_portion_default_uq')
      .on(t.foodId)
      .where(sql`${t.isDefault}`),
    // Two rows called "Stück" on one food are a data error, not a use case —
    // and in a catalog every account shares, the one who created the duplicate
    // is rarely the one who has to make sense of it later.
    uniqueIndex('food_portion_label_uq').on(t.foodId, sql`lower(${t.labelDe})`),
    check('food_portion_grams_positive', sql`${t.grams} > 0`),
  ]
);
