import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { appUsers } from './auth';
import { foodPortions, foods } from './food';
import { createdAt, num, pk, tsz, updatedAt } from './_helpers';
import { mealSlot, portionUnit } from './enums';

export const meals = pgTable(
  'meal',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id, { onDelete: 'cascade' }),
    slot: mealSlot('slot').notNull(),
    occurredAt: tsz('occurred_at').notNull(),
    /** Logical day, derived server-side — see src/lib/time.ts. */
    logDate: date('log_date', { mode: 'string' }).notNull(),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // No unique on (user, log_date, slot): a second breakfast and a split dinner
  // are real. The UI offers "add to the existing lunch" instead of blocking.
  (t) => [
    index('meal_user_day_idx').on(t.userId, t.logDate),
    index('meal_user_time_idx').on(t.userId, t.occurredAt),
  ]
);

/**
 * Nutrients are SNAPSHOTTED here at write time, tags are NOT.
 *
 * A later OFF refresh or manual correction must not silently rewrite last
 * month's calorie charts, so the numbers are frozen. Re-tagging a food, by
 * contrast, is a correction of knowledge ("this contains hidden lactose") and
 * has to apply retroactively — that is the whole point of the exercise.
 *
 * Meal and day totals are never stored; they are aggregated in views.
 */
export const mealItems = pgTable(
  'meal_item',
  {
    id: pk(),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meals.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'restrict' }),
    // What she entered ...
    quantity: num('quantity').notNull().default(1),
    unit: portionUnit('unit').notNull().default('portion'),
    portionId: uuid('portion_id').references(() => foodPortions.id, {
      onDelete: 'set null',
    }),
    // ... and the resolved amount plus the frozen nutrients.
    grams: num('grams').notNull(),
    kcal: num('kcal'),
    proteinG: num('protein_g'),
    fatG: num('fat_g'),
    satFatG: num('sat_fat_g'),
    carbsG: num('carbs_g'),
    sugarG: num('sugar_g'),
    fiberG: num('fiber_g'),
    saltG: num('salt_g'),
    nutrientsComputedAt: tsz('nutrients_computed_at').notNull().defaultNow(),
    sortOrder: smallint('sort_order').notNull().default(0),
  },
  (t) => [
    index('meal_item_meal_idx').on(t.mealId),
    index('meal_item_food_idx').on(t.foodId),
    check('meal_item_grams_positive', sql`${t.grams} > 0`),
  ]
);
