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
import { menstrualEventsForDay } from '@/db/queries/analysis';
import {
  activeSchedules,
  asNeededMedications,
  intakesForDay,
} from '@/db/queries/medication';
import { expandDueDoses } from '@/services/medication/schedule';
import { loadProgress } from '@/services/progress/loader';
import { NO_NUTRITION } from '@/services/progress/milestones';
import {
  DAY_PRIORITY,
  loadNutrition,
  nutritionMilestoneInput,
} from '@/services/nutrition/loader';
import { DayGoals } from '@/components/nutrition/day-goals';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { SectionLabel } from '@/components/ui/section-label';
import { DailyLogForm } from '@/components/daily/daily-log-form';
import { DayHeader } from '@/components/day/day-header';
import { MilestoneCelebration } from '@/components/progress/milestone-celebration';
import { StreakHero } from '@/components/progress/streak-hero';
import { DaySummary } from '@/components/day/day-summary';
import { MealSlotSection } from '@/components/meal/meal-slot-section';
import { DueDoses, type DueDoseView } from '@/components/medication/due-doses';
import { ReactionDisclosure } from '@/components/symptom/reaction-disclosure';
import { SymptomEntryRow } from '@/components/symptom/symptom-entry-row';
import { sumNutrients } from '@/lib/nutrition';
import {
  MEAL_SLOT_ORDER,
  defaultLagSince,
  type MealSlotKey,
  type OnsetLagKey,
} from '@/lib/scales';
import {
  daysBetween,
  isBeforeDayBoundary,
  timeOfDayOf,
  todayLogDate,
  type LogDate,
} from '@/lib/time';

/**
 * The whole app is really this one screen. Everything else is secondary.
 */
export async function DayView({ logDate }: { logDate: LogDate }) {
  const { user, settings } = await requireUserWithSettings();
  const today = todayLogDate(settings.timeZone, settings.dayStartHour);
  // Negative is in the past. Read once here so the header and everything that
  // depends on "is this today" agree within a render.
  const offsetDays = daysBetween(today, logDate);

  /*
   * Hoisted out of the `Promise.all` because two of its entries need it: the
   * nutrient block renders it, and the milestone evaluation inside
   * `loadProgress` reads a summary of it at the very end. Starting it here lets
   * both of those wait on the same single read instead of racing two.
   */
  const nutritionPromise =
    offsetDays === 0
      ? loadNutrition(user.id, { to: logDate })
      : Promise.resolve(null);

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
    cycleEvents,
    nutrition,
    progress,
  ] = await Promise.all([
    getDayMeals(user.id, logDate),
    getDailyLog(user.id, logDate),
    allSymptomTypes(),
    das28Joints(),
    getStandaloneSymptoms(user.id, logDate),
    recentFoods(),
    activeSchedules(user.id, logDate),
    intakesForDay(user.id, logDate),
    asNeededMedications(user.id),
    settings.trackCycle
      ? menstrualEventsForDay(user.id, logDate)
      : Promise.resolve<string[]>([]),
    // Only for today, like the progress read below and for the same reason.
    nutritionPromise,
    // Only for today. A dated day is a record of what happened, not a place to
    // be nudged about the streak — and skipping the load keeps the history
    // screens as cheap as they were.
    //
    // The nutrient milestones need the read above, but `loadProgress` only
    // touches it at the very end, so the promise goes in and the two reads
    // still run side by side.
    offsetDays === 0
      ? loadProgress(
          user.id,
          logDate,
          nutritionPromise.then((data) =>
            data === null ? NO_NUTRITION : nutritionMilestoneInput(data)
          )
        )
      : Promise.resolve(null),
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

  // Same reason: the client would format with the module default zone, not with
  // this user's.
  const mealTimes: Record<string, string> = Object.fromEntries(
    meals.map((meal) => [
      meal.id,
      timeOfDayOf(new Date(meal.occurredAt), settings.timeZone),
    ])
  );

  // Both lists of symptom entries in one record: the meal-bound reactions and
  // the meal-less complaints are the same rows and get the same treatment.
  const symptomTimes: Record<string, string> = Object.fromEntries(
    [...meals.flatMap((meal) => meal.reactions), ...standalone].map((entry) => [
      entry.id,
      timeOfDayOf(new Date(entry.occurredAt), settings.timeZone),
    ])
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
      <DayHeader
        logDate={logDate}
        offsetDays={offsetDays}
        dayStartHour={settings.dayStartHour}
        showBoundaryHint={
          offsetDays === 0 &&
          isBeforeDayBoundary(settings.timeZone, settings.dayStartHour)
        }
      />

      {progress ? (
        <>
          {/* One at a time. Two badges in a row would turn a milestone into a
           * queue to clear rather than a moment. */}
          {progress.pending.length > 0 ? (
            <MilestoneCelebration
              milestoneKey={progress.pending[0].key}
              title={progress.pending[0].title}
              description={progress.pending[0].description}
            />
          ) : null}
          <StreakHero
            streak={progress.streak}
            completeness={progress.todayCompleteness}
          />
        </>
      ) : null}

      <DaySummary
        totals={dayTotals}
        itemCount={allItems.length}
        jointPain={dailyLog?.jointPain ?? null}
        fatigue={dailyLog?.fatigue ?? null}
        wellbeing={dailyLog?.wellbeing ?? null}
        isFlare={dailyLog?.isFlare ?? false}
        goals={
          nutrition?.today_ && nutrition.blocked === null ? (
            <DayGoals
              day={nutrition.today_}
              priority={DAY_PRIORITY}
              coverageShare={
                nutrition.raw[nutrition.raw.length - 1]?.blsGramsShare ?? 0
              }
            />
          ) : null
        }
      />

      {/* Anchor targets for the "noch offen" chips in the streak hero. */}
      <section id="mahlzeiten" className="scroll-mt-16">
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
              times={mealTimes}
              reactionTimes={symptomTimes}
              // Snacks and drinks stay collapsed until used: five expanded
              // slots would push the daily check far below the fold.
              compact={slot === 'snack' || slot === 'drink'}
              showEmptyHint={index === 0 && recent.length === 0}
            />
          ))}
        </ol>
      </section>

      <div id="medikamente" className="scroll-mt-16">
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
      </div>

      <div id="tagescheck" className="scroll-mt-16">
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
          trackCycle={settings.trackCycle}
          cycleEvents={cycleEvents}
        />
      </div>

      <Card variant="sunken">
        <CardHeader>
          <CardTitle>Beschwerden ohne Mahlzeit</CardTitle>
          <CardMeta>
            Zum Beispiel nachts oder morgens – gehört zu keinem Essen.
          </CardMeta>
        </CardHeader>

        {standalone.length > 0 ? (
          <ul className="mb-3 space-y-1.5">
            {standalone.map((entry, index) => (
              <SymptomEntryRow
                key={entry.id}
                entry={entry}
                time={symptomTimes[entry.id] ?? ''}
                fallbackLabel="Beschwerden"
                index={index}
                className="bg-card"
              />
            ))}
          </ul>
        ) : null}

        <ReactionDisclosure
          label="Beschwerden erfassen"
          mealId={null}
          symptomTypes={symptomTypes}
        />
      </Card>
    </main>
  );
}
