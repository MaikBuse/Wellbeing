/**
 * Integration check against a real Postgres.
 *
 * Run after a schema change and after restoring a backup:
 *   npm run db:up && npm run db:migrate && npm run db:check
 *
 * It writes test rows under a dedicated user and deletes them again.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  appUsers,
  dailyLogs,
  foodTagDefs,
  foodTags,
  foods,
  mealItems,
  meals,
  medicationIntakes,
  medicationScheduleDoses,
  medicationSchedules,
  medications,
  symptomEntries,
  symptomTypes,
  userSettings,
} from '@/db/schema';
import { nutrientsForGrams, resolveGrams } from '@/lib/nutrition';
import { toLogDate } from '@/lib/time';
import { expandDueDoses } from '@/services/medication/schedule';

const TZ = 'Europe/Berlin';
const START = 4;
let failures = 0;

function check(label: string, condition: boolean, detail = '') {
  if (condition) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label} ${detail}`);
    failures++;
  }
}

async function expectReject(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, '(expected a constraint violation)');
  } catch {
    check(label, true);
  }
}

const [user] = await db
  .insert(appUsers)
  .values({
    zitadelSub: 'integration-test',
    email: 'test@example.invalid',
    name: 'Test',
  })
  .onConflictDoUpdate({ target: appUsers.zitadelSub, set: { name: 'Test' } })
  .returning({ id: appUsers.id });
await db.insert(userSettings).values({ userId: user.id }).onConflictDoNothing();
console.log('user ready');

// --- Food with a tag -------------------------------------------------------
console.log('\nfood library');
const [food] = await db
  .insert(foods)
  .values({
    userId: user.id,
    name: 'Testbrot',
    source: 'manual',
    kcal100: 250,
    protein100: 8.5,
    carbs100: 48,
    fat100: 1.2,
    defaultPortionGrams: 35,
  })
  .onConflictDoNothing()
  .returning({ id: foods.id });
const foodId =
  food?.id ??
  (
    await db
      .select({ id: foods.id })
      .from(foods)
      .where(and(eq(foods.userId, user.id), eq(foods.name, 'Testbrot')))
      .limit(1)
  )[0].id;

const [glutenTag] = await db
  .select({ id: foodTagDefs.id })
  .from(foodTagDefs)
  .where(eq(foodTagDefs.key, 'gluten'))
  .limit(1);
await db
  .insert(foodTags)
  .values({
    foodId,
    tagId: glutenTag.id,
    source: 'manual',
    confidence: 'certain',
  })
  .onConflictDoNothing();
check('gluten tag attached', true);

await expectReject('duplicate food name rejected', () =>
  db
    .insert(foods)
    .values({ userId: user.id, name: 'testbrot', source: 'manual' })
);

// --- Meal at 23:30 local, symptom at 01:00 local ---------------------------
console.log('\nlogical day boundary');
const lateDinner = new Date('2026-08-22T21:30:00Z'); // 23:30 Berlin
const nightSymptom = new Date('2026-08-22T23:00:00Z'); // 01:00 Berlin, next day
const dinnerLogDate = toLogDate(lateDinner, TZ, START);
const symptomLogDate = toLogDate(nightSymptom, TZ, START);
check(
  'dinner at 23:30 -> same day',
  dinnerLogDate === '2026-08-22',
  dinnerLogDate
);
check(
  'symptom at 01:00 -> previous day',
  symptomLogDate === '2026-08-22',
  symptomLogDate
);

const [meal] = await db
  .insert(meals)
  .values({
    userId: user.id,
    slot: 'dinner',
    occurredAt: lateDinner,
    logDate: dinnerLogDate,
  })
  .returning({ id: meals.id });

const grams = resolveGrams({ quantity: 2, unit: 'portion', portionGrams: 35 });
const nutrients = nutrientsForGrams(
  {
    kcal100: 250,
    protein100: 8.5,
    fat100: 1.2,
    satFat100: null,
    carbs100: 48,
    sugar100: null,
    fiber100: null,
    salt100: null,
  },
  grams
);
await db.insert(mealItems).values({
  mealId: meal.id,
  foodId,
  quantity: 2,
  unit: 'portion',
  grams,
  ...nutrients,
});
const [storedItem] = await db
  .select({ grams: mealItems.grams, kcal: mealItems.kcal })
  .from(mealItems)
  .where(eq(mealItems.mealId, meal.id));
check(
  '2 x 35 g portion resolved to 70 g',
  storedItem.grams === 70,
  String(storedItem.grams)
);
check(
  'nutrients snapshotted (175 kcal)',
  storedItem.kcal === 175,
  String(storedItem.kcal)
);

await expectReject('zero-gram item rejected', () =>
  db.insert(mealItems).values({ mealId: meal.id, foodId, grams: 0 })
);

// --- Symptom entries -------------------------------------------------------
console.log('\nsymptoms');
const [bloating] = await db
  .select({ id: symptomTypes.id })
  .from(symptomTypes)
  .where(eq(symptomTypes.key, 'bloating'))
  .limit(1);
check('seeded symptom type found', !!bloating);

await db.insert(symptomEntries).values({
  userId: user.id,
  mealId: meal.id,
  occurredAt: nightSymptom,
  logDate: symptomLogDate,
  severity: 6,
  onsetLag: 'mid',
});
check('meal-attributed symptom stored', true);

// A standalone 03:00 flare must be allowed with no meal at all.
await db.insert(symptomEntries).values({
  userId: user.id,
  mealId: null,
  occurredAt: new Date('2026-08-23T01:00:00Z'),
  logDate: '2026-08-22',
  severity: 8,
});
check('standalone symptom allowed without a meal', true);

await expectReject('symptom on a meal without a lag rejected', () =>
  db.insert(symptomEntries).values({
    userId: user.id,
    mealId: meal.id,
    occurredAt: nightSymptom,
    logDate: symptomLogDate,
    severity: 5,
    onsetLag: null,
  })
);
await expectReject('severity 11 rejected', () =>
  db.insert(symptomEntries).values({
    userId: user.id,
    occurredAt: nightSymptom,
    logDate: symptomLogDate,
    severity: 11,
  })
);

// --- Daily log upsert ------------------------------------------------------
console.log('\ndaily log');
for (const [field, value] of [
  ['jointPain', 7],
  ['fatigue', 5],
] as const) {
  await db
    .insert(dailyLogs)
    .values({ userId: user.id, logDate: '2026-08-22', [field]: value })
    .onConflictDoUpdate({
      target: [dailyLogs.userId, dailyLogs.logDate],
      set: { [field]: value },
    });
}
const logRows = await db
  .select()
  .from(dailyLogs)
  .where(
    and(eq(dailyLogs.userId, user.id), eq(dailyLogs.logDate, '2026-08-22'))
  );
check(
  'autosave produced exactly one row',
  logRows.length === 1,
  String(logRows.length)
);
check(
  'both fields persisted',
  logRows[0].jointPain === 7 && logRows[0].fatigue === 5
);

await expectReject('bristol type 9 rejected', () =>
  db
    .insert(dailyLogs)
    .values({ userId: user.id, logDate: '2026-08-20', bristolTypical: 9 })
);

// --- Medication: weekly MTX ------------------------------------------------
console.log('\nmedication');
const [mtx] = await db
  .insert(medications)
  .values({
    userId: user.id,
    name: 'Test-MTX',
    activeSubstance: 'Methotrexat',
    form: 'injection',
    category: 'csdmard',
    startedOn: '2026-08-01',
  })
  .returning({ id: medications.id });
const [schedule] = await db
  .insert(medicationSchedules)
  .values({
    medicationId: mtx.id,
    kind: 'weekly',
    weekday: 2,
    validFrom: '2026-08-01',
  })
  .returning({ id: medicationSchedules.id });
const [dose] = await db
  .insert(medicationScheduleDoses)
  .values({
    scheduleId: schedule.id,
    timeOfDay: '19:00:00',
    doseAmount: 15,
    doseUnit: 'mg',
  })
  .returning({ id: medicationScheduleDoses.id });

const wednesday = expandDueDoses(
  [
    {
      id: schedule.id,
      medicationId: mtx.id,
      kind: 'weekly',
      weekday: 2,
      intervalDays: null,
      anchorDate: null,
      validFrom: '2026-08-01',
      validTo: null,
      doses: [
        {
          id: dose.id,
          timeOfDay: '19:00:00',
          doseAmount: 15,
          doseUnit: 'mg',
          sortOrder: 0,
        },
      ],
    },
  ],
  '2026-08-26'
);
const thursday = expandDueDoses(
  [
    {
      id: schedule.id,
      medicationId: mtx.id,
      kind: 'weekly',
      weekday: 2,
      intervalDays: null,
      anchorDate: null,
      validFrom: '2026-08-01',
      validTo: null,
      doses: [
        {
          id: dose.id,
          timeOfDay: '19:00:00',
          doseAmount: 15,
          doseUnit: 'mg',
          sortOrder: 0,
        },
      ],
    },
  ],
  '2026-08-27'
);
check('MTX due on Wednesday', wednesday.length === 1);
check('MTX not due on Thursday', thursday.length === 0);

// Checking off twice must not create a second row.
for (const status of ['taken', 'taken'] as const) {
  await db
    .insert(medicationIntakes)
    .values({
      userId: user.id,
      medicationId: mtx.id,
      scheduleDoseId: dose.id,
      plannedLogDate: '2026-08-26',
      logDate: '2026-08-26',
      status,
      takenAt: new Date(),
      doseAmount: 15,
      doseUnit: 'mg',
    })
    .onConflictDoUpdate({
      target: [
        medicationIntakes.scheduleDoseId,
        medicationIntakes.plannedLogDate,
      ],
      // Must repeat the partial index predicate, otherwise Postgres cannot
      // infer intake_planned_uq (error 42P10).
      targetWhere: sql`${medicationIntakes.plannedLogDate} is not null`,
      set: { status, takenAt: new Date() },
    });
}
const intakeRows = await db
  .select()
  .from(medicationIntakes)
  .where(
    and(
      eq(medicationIntakes.scheduleDoseId, dose.id),
      eq(medicationIntakes.plannedLogDate, '2026-08-26')
    )
  );
check(
  'check-off is idempotent',
  intakeRows.length === 1,
  String(intakeRows.length)
);

// As-needed intakes carry no planned date and must not collide.
for (let i = 0; i < 2; i++) {
  await db.insert(medicationIntakes).values({
    userId: user.id,
    medicationId: mtx.id,
    scheduleDoseId: null,
    plannedLogDate: null,
    logDate: '2026-08-26',
    status: 'taken',
    takenAt: new Date(),
    doseAmount: 400,
    doseUnit: 'mg',
  });
}
check('two as-needed doses on one day allowed', true);

// Clean up. Meals have to go first: meal_item.food_id is deliberately
// ON DELETE RESTRICT so that deleting a food can never quietly erase history,
// which means a user row cannot be removed while meals still reference foods.
await db.delete(meals).where(eq(meals.userId, user.id));
await db.delete(appUsers).where(eq(appUsers.id, user.id));
console.log('\ntest user removed');

console.log(
  failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`
);
process.exit(failures === 0 ? 0 : 1);
