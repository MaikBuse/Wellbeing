import Link from 'next/link';
import { ScanLine } from 'lucide-react';
import { requireUserWithSettings } from '@/auth.helpers';
import {
  allSymptomTypes,
  das28Joints,
  getDailyLog,
  getDailyLogJoints,
  getDayMeals,
  getStandaloneSymptoms,
} from '@/db/queries/day';
import { frequentFoodsForSlot, recentFoods } from '@/db/queries/foods';
import {
  activeSchedules,
  asNeededMedications,
  intakesForDay,
} from '@/db/queries/medication';
import { expandDueDoses } from '@/services/medication/schedule';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { Disclosure } from '@/components/ui/disclosure';
import { DailyLogForm } from '@/components/daily/daily-log-form';
import { MealSlotCard } from '@/components/meal/meal-slot-card';
import { DueDoses, type DueDoseView } from '@/components/medication/due-doses';
import { ReactionSheet } from '@/components/symptom/reaction-sheet';
import { formatKcal, sumNutrients } from '@/lib/nutrition';
import {
  MEAL_SLOT_ORDER,
  ONSET_LAG_LABELS,
  defaultLagSince,
  type MealSlotKey,
  type OnsetLagKey,
} from '@/lib/scales';
import { formatLogDateLong, todayLogDate, type LogDate } from '@/lib/time';

/**
 * The whole app is really this one screen. Everything else is secondary.
 */
export async function DayView({ logDate }: { logDate: LogDate }) {
  const { user, settings } = await requireUserWithSettings();
  const isToday =
    logDate === todayLogDate(settings.timeZone, settings.dayStartHour);

  const [
    meals,
    dailyLog,
    symptomTypes,
    joints,
    standalone,
    recent,
    schedulesResult,
    intakes,
    asNeeded,
  ] = await Promise.all([
    getDayMeals(user.id, logDate),
    getDailyLog(user.id, logDate),
    allSymptomTypes(),
    das28Joints(),
    getStandaloneSymptoms(user.id, logDate),
    recentFoods(user.id),
    activeSchedules(user.id, logDate),
    intakesForDay(user.id, logDate),
    asNeededMedications(user.id),
  ]);

  const selectedJoints = dailyLog ? await getDailyLogJoints(dailyLog.id) : [];

  // Slot-specific ranking is what makes the common case a single tap: after two
  // weeks the first chips on the breakfast card are her actual breakfast.
  const frequentEntries = await Promise.all(
    MEAL_SLOT_ORDER.map(
      async (slot) => [slot, await frequentFoodsForSlot(user.id, slot)] as const
    )
  );
  const frequentBySlot = Object.fromEntries(frequentEntries) as Record<
    MealSlotKey,
    Awaited<ReturnType<typeof recentFoods>>
  >;

  // Due doses come from the pure schedule expansion; status comes from whatever
  // rows exist. An untouched past dose has no row and stays "open".
  const planned = expandDueDoses(schedulesResult.schedules, logDate);
  const intakeByDose = new Map(
    intakes
      .filter((intake) => intake.scheduleDoseId !== null)
      .map((intake) => [intake.scheduleDoseId as string, intake])
  );
  const dueDoses: DueDoseView[] = planned.map((dose) => {
    const intake = intakeByDose.get(dose.scheduleDoseId);
    const medication = schedulesResult.medicationNames.get(dose.medicationId);
    return {
      scheduleDoseId: dose.scheduleDoseId,
      plannedLogDate: dose.plannedLogDate,
      medicationName: medication?.name ?? 'Medikament',
      activeSubstance: medication?.activeSubstance ?? null,
      timeOfDay: dose.timeOfDay,
      doseAmount: dose.doseAmount,
      doseUnit: dose.doseUnit as DueDoseView['doseUnit'],
      status:
        intake?.status === 'taken'
          ? 'taken'
          : intake?.status === 'skipped'
            ? 'skipped'
            : 'open',
    };
  });

  const takenAsNeeded = intakes
    .filter((intake) => intake.scheduleDoseId === null)
    .map((intake) => ({
      id: intake.id,
      medicationName: intake.medicationName,
      doseAmount: intake.doseAmount,
      doseUnit: intake.doseUnit as DueDoseView['doseUnit'],
    }));

  // Pre-select the reaction lag from how long ago the meal was. Computed here,
  // on the server, because reading the clock during a client render is impure.
  const defaultLags: Record<string, OnsetLagKey> = Object.fromEntries(
    meals.map((meal) => [meal.id, defaultLagSince(new Date(meal.occurredAt))])
  );

  const allItems = meals.flatMap((meal) => meal.items);
  const dayTotals = sumNutrients(
    allItems.map((item) => ({
      kcal: item.kcal,
      proteinG: item.proteinG,
      fatG: item.fatG,
      satFatG: null,
      carbsG: item.carbsG,
      sugarG: null,
      fiberG: null,
      saltG: null,
    }))
  );

  return (
    <main className="space-y-4 p-4">
      <header className="flex items-start justify-between gap-3 pt-2">
        <div>
          <h1 className="text-xl font-semibold text-fg">
            {isToday ? 'Heute' : formatLogDateLong(logDate)}
          </h1>
          <p className="text-sm text-muted">
            {isToday ? formatLogDateLong(logDate) : null}
            {allItems.length > 0
              ? `${isToday ? ' · ' : ''}${formatKcal(dayTotals.kcal)} geschätzt`
              : null}
          </p>
        </div>
        <Button asChild variant="soft" size="sm">
          <Link href="/scan">
            <ScanLine aria-hidden className="size-4" />
            Scannen
          </Link>
        </Button>
      </header>

      {MEAL_SLOT_ORDER.map((slot, index) => (
        <MealSlotCard
          key={slot}
          slot={slot}
          logDate={logDate}
          meals={meals.filter((meal) => meal.slot === slot)}
          frequent={frequentBySlot[slot] ?? []}
          recent={recent}
          symptomTypes={symptomTypes}
          defaultLags={defaultLags}
          // Snacks and drinks stay collapsed until used: five expanded slots
          // would push the daily check far below the fold.
          compact={slot === 'snack' || slot === 'drink'}
          showEmptyHint={index === 0 && recent.length === 0}
        />
      ))}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Beschwerden ohne Mahlzeit</CardTitle>
            <CardMeta>
              Zum Beispiel nachts oder morgens – gehört zu keinem Essen.
            </CardMeta>
          </div>
        </CardHeader>

        {standalone.length > 0 ? (
          <ul className="mb-3 space-y-1.5 text-sm">
            {standalone.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl bg-soft/60 px-3 py-2 text-fg"
              >
                <span className="font-medium">{entry.severity}</span>
                {' · '}
                {entry.symptoms.length > 0
                  ? entry.symptoms.join(', ')
                  : 'Beschwerden'}
                {entry.onsetLag ? (
                  <span className="text-muted">
                    {' · '}
                    {ONSET_LAG_LABELS[entry.onsetLag as OnsetLagKey]}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <Disclosure label="Beschwerden erfassen">
          <ReactionSheet mealId={null} symptomTypes={symptomTypes} />
        </Disclosure>
      </Card>

      <DueDoses
        doses={dueDoses}
        asNeeded={asNeeded.map((medication) => ({
          id: medication.id,
          name: medication.name,
          doseAmount: medication.doseAmount,
          doseUnit: medication.doseUnit as DueDoseView['doseUnit'],
        }))}
        takenAsNeeded={takenAsNeeded}
      />

      <DailyLogForm
        logDate={logDate}
        values={{
          jointPain: dailyLog?.jointPain ?? null,
          morningStiffnessMinutes: dailyLog?.morningStiffnessMinutes ?? null,
          fatigue: dailyLog?.fatigue ?? null,
          wellbeing: dailyLog?.wellbeing ?? null,
          isFlare: dailyLog?.isFlare ?? false,
          sleepMinutes: dailyLog?.sleepMinutes ?? null,
          sleepQuality: dailyLog?.sleepQuality ?? null,
          stress: dailyLog?.stress ?? null,
          activityMinutes: dailyLog?.activityMinutes ?? null,
          bristolTypical: dailyLog?.bristolTypical ?? null,
          weightKg: dailyLog?.weightKg ?? null,
          note: dailyLog?.note ?? null,
        }}
        joints={joints.map((joint) => ({
          key: joint.key,
          labelDe: joint.labelDe,
        }))}
        selectedJoints={selectedJoints.map((joint) => joint.jointKey)}
        trackWeight={settings.trackWeight}
      />
    </main>
  );
}
