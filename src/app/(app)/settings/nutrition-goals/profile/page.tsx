import { requireUserWithSettings } from '@/auth.helpers';
import { PageHeader } from '@/components/ui/page-header';
import {
  GoalProfileForm,
  type ProfileFormValues,
} from '@/components/nutrition/goal-profile-form';
import { openNutritionProfile, weightRange } from '@/db/queries/nutrition';
import { loadTargets } from '@/services/nutrition/loader';
import { addDays, formatLogDateShort, todayLogDate } from '@/lib/time';

export const metadata = { title: 'Nährstoff-Profil – Wellbeing' };

/**
 * The questionnaire's server shell.
 *
 * `currentYear` is resolved here and handed down. A `new Date().getFullYear()`
 * in the client is the same class of mistake as a client-side `log_date`, only
 * milder — it reads a clock the server owns.
 */
export default async function NutritionProfilePage() {
  const { user, settings } = await requireUserWithSettings();
  const today = todayLogDate(settings.timeZone, settings.dayStartHour);

  const [profile, weights, targets] = await Promise.all([
    openNutritionProfile(user.id),
    weightRange(user.id, addDays(today, -28), today),
    loadTargets(user.id),
  ]);

  const latest = weights[weights.length - 1] ?? null;

  const initial: ProfileFormValues = {
    referenceSex: profile?.referenceSex ?? null,
    birthYear: profile?.birthYear ?? null,
    heightCm: profile?.heightCm ?? null,
    activityLevel: profile?.activityLevel ?? 'light',
    goal: profile?.goal ?? 'maintain',
    hasSarcopenia: profile?.hasSarcopenia ?? false,
    menopauseStage: profile?.menopauseStage ?? null,
    dietForm: profile?.dietForm ?? 'omnivore',
    renalImpairment: profile?.renalImpairment ?? false,
    proteinMaxGPerKg: profile?.proteinMaxGPerKg ?? null,
    weightSource: profile?.weightSource ?? 'daily_log',
    referenceWeightKg: profile?.referenceWeightKg ?? null,
  };

  return (
    <main className="space-y-4 p-4">
      <PageHeader
        eyebrow="Nährstoff-Ziele"
        title="Dein Profil"
        description="Daraus werden die Zielwerte abgeleitet. Jede Antwort wird sofort gespeichert."
      />

      <GoalProfileForm
        initial={initial}
        currentYear={Number(today.slice(0, 4))}
        latestWeight={
          latest
            ? { kg: latest.weightKg, onDate: formatLogDateShort(latest.logDate) }
            : null
        }
        acknowledged={
          settings.nutritionAckVersion !== null && settings.nutritionAckAt !== null
        }
        steroidDetected={targets.steroidLongTerm}
      />
    </main>
  );
}
