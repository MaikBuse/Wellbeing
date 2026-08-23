import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { GoalMeter } from '@/components/ui/goal-meter';
import {
  DAY_METER_LIMIT,
  selectDayNutrients,
  toMeterView,
} from '@/lib/nutrition-goals';
import type { NutrientKey } from '@/lib/nutrients';
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
 * Server component. This feature adds no client JavaScript to the day screen.
 */
export function DayGoals({
  day,
  priority,
  coverageShare,
}: {
  day: NutritionDay;
  priority: readonly NutrientKey[];
  coverageShare: number;
}) {
  const chosen = selectDayNutrients(day.nutrients, priority, DAY_METER_LIMIT);
  if (chosen.length === 0) return null;

  return (
    <div className="mt-4 space-y-3 border-t border-line-soft pt-3">
      {day.reason === 'zu_wenig_erfasst' ? (
        <p className="text-xs text-muted">
          Für einen Tageswert fehlt noch eine zweite Hauptmahlzeit. Die Zahlen
          unten sind das, was bisher gemessen werden konnte.
        </p>
      ) : null}

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
        href="/nutrition"
        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary-strong"
      >
        Alle Nährstoffe ansehen
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}
