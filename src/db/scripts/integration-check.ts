/**
 * Integration check against a real Postgres.
 *
 * Run after a schema change and after restoring a backup:
 *   npm run db:up && npm run db:migrate && npm run db:check
 *
 * It writes test rows under a dedicated user and deletes them again.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  analysisRuns,
  appUsers,
  dailyLogs,
  eliminationPhases,
  eliminationProtocols,
  foodCatalog,
  foodTagDefs,
  foodTags,
  foods,
  mealItems,
  meals,
  medicationIntakes,
  medicationScheduleDoses,
  medicationSchedules,
  medications,
  menstrualEvents,
  symptomEntries,
  symptomEntrySymptoms,
  symptomTypes,
  userSettings,
  achievements,
} from '@/db/schema';
import { searchCatalog } from '@/db/queries/foods';
import { seedLookups } from '@/db/seed/run';
import { copyCatalogEntryToLibrary } from '@/services/food/fromCatalog';
import { nutrientsForGrams, resolveGrams } from '@/lib/nutrition';
import { resolveNutrientBasis } from '@/lib/validation/food';
import { addDays, eachLogDate, toLogDate } from '@/lib/time';
import { expandDueDoses } from '@/services/medication/schedule';
import {
  analysedTagDefs,
  catalogState,
  dailyLogRange,
  intakeRange,
  mealMeasuredRange,
  mealRange,
  mealTagExposureRange,
  menstrualEventRange,
  protocolDayIntervals,
  scheduleVersionsRange,
  symptomEntryRange,
} from '@/db/queries/analysis';
import {
  firstActivityLogDate,
  mealSlotDays,
  symptomDays,
} from '@/db/queries/progress';
import { loadProgress } from '@/services/progress/loader';
import { computeStreak } from '@/services/progress/streak';
import { assembleFacts } from '@/services/analysis/facts';
import { runAnalysisForUser } from '@/services/analysis/loader';
import {
  analysisParamsSchema,
  analysisResultsSchema,
} from '@/services/analysis/types';

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
    createdByUserId: user.id,
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
      .where(eq(foods.name, 'Testbrot'))
      .limit(1)
  )[0].id;

const [glutenTag] = await db
  .select({ id: foodTagDefs.id })
  .from(foodTagDefs)
  .where(eq(foodTagDefs.key, 'gluten'))
  .limit(1);
if (!glutenTag) {
  console.error(
    'Seeds fehlen. Erst `npm run db:seed` laufen lassen — der Migrator im ' +
      'Cluster erledigt das, `drizzle-kit migrate` nicht.'
  );
  process.exit(1);
}
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
    .values({ createdByUserId: user.id, name: 'testbrot', source: 'manual' })
);

// --- The library is shared ------------------------------------------------
// Foods used to be scoped to a user. They are global now, and the two things
// that has to mean are: another account sees the row, and another account
// cannot create a second copy of it under the same name.
console.log('\nshared food library');
const [otherUser] = await db
  .insert(appUsers)
  .values({
    zitadelSub: 'integration-test-other',
    email: 'other@example.invalid',
    name: 'Test Zwei',
  })
  .onConflictDoUpdate({
    target: appUsers.zitadelSub,
    set: { name: 'Test Zwei' },
  })
  .returning({ id: appUsers.id });
await db
  .insert(userSettings)
  .values({ userId: otherUser.id })
  .onConflictDoNothing();

// Exactly the query the food list runs: no user in it at all.
const visible = await db
  .select({ id: foods.id })
  .from(foods)
  .where(and(eq(foods.name, 'Testbrot'), isNull(foods.archivedAt)));
check(
  'a food created by one account is visible without any user filter',
  visible.some((row) => row.id === foodId)
);

await expectReject('a second account cannot re-create the same food', () =>
  db.insert(foods).values({
    createdByUserId: otherUser.id,
    name: 'Testbrot',
    source: 'manual',
  })
);

// Same name, different brand, is a different food — the index keys on both.
const [branded] = await db
  .insert(foods)
  .values({
    createdByUserId: otherUser.id,
    name: 'Testbrot',
    brand: 'Andere Marke',
    source: 'manual',
  })
  .returning({ id: foods.id });
check('the same name under a different brand is allowed', !!branded);
await db.delete(foods).where(eq(foods.id, branded.id));

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

// --- Nutrient reference amounts --------------------------------------------
// Only Postgres can settle two things here: the round trip through
// numeric(10,2), and what that type does with a value that is not a number.
console.log('\nnutrient reference amounts');

// A crashed earlier run would otherwise leave the row behind and the insert
// below would fail on food_name_uq rather than on anything being tested.
await db.delete(foods).where(eq(foods.name, 'Testgewürz'));

const spice = resolveNutrientBasis({
  values: {
    kcal100: 3.5,
    protein100: 0.1,
    fat100: 0.05,
    satFat100: 0.01,
    carbs100: 0.5,
    sugar100: 0.02,
    fiber100: 0.3,
    salt100: 0.012,
  },
  kind: 'unit',
  basisAmount: null,
  portionGrams: null,
  unit: 'g',
});
check('a label stated per 1 g resolves', spice.ok);
if (spice.ok) {
  const [spiceFood] = await db
    .insert(foods)
    .values({
      createdByUserId: user.id,
      name: 'Testgewürz',
      source: 'manual',
      ...spice.values,
    })
    .returning({ id: foods.id });
  const [storedSpice] = await db
    .select({
      kcal100: foods.kcal100,
      salt100: foods.salt100,
      satFat100: foods.satFat100,
    })
    .from(foods)
    .where(eq(foods.id, spiceFood.id));
  check(
    'per-1-g values are stored per 100 g (3,5 kcal -> 350)',
    storedSpice.kcal100 === 350,
    String(storedSpice.kcal100)
  );
  // The case that motivated the feature: at a small reference amount the stored
  // precision goes UP, so a third decimal of the entry survives.
  check(
    '0,012 g salt per 1 g survives numeric(10,2) as 1,2 per 100 g',
    storedSpice.salt100 === 1.2,
    String(storedSpice.salt100)
  );
  check(
    'saturated fat is written too, which the manual path used to drop',
    storedSpice.satFat100 === 1,
    String(storedSpice.satFat100)
  );
  await db.delete(foods).where(eq(foods.id, spiceFood.id));
}

// Why the guards are two-sided rather than just `>= 0`.
const [nanProbe] = await db
  .select({
    accepted: sql<number>`('NaN'::numeric(10,2))::text = 'NaN'`,
    nonNegative: sql<boolean>`'NaN'::numeric(10,2) >= 0`,
    underCap: sql<boolean>`'NaN'::numeric(10,2) <= 900`,
  })
  .from(sql`(select 1) as probe`);
check('numeric(10,2) accepts NaN', Boolean(nanProbe.accepted));
check(
  'and sorts it above every number, so a >= 0 constraint cannot catch it',
  nanProbe.nonNegative === true
);
check(
  'only an upper bound rejects it — which is why the nutrient guards have one',
  nanProbe.underCap === false
);

// --- A nutrient correction does not move what was already logged -----------
const [beforeFix] = await db
  .select({ kcal: mealItems.kcal, grams: mealItems.grams })
  .from(mealItems)
  .where(eq(mealItems.mealId, meal.id));

const corrected = resolveNutrientBasis({
  values: {
    kcal100: 78,
    protein100: 7.5,
    fat100: 5.4,
    satFat100: 1.6,
    carbs100: 0.4,
    sugar100: 0.2,
    fiber100: 0,
    salt100: 0.2,
  },
  kind: 'portion',
  basisAmount: null,
  portionGrams: 60,
  unit: 'g',
});
check('a label stated per 60 g piece resolves', corrected.ok);
if (corrected.ok) {
  await db
    .update(foods)
    .set({ ...corrected.values, overriddenFields: ['kcal100', 'salt100'] })
    .where(eq(foods.id, foodId));
  const [afterFix] = await db
    .select({ kcal: mealItems.kcal, grams: mealItems.grams })
    .from(mealItems)
    .where(eq(mealItems.mealId, meal.id));
  check(
    'correcting a food leaves an already logged meal untouched',
    afterFix.kcal === beforeFix.kcal && afterFix.grams === beforeFix.grams,
    `${afterFix.kcal} kcal / ${afterFix.grams} g`
  );
  const [refixed] = await db
    .select({
      kcal100: foods.kcal100,
      overriddenFields: foods.overriddenFields,
    })
    .from(foods)
    .where(eq(foods.id, foodId));
  check(
    'while the food itself carries the new value (78 kcal per 60 g -> 130)',
    refixed.kcal100 === 130,
    String(refixed.kcal100)
  );
  // The array column is NOT NULL, and the SQL the replaced per-field action used
  // would have written NULL here as soon as it appended zero fields.
  check(
    'the asserted fields are recorded and the array is never null',
    refixed.overriddenFields.length === 2,
    JSON.stringify(refixed.overriddenFields)
  );
}

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

// Deleting an entry is a UI affordance now, so the cascade matters: the linked
// symptom types have to go with it, and the meal has to stay.
const [doomed] = await db
  .insert(symptomEntries)
  .values({
    userId: user.id,
    mealId: meal.id,
    occurredAt: nightSymptom,
    logDate: symptomLogDate,
    severity: 4,
    onsetLag: 'early',
    note: 'wird gelöscht',
  })
  .returning({ id: symptomEntries.id });
await db
  .insert(symptomEntrySymptoms)
  .values({ entryId: doomed.id, symptomTypeId: bloating.id });

// The same statement the server action runs, scoped to the owner.
const deleted = await db
  .delete(symptomEntries)
  .where(
    and(eq(symptomEntries.id, doomed.id), eq(symptomEntries.userId, user.id))
  )
  .returning({ id: symptomEntries.id });
check('deleting an own symptom entry reports one row', deleted.length === 1);

const orphans = await db
  .select({ entryId: symptomEntrySymptoms.entryId })
  .from(symptomEntrySymptoms)
  .where(eq(symptomEntrySymptoms.entryId, doomed.id));
check('the symptom links cascade away', orphans.length === 0);

const mealSurvived = await db
  .select({ id: meals.id })
  .from(meals)
  .where(eq(meals.id, meal.id));
check('the meal survives its deleted reaction', mealSurvived.length === 1);

// A foreign entry must not be deletable — this is the user scope in the action.
const [foreign] = await db
  .insert(symptomEntries)
  .values({
    userId: otherUser.id,
    occurredAt: nightSymptom,
    logDate: symptomLogDate,
    severity: 3,
  })
  .returning({ id: symptomEntries.id });
const notMine = await db
  .delete(symptomEntries)
  .where(
    and(eq(symptomEntries.id, foreign.id), eq(symptomEntries.userId, user.id))
  )
  .returning({ id: symptomEntries.id });
check("another account's entry is not deletable", notMine.length === 0);
await db.delete(symptomEntries).where(eq(symptomEntries.id, foreign.id));

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

// --- Seed idempotency ---
//
// The whole point of `db:seed` is that it can be re-run: migrate.ts calls it on
// every deploy. It could not, for a long time — food_tag_def and symptom_type
// were unique on (user_id, key) with the default NULLS DISTINCT, so global rows
// (user_id IS NULL) never collided, the upsert never fired, and each deploy
// added another full set. It reached 4x in production before anyone noticed,
// because nothing here looked at more than `.limit(1)`.
console.log('\nseed idempotency');

await seedLookups(db);
await seedLookups(db);

const globalDupes = await db.execute(sql`
  select 'food_tag_def' as table_name, key, count(*) as n
  from food_tag_def where user_id is null group by key having count(*) > 1
  union all
  select 'symptom_type', key, count(*)
  from symptom_type where user_id is null group by key having count(*) > 1
  union all
  select 'joint', key, count(*)
  from joint group by key having count(*) > 1
`);
check(
  'seeding twice leaves one row per key',
  globalDupes.length === 0,
  globalDupes.length > 0 ? JSON.stringify(globalDupes.slice(0, 3)) : ''
);

// The seed arrays are themselves duplicate-free, so the totals are exact.
const [tagCount] = await db.execute<{ n: number }>(
  sql`select count(*)::int as n from food_tag_def where user_id is null`
);
const [symptomCount] = await db.execute<{ n: number }>(
  sql`select count(*)::int as n from symptom_type where user_id is null`
);
check('53 global tag definitions', tagCount.n === 53, String(tagCount.n));
check('47 global symptom types', symptomCount.n === 47, String(symptomCount.n));

// The constraint, not the seed, is what makes the above true. Verify it
// directly: NULLS NOT DISTINCT is the difference between a rejected insert and
// a silent duplicate.
await expectReject('a second global tag with the same key is rejected', () =>
  db.insert(foodTagDefs).values({
    userId: null,
    key: 'gluten',
    labelDe: 'Duplikat',
    category: 'trigger',
  })
);

// A user's own tag may reuse a global key — that is a different row, and the
// constraint must still allow it.
const [ownTag] = await db
  .insert(foodTagDefs)
  .values({
    userId: user.id,
    key: 'gluten',
    labelDe: 'Eigene Kennzeichnung',
    category: 'custom',
  })
  .returning({ id: foodTagDefs.id });
check('a per-user tag may reuse a global key', !!ownTag);
await db.delete(foodTagDefs).where(eq(foodTagDefs.id, ownTag.id));

// --- BLS catalog -----------------------------------------------------------
//
// The catalog is seeded on every deploy like the lookup tables, so the same
// duplication question applies — but `bls_code` is NOT NULL, so a plain unique
// index is enough and ON CONFLICT actually matches. Verified, not assumed.
console.log('\nbls catalog');

const [catalogCount] = await db.execute<{ n: number }>(
  sql`select count(*)::int as n from food_catalog`
);
check(
  '7140 catalog entries after two seed runs',
  catalogCount.n === 7140,
  String(catalogCount.n)
);

const [everydayCount] = await db.execute<{ n: number }>(
  sql`select count(*)::int as n from food_catalog where is_everyday`
);
check(
  'the everyday shortlist is flagged',
  everydayCount.n === 230,
  String(everydayCount.n)
);

await expectReject('a duplicate bls_code is rejected', () =>
  db.insert(foodCatalog).values({
    blsCode: 'M111300',
    nameDe: 'Duplikat',
    groupKey: 'M',
  })
);

// The measured values have to survive numeric(10,3) intact — this is what the
// `bls_measured` thresholds read, and lactose-free milk sits at 0.05.
const [milk] = await db
  .select()
  .from(foodCatalog)
  .where(eq(foodCatalog.blsCode, 'M111300'))
  .limit(1);
check(
  'milk keeps its measured lactose',
  milk?.lactose100 === 3.89,
  String(milk?.lactose100)
);

const [lactoseFree] = await db
  .select()
  .from(foodCatalog)
  .where(eq(foodCatalog.blsCode, 'M1E3300'))
  .limit(1);
check(
  'lactose-free milk stays under the 0.5 threshold',
  lactoseFree?.lactose100 === 0.05,
  String(lactoseFree?.lactose100)
);

// Search ranking. The BLS writes compounds apart — "Hafer Flocken" — and a
// plain ILIKE on what someone actually types therefore returns six kinds of
// Haferflockenauflauf and not the oats. This is the regression guard.
const oatHits = await searchCatalog('haferflocken', 5);
check(
  '"haferflocken" finds "Hafer Flocken" despite the space',
  oatHits[0]?.nameDe === 'Hafer Flocken',
  oatHits.map((h) => h.nameDe).join(' | ')
);

const appleHits = await searchCatalog('apfel', 5);
check(
  'everyday staples outrank the preparations',
  appleHits[0]?.nameDe === 'Apfel roh',
  appleHits.map((h) => h.nameDe).join(' | ')
);

check(
  'a one-character term searches nothing',
  (await searchCatalog('a')).length === 0
);

// Copy-on-use, twice, and from two different accounts: the library is shared
// and unique on the name, so the second pick must find the first food rather
// than fail or fork it.
const [oats] = await db
  .select()
  .from(foodCatalog)
  .where(eq(foodCatalog.blsCode, 'C133000'))
  .limit(1);

const firstPick = await copyCatalogEntryToLibrary(user.id, oats.id);
const secondPick = await copyCatalogEntryToLibrary(otherUser.id, oats.id);
check(
  'two accounts picking the same entry share one food',
  firstPick.ok &&
    secondPick.ok &&
    firstPick.foodId === secondPick.foodId &&
    firstPick.created &&
    !secondPick.created,
  JSON.stringify({ firstPick, secondPick })
);

if (firstPick.ok) {
  const [copied] = await db
    .select()
    .from(foods)
    .where(eq(foods.id, firstPick.foodId))
    .limit(1);
  check('the copy records its origin', copied?.blsCatalogId === oats.id);
  check('the copy is marked as coming from the BLS', copied?.source === 'bls');
  check(
    'the nutrient snapshot came across',
    copied?.kcal100 === oats.kcal100,
    `${copied?.kcal100} vs ${oats.kcal100}`
  );

  // Oats are group C with no measured lactose or alcohol, so the interesting
  // assertion is the negative one: no trigger tag invented out of nothing.
  const copiedTags = await db
    .select({ key: foodTagDefs.key })
    .from(foodTags)
    .innerJoin(foodTagDefs, eq(foodTagDefs.id, foodTags.tagId))
    .where(eq(foodTags.foodId, firstPick.foodId));
  const keys = copiedTags.map((t) => t.key);
  check(
    'oats are tagged grain by the keyword rules',
    keys.includes('grain'),
    keys.join(',')
  );
  // Oats are not a gluten grain — tagRules.ts leaves 'hafer' out of the gluten
  // pattern deliberately, and the catalog copy must not reintroduce it.
  check('oats are not tagged gluten', !keys.includes('gluten'), keys.join(','));
  check(
    'oats get no lactose tag from a zero measurement',
    !keys.includes('lactose'),
    keys.join(',')
  );

  await db.delete(foodTags).where(eq(foodTags.foodId, firstPick.foodId));
  await db.delete(foods).where(eq(foods.id, firstPick.foodId));
}

// --- Analysis --------------------------------------------------------------
//
// Only what Postgres can actually prove: that the range queries return what the
// pure pipeline expects, that a numeric column round-trips, and that the
// null-versus-zero contract of the BLS measurements survives a real join. The
// statistics themselves are Vitest's job and need no database.
console.log('\nanalysis');

{
  const ANALYSIS_FROM = '2026-04-01';
  const ANALYSIS_TO = '2026-04-20';
  const analysisDays = eachLogDate(ANALYSIS_FROM, ANALYSIS_TO);

  // Clear this section's own fixture first.
  //
  // The rest of the script cleans up at the end, which is fine until a run
  // crashes halfway — then the next run inserts a second set of meals on top of
  // the first and every count silently doubles. That failure mode already cost
  // one debugging round, and the assertions here are exact counts, so the
  // fixture is made idempotent rather than trusted to exit cleanly.
  await db.delete(mealItems).where(
    sql`${mealItems.mealId} in (
        select id from meal
        where user_id = ${user.id}
          and log_date between ${ANALYSIS_FROM} and ${ANALYSIS_TO}
      )`
  );
  await db
    .delete(meals)
    .where(
      and(
        eq(meals.userId, user.id),
        sql`${meals.logDate} between ${ANALYSIS_FROM} and ${ANALYSIS_TO}`
      )
    );
  await db
    .delete(symptomEntries)
    .where(
      and(
        eq(symptomEntries.userId, user.id),
        sql`${symptomEntries.logDate} between ${ANALYSIS_FROM} and ${addDays(ANALYSIS_TO, 1)}`
      )
    );
  await db
    .delete(dailyLogs)
    .where(
      and(
        eq(dailyLogs.userId, user.id),
        sql`${dailyLogs.logDate} between ${ANALYSIS_FROM} and ${ANALYSIS_TO}`
      )
    );
  await db
    .delete(eliminationProtocols)
    .where(
      and(
        eq(eliminationProtocols.userId, user.id),
        eq(eliminationProtocols.name, 'Analyse-Protokoll')
      )
    );
  await db.delete(menstrualEvents).where(eq(menstrualEvents.userId, user.id));
  await db.delete(analysisRuns).where(eq(analysisRuns.userId, user.id));
  await db
    .delete(medications)
    .where(
      and(
        eq(medications.userId, user.id),
        eq(medications.name, 'Analyse-Prednisolon')
      )
    );

  // A second food with no BLS link at all, so the coverage share has something
  // to be a share OF.
  const [offFood] = await db
    .insert(foods)
    .values({
      createdByUserId: user.id,
      name: 'Analyse-Fertiggericht',
      source: 'off',
      kcal100: 120,
    })
    .onConflictDoNothing()
    .returning({ id: foods.id });
  const offFoodId =
    offFood?.id ??
    (
      await db
        .select({ id: foods.id })
        .from(foods)
        .where(sql`lower(${foods.name}) = 'analyse-fertiggericht'`)
    )[0].id;

  // A BLS-linked food with MEASURED lactose, and one with a measured zero.
  const [milkCatalog] = await db
    .select({ id: foodCatalog.id, lactose: foodCatalog.lactose100 })
    .from(foodCatalog)
    .where(sql`${foodCatalog.lactose100} > 3`)
    .limit(1);
  const [zeroCatalog] = await db
    .select({ id: foodCatalog.id })
    .from(foodCatalog)
    .where(eq(foodCatalog.lactose100, 0))
    .limit(1);

  check(
    'the catalog has a measured-lactose entry to test with',
    Boolean(milkCatalog) && Boolean(zeroCatalog)
  );

  const [blsFood] = await db
    .insert(foods)
    .values({
      createdByUserId: user.id,
      name: 'Analyse-Milch',
      source: 'bls',
      blsCatalogId: milkCatalog.id,
      kcal100: 64,
    })
    .onConflictDoNothing()
    .returning({ id: foods.id });
  const blsFoodId =
    blsFood?.id ??
    (
      await db
        .select({ id: foods.id })
        .from(foods)
        .where(sql`lower(${foods.name}) = 'analyse-milch'`)
    )[0].id;

  // Tag both analysis foods with gluten so exposure has something to sum.
  await db
    .insert(foodTags)
    .values([
      {
        foodId: blsFoodId,
        tagId: glutenTag.id,
        source: 'manual',
        confidence: 'certain',
      },
      {
        foodId: offFoodId,
        tagId: glutenTag.id,
        source: 'rule',
        confidence: 'trace',
      },
    ])
    .onConflictDoNothing();

  // Two meals on day 1: two items in the first, one in the second. This is what
  // proves the exposure sum crosses BOTH boundaries.
  const dayOne = analysisDays[0];
  const [mealA] = await db
    .insert(meals)
    .values({
      userId: user.id,
      slot: 'breakfast',
      occurredAt: new Date(`${dayOne}T07:00:00Z`),
      logDate: dayOne,
    })
    .returning({ id: meals.id });
  const [mealB] = await db
    .insert(meals)
    .values({
      userId: user.id,
      slot: 'lunch',
      occurredAt: new Date(`${dayOne}T11:00:00Z`),
      logDate: dayOne,
    })
    .returning({ id: meals.id });

  await db.insert(mealItems).values([
    // Same meal, same tag, two items: 30 + 20 = 50.
    { mealId: mealA.id, foodId: blsFoodId, grams: 30, quantity: 30, unit: 'g' },
    { mealId: mealA.id, foodId: blsFoodId, grams: 20, quantity: 20, unit: 'g' },
    // A second meal on the same day: another 40, so the day totals 90.
    { mealId: mealB.id, foodId: blsFoodId, grams: 40, quantity: 40, unit: 'g' },
    // And an unmeasured food, defaulted to one portion, so the shares differ.
    {
      mealId: mealB.id,
      foodId: offFoodId,
      grams: 100,
      quantity: 1,
      unit: 'portion',
    },
  ]);

  // A daily log on day 1 only, so the dense grid has to invent nothing for the
  // other nineteen days.
  await db
    .insert(dailyLogs)
    .values({ userId: user.id, logDate: dayOne, jointPain: 6, fatigue: 4 })
    .onConflictDoUpdate({
      target: [dailyLogs.userId, dailyLogs.logDate],
      set: { jointPain: 6, fatigue: 4 },
    });

  // A symptom in the small hours AFTER the range ends: its log_date is the last
  // day of the range, but its instant is past it.
  const afterRange = new Date(`${addDays(ANALYSIS_TO, 1)}T01:30:00Z`);
  await db.insert(symptomEntries).values({
    userId: user.id,
    occurredAt: afterRange,
    logDate: toLogDate(afterRange, TZ, START),
    severity: 6,
  });

  // A three-day elimination protocol inside the range.
  const [protocol] = await db
    .insert(eliminationProtocols)
    .values({ userId: user.id, name: 'Analyse-Protokoll', status: 'active' })
    .returning({ id: eliminationProtocols.id });
  await db.insert(eliminationPhases).values({
    protocolId: protocol.id,
    kind: 'elimination',
    name: 'Phase',
    startsOn: analysisDays[5],
    endsOn: analysisDays[7],
    sortOrder: 0,
  });

  // A steroid with a CLOSED schedule version followed by a lower one — a taper.
  const [pred] = await db
    .insert(medications)
    .values({
      userId: user.id,
      name: 'Analyse-Prednisolon',
      activeSubstance: 'Prednisolon',
      category: 'steroid',
      form: 'tablet',
    })
    .returning({ id: medications.id });
  const [oldVersion] = await db
    .insert(medicationSchedules)
    .values({
      medicationId: pred.id,
      kind: 'daily',
      validFrom: ANALYSIS_FROM,
      validTo: analysisDays[9],
    })
    .returning({ id: medicationSchedules.id });
  const [newVersion] = await db
    .insert(medicationSchedules)
    .values({
      medicationId: pred.id,
      kind: 'daily',
      validFrom: analysisDays[10],
    })
    .returning({ id: medicationSchedules.id });
  await db.insert(medicationScheduleDoses).values([
    {
      scheduleId: oldVersion.id,
      timeOfDay: '08:00',
      doseAmount: 10,
      doseUnit: 'mg',
    },
    {
      scheduleId: newVersion.id,
      timeOfDay: '08:00',
      doseAmount: 5,
      doseUnit: 'mg',
    },
  ]);

  await db
    .insert(menstrualEvents)
    .values({
      userId: user.id,
      eventDate: analysisDays[2],
      kind: 'period_start',
    })
    .onConflictDoNothing();

  /* --- the queries ------------------------------------------------------- */

  const [
    logs,
    mealRows,
    exposureRows,
    measuredRows,
    symptomRows,
    tagDefs,
    steroidSchedules,
    intakes,
    menstrual,
    protocolIntervals,
    catalog,
  ] = await Promise.all([
    dailyLogRange(user.id, ANALYSIS_FROM, ANALYSIS_TO),
    mealRange(user.id, ANALYSIS_FROM, ANALYSIS_TO),
    mealTagExposureRange(user.id, ANALYSIS_FROM, ANALYSIS_TO),
    mealMeasuredRange(user.id, ANALYSIS_FROM, ANALYSIS_TO),
    symptomEntryRange(user.id, ANALYSIS_FROM, ANALYSIS_TO),
    analysedTagDefs(),
    scheduleVersionsRange(user.id, ANALYSIS_FROM, ANALYSIS_TO, ['steroid']),
    intakeRange(user.id, ANALYSIS_FROM, ANALYSIS_TO),
    menstrualEventRange(user.id, addDays(ANALYSIS_FROM, -45), ANALYSIS_TO),
    protocolDayIntervals(user.id, ANALYSIS_FROM, ANALYSIS_TO),
    catalogState(),
  ]);

  check(
    '42 analysed tag definitions',
    tagDefs.length === 42,
    String(tagDefs.length)
  );
  check(
    'the catalog state is recorded for reproducibility',
    catalog.rowCount === 7140,
    String(catalog.rowCount)
  );

  const glutenExposure = exposureRows.filter((r) => r.tagKey === 'gluten');
  const mealAGrams = glutenExposure
    .filter((r) => r.mealId === mealA.id && r.confidence === 'certain')
    .reduce((sum, r) => sum + r.grams, 0);
  check(
    'exposure sums two items inside one meal (50 g)',
    mealAGrams === 50,
    String(mealAGrams)
  );

  const trace = glutenExposure.find((r) => r.confidence === 'trace');
  check('the trace assignment is returned separately', Boolean(trace));

  // The symptom past the range end must be reachable, or the last day loses its
  // late-window outcomes without any sign that it did.
  check(
    'the symptom fetch reaches past the range end',
    symptomRows.some((r) => r.occurredAt.getTime() === afterRange.getTime()),
    String(symptomRows.length)
  );

  check(
    'the closed steroid version is returned, not just the current one',
    steroidSchedules.length === 2,
    String(steroidSchedules.length)
  );

  const protocolDayCount = protocolIntervals.reduce((sum, interval) => {
    const days = eachLogDate(interval.startsOn, interval.endsOn ?? ANALYSIS_TO);
    return sum + days.length;
  }, 0);
  check(
    'the protocol covers three days',
    protocolDayCount === 3,
    String(protocolDayCount)
  );

  /* --- the dense grid and the null-versus-zero contract ------------------ */

  const factsInput = {
    range: { from: ANALYSIS_FROM, to: ANALYSIS_TO },
    settings: { timeZone: TZ, dayStartHour: START, countTraceExposure: false },
    dailyLogs: logs,
    meals: mealRows,
    exposures: exposureRows,
    measured: measuredRows,
    symptoms: symptomRows,
    tagDefs,
    steroidSchedules,
    steroidMedications: new Map([
      [
        pred.id,
        {
          id: pred.id,
          name: 'Analyse-Prednisolon',
          activeSubstance: 'Prednisolon',
        },
      ],
    ]),
    dmardSchedules: [],
    intakes,
    menstrual,
    protocolIntervals,
  };

  const facts = assembleFacts(factsInput);

  check(
    'one fact row per calendar day, including unlogged ones',
    facts.days.length === analysisDays.length,
    `${facts.days.length} vs ${analysisDays.length}`
  );

  const unloggedDay = facts.days[3];
  check(
    'a day with no daily_log has raIndex null, NOT zero',
    unloggedDay.raIndex === null,
    String(unloggedDay.raIndex)
  );
  check('and it is marked as having no log', unloggedDay.hasDailyLog === false);

  const firstDay = facts.days[0];
  check(
    'the day exposure sums across both meals (90 g)',
    firstDay.gramsByTagKey.gluten === 90,
    String(firstDay.gramsByTagKey.gluten)
  );

  // 90 g of measured food against 100 g of unmeasured: the share must be the
  // GRAM share, not the average of the per-meal shares.
  check(
    'blsGramsShare is gram-weighted (90/190)',
    Math.abs(firstDay.blsGramsShare - 90 / 190) < 1e-9,
    firstDay.blsGramsShare.toFixed(4)
  );
  // The 100 g portion default is not a stated amount; the three gram entries are.
  check(
    'portionEvidenceShare excludes the defaulted portion (90/190)',
    Math.abs(firstDay.portionEvidenceShare - 90 / 190) < 1e-9,
    firstDay.portionEvidenceShare.toFixed(4)
  );

  const measuredDose = firstDay.doseByTagKey.lactose ?? 0;
  const expectedDose = (90 / 100) * (milkCatalog.lactose ?? 0);
  check(
    'the measured lactose dose scales with grams and skips unmeasured food',
    Math.abs(measuredDose - expectedDose) < 1e-6,
    `${measuredDose.toFixed(3)} vs ${expectedDose.toFixed(3)}`
  );

  const protocolFactDays = facts.days.filter((d) => d.inProtocol).length;
  check(
    'three days are inside the protocol',
    protocolFactDays === 3,
    String(protocolFactDays)
  );

  // The steroid dose on a day covered by the CLOSED version must use that
  // version's 10 mg, not the newer 5 mg.
  const taperBefore = facts.days[8].steroidMgPredEq;
  const taperAfter = facts.days[12].steroidMgPredEq;
  check(
    'the closed schedule version drives its own days (10 mg)',
    taperBefore === 10,
    String(taperBefore)
  );
  check(
    'the newer version drives the later days (5 mg)',
    taperAfter === 5,
    String(taperAfter)
  );

  const cycleDay = facts.days[2].cycleDay;
  check(
    'the cycle day is derived from the event',
    cycleDay === 1,
    String(cycleDay)
  );

  /* --- the trace switch, in BOTH directions ------------------------------ */

  const withoutTrace = assembleFacts(factsInput).days[0].gramsByTagKey.gluten;
  const withTrace = assembleFacts({
    ...factsInput,
    settings: { ...factsInput.settings, countTraceExposure: true },
  }).days[0].gramsByTagKey.gluten;

  check(
    'trace exposure is excluded by default (90 g)',
    withoutTrace === 90,
    String(withoutTrace)
  );
  // A one-directional test would pass even against a filter that was ripped out.
  check(
    'and included when the setting says so (190 g)',
    withTrace === 190,
    String(withTrace)
  );

  /* --- a stored run round-trips and reproduces --------------------------- */

  const first = await runAnalysisForUser(user.id, {
    from: ANALYSIS_FROM,
    to: ANALYSIS_TO,
    bootstrapResamples: 50,
    rotationResamples: 50,
    now: new Date('2026-04-21T10:00:00Z'),
  });

  const storedParams = analysisParamsSchema.safeParse(first.params);
  const storedResults = analysisResultsSchema.safeParse(first.findings);
  check('the run params round-trip through zod', storedParams.success);
  check('the run results round-trip through zod', storedResults.success);
  check(
    'the catalog state is stored with the run',
    first.params.catalog.rowCount === 7140,
    String(first.params.catalog.rowCount)
  );

  const second = await runAnalysisForUser(user.id, {
    from: ANALYSIS_FROM,
    to: ANALYSIS_TO,
    bootstrapResamples: 50,
    rotationResamples: 50,
    now: new Date('2026-04-21T11:00:00Z'),
  });

  /* --- every factor is visible, and only the solid ones are judged -------- */

  // The premise of the whole change: nothing is hidden. Twenty days of fixture
  // cannot pass a single gate, and every one of the 51 factors is still present.
  check(
    'all factors are present, none hidden',
    first.findings.length === 51,
    String(first.findings.length)
  );

  const byStatus = {
    confirmatory: first.findings.filter((f) => f.status === 'confirmatory')
      .length,
    provisional: first.findings.filter((f) => f.status === 'provisional')
      .length,
    notComputable: first.findings.filter((f) => f.status === 'not_computable')
      .length,
  };
  check(
    'twenty days of fixture produce nothing confirmatory',
    byStatus.confirmatory === 0,
    JSON.stringify(byStatus)
  );

  // The inversion of the old assertion: a thin factor used to be withheld, and
  // is now shown — with counts, and with no verdict attached.
  const thin = first.findings.find((f) => f.key === 'gluten');
  check('a thin factor is visible rather than withheld', Boolean(thin));
  check(
    'and carries no verdict, q-value or rank',
    thin?.label === null && thin?.qValue === null && thin?.rank === null,
    `${thin?.label} ${thin?.qValue} ${thin?.rank}`
  );
  check(
    'and sits at the bottom of the reliability scale',
    thin?.reliability.level === 1,
    String(thin?.reliability.level)
  );
  check(
    'and names something recordable, never "more reactions"',
    thin?.reliability.bindingGate !== 'notableReactionsTotal',
    String(thin?.reliability.bindingGate)
  );

  // The reliability score must come from factor gates only — the global ones are
  // identical for every factor, so including them would make the whole column
  // one number.
  const levels = new Set(first.findings.map((f) => f.reliability.level));
  check(
    'the reliability level varies between factors',
    levels.size > 1,
    [...levels].join(',')
  );

  // BH counts only what it tested. With nothing confirmatory, m is zero even
  // though 51 factors are on screen.
  check(
    'the BH family counts only confirmatory factors',
    first.params.fdr.families.food_tag.m === 0,
    String(first.params.fdr.families.food_tag.m)
  );

  const firstKeys = first.findings.map(
    (f) => `${f.key}:${f.effect?.point ?? 'x'}`
  );
  const secondKeys = second.findings.map(
    (f) => `${f.key}:${f.effect?.point ?? 'x'}`
  );
  check(
    'two runs over the same range are byte-identical',
    JSON.stringify(firstKeys) === JSON.stringify(secondKeys)
  );

  const storedRuns = await db
    .select({ id: analysisRuns.id })
    .from(analysisRuns)
    .where(eq(analysisRuns.userId, user.id));
  check(
    'every run is persisted',
    storedRuns.length === 2,
    String(storedRuns.length)
  );

  /* --- the N+1 guard ----------------------------------------------------- */

  const longStart = Date.now();
  await runAnalysisForUser(user.id, {
    from: '2025-04-01',
    to: '2026-04-20',
    bootstrapResamples: 50,
    rotationResamples: 50,
    now: new Date('2026-04-21T12:00:00Z'),
  });
  const longMs = Date.now() - longStart;
  // Blunt, but it is the only thing that catches a per-day query creeping into
  // the loader.
  check(`a 385-day run stays under 15 s (${longMs} ms)`, longMs < 15_000);

  await db.delete(analysisRuns).where(eq(analysisRuns.userId, user.id));
  await db
    .delete(eliminationProtocols)
    .where(eq(eliminationProtocols.id, protocol.id));
  await db.delete(menstrualEvents).where(eq(menstrualEvents.userId, user.id));
  await db.delete(mealItems).where(eq(mealItems.mealId, mealA.id));
  await db.delete(mealItems).where(eq(mealItems.mealId, mealB.id));
  await db.delete(foodTags).where(eq(foodTags.foodId, blsFoodId));
  await db.delete(foodTags).where(eq(foodTags.foodId, offFoodId));
}

// --- Progress: streak, coverage, achievements -----------------------------
//
// The two things that can only be checked here: that the day-coverage queries
// put a late-night meal on the right logical day, and that the achievement
// unique index actually makes a second acknowledgement a no-op.
console.log('\nfortschritt');
{
  const anchor = '2026-06-10';
  const dates = eachLogDate(anchor, addDays(anchor, 3));

  // A dinner at 23:30 local on the anchor day, and a second one at 01:00 the
  // following night — which belongs to the SAME logical day.
  const lateEvening = new Date('2026-06-10T21:30:00Z'); // 23:30 Berlin
  const afterMidnight = new Date('2026-06-10T23:00:00Z'); // 01:00 Berlin

  for (const [slot, occurredAt] of [
    ['dinner', lateEvening],
    ['snack', afterMidnight],
  ] as const) {
    const [row] = await db
      .insert(meals)
      .values({
        userId: user.id,
        slot,
        occurredAt,
        logDate: toLogDate(occurredAt, TZ, START),
      })
      .returning({ id: meals.id });
    await db
      .insert(mealItems)
      .values({ mealId: row.id, foodId, quantity: 1, unit: 'g', grams: 100 });
  }

  await db
    .insert(dailyLogs)
    .values({ userId: user.id, logDate: anchor, jointPain: 4 })
    .onConflictDoNothing();

  const slotDays = await mealSlotDays(user.id, anchor, addDays(anchor, 3));
  const onAnchor = slotDays
    .filter((row) => row.logDate === anchor)
    .map((row) => row.slot)
    .sort();
  check(
    'a 23:30 and a 01:00 meal land on the same logical day',
    onAnchor.join(',') === 'dinner,snack',
    onAnchor.join(',')
  );
  check(
    'no meal leaks onto the following day',
    slotDays.every((row) => row.logDate === anchor),
    slotDays.map((row) => row.logDate).join(',')
  );

  // An empty meal must not prop up a streak: the query joins meal_item.
  const [emptyMeal] = await db
    .insert(meals)
    .values({
      userId: user.id,
      slot: 'lunch',
      occurredAt: new Date('2026-06-11T10:00:00Z'),
      logDate: addDays(anchor, 1),
    })
    .returning({ id: meals.id });
  const afterEmpty = await mealSlotDays(user.id, anchor, addDays(anchor, 3));
  check(
    'a meal with no items does not count as food',
    afterEmpty.every((row) => row.logDate === anchor)
  );
  await db.delete(meals).where(eq(meals.id, emptyMeal.id));

  const first = await firstActivityLogDate(user.id);
  check(
    'first activity is not after the anchor',
    first !== null && first <= anchor,
    String(first)
  );

  const symptomOn = await symptomDays(user.id, anchor, addDays(anchor, 3));
  check(
    'symptom days query returns only its range',
    symptomOn.every((day) => dates.includes(day)),
    symptomOn.join(',')
  );

  // The streak over the real coverage of those four days: only the anchor has
  // both a meal and a daily log, so exactly one day counts.
  const streak = computeStreak(
    dates.map((logDate) => ({
      logDate,
      slots: afterEmpty
        .filter((row) => row.logDate === logDate)
        .map((row) => row.slot),
      hasDailyLog: logDate === anchor,
      coreFilled: logDate === anchor ? 1 : 0,
      hasWellbeing: false,
      hasSymptom: false,
    })),
    anchor,
    addDays(anchor, 3)
  );
  check(
    'exactly the anchor day counts',
    streak.countedDays === 1,
    String(streak.countedDays)
  );

  // The full read path, against real rows.
  const progress = await loadProgress(user.id, '2026-06-13');
  check('progress loads', progress.window.length > 0);
  check(
    "today's completeness has all four blocks",
    progress.todayCompleteness.blocks.length === 4,
    String(progress.todayCompleteness.blocks.length)
  );
  // The medication block must track the actual plan, not a guess about it. So
  // regenerate the due list the same way the loader does and assert the block
  // agrees — including the case that matters, "nothing due" reading as not
  // applicable rather than as nought per cent.
  const dueThatDay = expandDueDoses(
    await scheduleVersionsRange(user.id, '2026-06-13', '2026-06-13', [
      'csdmard',
      'bdmard',
      'tsdmard',
      'nsaid',
      'steroid',
      'analgesic',
      'supplement',
      'other',
    ]),
    '2026-06-13'
  );
  const medsBlock = progress.todayCompleteness.blocks.find(
    (block) => block.key === 'meds'
  );
  check(
    'the medication block is applicable exactly when a dose was due',
    medsBlock !== undefined && medsBlock.applicable === dueThatDay.length > 0,
    `due=${dueThatDay.length} applicable=${medsBlock?.applicable}`
  );
  check(
    'the milestone catalogue is complete',
    progress.milestones.length === 8,
    String(progress.milestones.length)
  );

  // Acknowledging twice must be idempotent — a double tap or a second tab.
  for (let i = 0; i < 2; i++) {
    await db
      .insert(achievements)
      .values({ userId: user.id, key: 'streak_7', achievedOn: anchor })
      .onConflictDoNothing();
  }
  const ackRows = await db
    .select({ key: achievements.key })
    .from(achievements)
    .where(eq(achievements.userId, user.id));
  check(
    'acknowledging twice leaves one row',
    ackRows.length === 1,
    String(ackRows.length)
  );

  await expectReject('duplicate achievement rejected without the guard', () =>
    db
      .insert(achievements)
      .values({ userId: user.id, key: 'streak_7', achievedOn: anchor })
  );

  await db.delete(achievements).where(eq(achievements.userId, user.id));
}

// Clean up. Meals have to go first: meal_item.food_id is deliberately
// ON DELETE RESTRICT so that deleting a food can never quietly erase history,
// which means a user row cannot be removed while meals still reference foods.
await db.delete(meals).where(eq(meals.userId, user.id));
await db.delete(appUsers).where(eq(appUsers.id, otherUser.id));
await db.delete(appUsers).where(eq(appUsers.id, user.id));
console.log('\ntest users removed');

console.log(
  failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`
);
process.exit(failures === 0 ? 0 : 1);
