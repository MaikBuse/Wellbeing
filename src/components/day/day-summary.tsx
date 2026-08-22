import { Flame } from 'lucide-react';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { MacroBar } from '@/components/ui/macro-bar';
import { SectionLabel } from '@/components/ui/section-label';
import { Spotlight } from '@/components/ui/spotlight';
import { Stat, StatGroup } from '@/components/ui/stat';
import { roundKcal, type Nutrients } from '@/lib/nutrition';

/**
 * The focal point of the day screen.
 *
 * Before this, eight visually identical cards were stacked with nothing to
 * anchor the eye. Everything here comes from data day-view already loaded — no
 * extra query.
 *
 * Note the day payload only carries kcal/protein/fat/carbs (see DayMealItem in
 * db/queries/day.ts); sugar, fibre and salt exist in the database but are not
 * fetched for a day, so the bar stays at three macros.
 */
export function DaySummary({
  totals,
  itemCount,
  jointPain,
  fatigue,
  wellbeing,
  isFlare,
}: {
  totals: Nutrients;
  itemCount: number;
  jointPain: number | null;
  fatigue: number | null;
  wellbeing: number | null;
  isFlare: boolean;
}) {
  const kcal = totals.kcal === null ? null : roundKcal(totals.kcal);
  const hasFood = itemCount > 0 && kcal !== null;
  const hasCheck = jointPain !== null || fatigue !== null || wellbeing !== null;

  return (
    <Spotlight className="rounded-card">
      <section className="rounded-card border border-line bg-gradient-to-br from-card via-card to-primary-tint p-4 shadow-raised">
        <SectionLabel>Tagesüberblick</SectionLabel>

        <div className="mt-2 flex items-baseline gap-2">
          {hasFood ? (
            <>
              <AnimatedNumber
                value={kcal}
                className="font-display text-metric font-semibold text-fg"
              />
              <span className="text-sm text-muted">kcal geschätzt</span>
            </>
          ) : (
            <span className="text-section text-muted">
              Noch nichts erfasst
            </span>
          )}
        </div>

        {hasFood ? (
          <MacroBar
            className="mt-3"
            proteinG={totals.proteinG}
            fatG={totals.fatG}
            carbsG={totals.carbsG}
          />
        ) : null}

        {hasCheck || isFlare ? (
          <StatGroup className="mt-4 border-t border-line-soft pt-3">
            {jointPain !== null ? (
              <Stat value={jointPain} unit="/ 10" label="Schmerz" />
            ) : null}
            {fatigue !== null ? (
              <Stat value={fatigue} unit="/ 10" label="Erschöpfung" />
            ) : null}
            {wellbeing !== null ? (
              <Stat value={wellbeing} unit="/ 10" label="Befinden" />
            ) : null}
            {isFlare ? (
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-section font-semibold text-danger">
                  <Flame aria-hidden className="size-4" />
                  Schub
                </p>
                <p className="text-xs text-muted">heute markiert</p>
              </div>
            ) : null}
          </StatGroup>
        ) : null}
      </section>
    </Spotlight>
  );
}
