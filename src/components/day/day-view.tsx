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
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { Disclosure } from '@/components/ui/disclosure';
import { SectionLabel } from '@/components/ui/section-label';
import { SeverityBadge } from '@/components/ui/severity-badge';
import { DailyLogForm } from '@/components/daily/daily-log-form';
import { DayHeader } from '@/components/day/day-header';
import { DaySummary } from '@/components/day/day-summary';
import { MealSlotSection } from '@/components/meal/meal-slot-section';
import { DueDoses, type DueDoseView } from '@/components/medication/due-doses';
import { ReactionSheet } from '@/components/symptom/reaction-sheet';
import { sumNutrients } from '@/lib/nutrition';
import {
  MEAL_SLOT_ORDER,
  ONSET_LAG_LABELS,
  defaultLagSince,
  type MealSlotKey,
  type OnsetLagKey,
} from '@/lib/scales';
import { todayLogDate, type LogDate } from '@/lib/time';

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
    <main className="space-y-6 p-4">
      <DayHeader logDate={logDate} isToday={isToday} />

      <DaySummary
        totals={dayTotals}
        itemCount={allItems.length}
        jointPain={dailyLog?.jointPain ?? null}
        fatigue={dailyLog?.fatigue ?? null}
        wellbeing={dailyLog?.wellbeing ?? null}
        isFlare={dailyLog?.isFlare ?? false}
      />

      <section>
        <SectionLabel className="mb-3">Mahlzeiten</SectionLabel>
        <ol>
          {MEAL_SLOT_ORDER.map((slot, index) => (
            <MealSlotSection
              key={slot}
              slot={slot}
              logDate={logDate}
              index={index}
              meals={meals.filter((meal) => meal.slot === slot)}
              frequent={frequentBySlot[slot] ?? []}
              recent={recent}
              symptomTypes={symptomTypes}
              defaultLags={defaultLags}
              // Snacks and drinks stay collapsed until used: five expanded
              // slots would push the daily check far below the fold.
              compact={slot === 'snack' || slot === 'drink'}
              showEmptyHint={index === 0 && recent.length === 0}
            />
          ))}
        </ol>
      </section>

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

      <Card variant="sunken">
        <CardHeader>
          <CardTitle>Beschwerden ohne Mahlzeit</CardTitle>
          <CardMeta>
            Zum Beispiel nachts oder morgens – gehört zu keinem Essen.
          </CardMeta>
        </CardHeader>

        {standalone.length > 0 ? (
          <ul className="mb-3 space-y-1.5 text-sm">
            {standalone.map((entry, index) => (
              <li
                key={entry.id}
                className="rise-in flex flex-wrap items-center gap-2 rounded-control bg-card px-3 py-2"
                style={{ '--i': index } as React.CSSProperties}
              >
                <SeverityBadge value={entry.severity} />
                <span className="text-fg">
                  {entry.symptoms.length > 0
                    ? entry.symptoms.join(', ')
                    : 'Beschwerden'}
                </span>
                {entry.onsetLag ? (
                  <span className="text-muted">
                    · {ONSET_LAG_LABELS[entry.onsetLag as OnsetLagKey]}
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
    </main>
  );
}
