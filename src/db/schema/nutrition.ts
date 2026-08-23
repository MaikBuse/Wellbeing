import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { appUsers } from './auth';
import { createdAt, num, pk } from './_helpers';
import {
  activityLevel,
  biologicalSex,
  dietForm,
  menopauseStage,
  weightGoal,
  weightSource,
} from './enums';

/**
 * The profile the nutrient targets are derived from.
 *
 * Not columns on `user_setting`: that table has `user_id` as its primary key,
 * so history is structurally impossible there, `getUserSettings` sits on every
 * request path and should not drag body data along, and switches are a
 * different kind of thing from body measurements.
 *
 * VERSIONED, like `medication_schedule`, and for the same reason. The decisive
 * case is `renal_impairment`: it flips protein from a MINIMUM to a MAXIMUM. A
 * flag set today, applied to the whole past, would turn every day of the last
 * year into "over the limit" and move `achievement.achieved_on` out from under
 * the milestones that were already acknowledged — the exact drift the
 * `meal_item` snapshot exists to prevent. Body weight has the same shape,
 * milder.
 *
 * Counter-rule for typos: while `valid_from` is today, the row is corrected in
 * place instead of versioned. A mistyped body height is not history.
 *
 * The disclaimer acknowledgement deliberately lives on `user_setting` and not
 * here — versioning it would copy it into every profile change and quietly
 * re-date a consent.
 */
export const userNutritionProfiles = pgTable(
  'user_nutrition_profile',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),

    /** Picks a D-A-CH reference column. NULL = no sex-dependent targets. */
    referenceSex: biologicalSex('reference_sex'),
    birthYear: smallint('birth_year'),
    heightCm: smallint('height_cm'),
    activityLevel: activityLevel('activity_level').notNull().default('light'),
    goal: weightGoal('goal').notNull().default('maintain'),
    /** Raises the protein target to 1.5 g/kg. Never past the renal cap. */
    hasSarcopenia: boolean('has_sarcopenia').notNull().default(false),
    menopauseStage: menopauseStage('menopause_stage'),
    dietForm: dietForm('diet_form').notNull().default('omnivore'),
    renalImpairment: boolean('renal_impairment').notNull().default(false),
    /** g per kg, set by a clinician. Only meaningful with renalImpairment. */
    proteinMaxGPerKg: num('protein_max_g_per_kg', 3, 2),

    weightSource: weightSource('weight_source').notNull().default('daily_log'),
    /** Fallback when track_weight is off or nothing was ever weighed. */
    referenceWeightKg: num('reference_weight_kg', 5, 2),

    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('unp_user_from_idx').on(t.userId, t.validFrom),
    /*
     * Exactly one open version per user. A partial unique index catches the
     * real mistake (two open rows) without pulling in btree_gist for a full
     * range-overlap exclusion, which nothing here needs: versions are only
     * ever appended by closing the open one.
     */
    uniqueIndex('unp_open_uq').on(t.userId).where(sql`${t.validTo} is null`),
    check(
      'unp_birth_year_sane',
      sql`${t.birthYear} is null or ${t.birthYear} between 1900 and 2100`
    ),
    check(
      'unp_height_sane',
      sql`${t.heightCm} is null or ${t.heightCm} between 100 and 250`
    ),
    check(
      'unp_weight_sane',
      sql`${t.referenceWeightKg} is null or ${t.referenceWeightKg} between 30 and 250`
    ),
    check(
      'unp_dates_ordered',
      sql`${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`
    ),
    check(
      'unp_menopause_needs_female',
      sql`${t.menopauseStage} is null or ${t.referenceSex} = 'female'`
    ),
    /* A protein cap without a renal diagnosis is a restriction nobody ordered. */
    check(
      'unp_protein_cap_needs_renal',
      sql`${t.proteinMaxGPerKg} is null
          or (${t.renalImpairment} and ${t.proteinMaxGPerKg} between 0.40 and 2.50)`
    ),
  ]
);

/**
 * A manually overridden target.
 *
 * Only overrides are stored; the derived values live in
 * `src/services/nutrition/targets/catalog.ts`. A target value is KNOWLEDGE, not
 * a measurement — it belongs on the `food_tag` side of the asymmetry CLAUDE.md
 * describes, so a corrected reference value applies retroactively, while the
 * intake it is compared against stays a snapshot. Storing 35 literature
 * constants in every user's rows would turn a D-A-CH update into a data
 * migration and make a wrong value unfixable by a code change.
 *
 * Deliberately NO `direction` column: direction comes from the catalog and an
 * override may only replace the values. That makes "at least 30 g of fibre"
 * impossible to turn into a maximum by editing a row, and removes a whole class
 * of inconsistency by construction.
 */
export const nutritionTargetOverrides = pgTable(
  'nutrition_target_override',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    /** A key from NUTRIENT_TARGETS, like achievement.key against MILESTONES. */
    nutrientKey: text('nutrient_key').notNull(),
    minValue: num('min_value', 12, 3),
    maxValue: num('max_value', 12, 3),
    unit: text('unit').notNull(),
    /** Hide the target entirely. Kept rather than deleted, so `reason` lives. */
    disabled: boolean('disabled').notNull().default(false),
    reason: text('reason'),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validTo: date('valid_to', { mode: 'string' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('nto_user_key_idx').on(t.userId, t.nutrientKey, t.validFrom),
    uniqueIndex('nto_open_uq')
      .on(t.userId, t.nutrientKey)
      .where(sql`${t.validTo} is null`),
    check(
      'nto_dates_ordered',
      sql`${t.validTo} is null or ${t.validTo} >= ${t.validFrom}`
    ),
    check(
      'nto_has_value',
      sql`${t.disabled} or ${t.minValue} is not null or ${t.maxValue} is not null`
    ),
  ]
);
