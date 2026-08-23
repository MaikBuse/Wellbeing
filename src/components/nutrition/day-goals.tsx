import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { GoalMeter } from '@/components/ui/goal-meter';
import { selectDayNutrients, toMeterView } from '@/lib/nutrition-goals';
import { MIN_PORTION_EVIDENCE_SHARE } from '@/services/analysis/exposure';
import { FULL_CREDIT_MAIN_SLOTS } from '@/services/progress/completeness';
import type { NutritionDay } from '@/services/nutrition/types';
import { CoverageNote } from './coverage-note';

/**
 * The nutrient block inside the day summary.
 *
 * Deliberately NOT a card of its own: the day screen has eight widgets and its
 * own comment calls it "the whole app". This lives inside `DaySummary`, which
 * already shows kcal and the macro bar — a nutrient line belongs inside the
 * nutrition widget, not beside it.
 *
 * THREE MACROS AND NOTHING ELSE: carbohydrates, protein, fat. Everything with
 * a target that is not one of those is listed on /nutrition#heute. See
 * `DAY_MACRO_KEYS` for why the previous list could not fill.
 *
 * Server component. This feature adds no client JavaScript to the day screen.
 */
export function DayGoals({
  day,
  coverageShare,
  portionEvidenceShare,
  mainSlots,
}: {
  day: NutritionDay;
  coverageShare: number;
  /** Share of the day's grams whose amount was actually stated. */
  portionEvidenceShare: number;
  /** Distinct main meal slots recorded, for the "why no verdict" line. */
  mainSlots: number;
}) {
  const chosen = selectDayNutrients(day.nutrients);
  if (chosen.length === 0) return null;
  const hint = missingEvidenceHint(portionEvidenceShare, mainSlots);

  return (
    <div className="mt-4 space-y-3 border-t border-line-soft pt-3">
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}

      <div className="space-y-3">
        {chosen.map((assessment) => {
          const view = toMeterView(assessment);
          return (
            <div key={view.key}>
              <GoalMeter
                label={view.label}
                valueText={view.valueText}
                targetText={view.targetText}
                statusText={view.statusText}
                status={view.status}
                fill={view.fill}
                supplementFill={view.supplementFill}
                hasScoredLimit={view.hasScoredLimit}
                isLowerBound={view.isLowerBound}
              />
              {view.supplementNote ? (
                <p className="text-xs text-muted">{view.supplementNote}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <CoverageNote share={coverageShare} />

      <Link
        href="/nutrition#heute"
        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary-strong"
      >
        Alle Nährstoffe ansehen
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}

/**
 * Why the bars carry no verdict yet — named, not guessed.
 *
 * `dayGate` folds three different situations into one `reason`
 * ('zu_wenig_erfasst'), and this block used to print the second-main-meal
 * sentence for all of them. The usual cause is the other one: `quickAddFood`
 * writes `quantity 1, unit 'portion', portionId null` for every food without a
 * default measure, so `portionEvidenceShare` is 0 on a day that may well have
 * three meals in it. Telling someone to add a second meal they already added is
 * worse than saying nothing.
 *
 * Order matters. Without a second main meal the amounts barely matter yet, so
 * that sentence goes first. The third case — most grams outside the catalog —
 * is already stated by `CoverageNote` below the bars.
 */
function missingEvidenceHint(
  portionEvidenceShare: number,
  mainSlots: number
): string | null {
  if (mainSlots < FULL_CREDIT_MAIN_SLOTS) {
    return 'Für einen Tageswert fehlt noch eine zweite Hauptmahlzeit. Die Zahlen unten sind das, was bisher gemessen werden konnte.';
  }
  if (portionEvidenceShare < MIN_PORTION_EVIDENCE_SHARE) {
    return 'Bei den meisten Einträgen steht noch keine Menge — die Zahlen unten sind dann aus der Standardmenge geschätzt und werden nicht bewertet. Über „Menge“ an der Zutat lässt sich das nachtragen.';
  }
  return null;
}
