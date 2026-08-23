import { GoalMeter } from '@/components/ui/goal-meter';
import { SectionLabel } from '@/components/ui/section-label';
import {
  GROUP_LABEL,
  groupRemainingNutrients,
  selectDayNutrients,
  toMeterView,
} from '@/lib/nutrition-goals';
import type { NutritionDay } from '@/services/nutrition/types';

/**
 * Every target for one day that the day screen did not already show.
 *
 * The day card prints three macros; this prints the rest — energy, saturated
 * fat, sugar, fibre, salt, the fatty acids, the vitamins and the minerals —
 * grouped the same way `/settings/nutrition-goals` groups them.
 *
 * No query of its own. `loadNutrition` already returns one `NutrientAssessment`
 * per target key in `targetDisplayOrder`, and `DayGoals` was throwing all but
 * four of them away.
 *
 * Server component.
 */
export function DayDetail({ day }: { day: NutritionDay }) {
  // The same call the day card makes, so an exceeded limit promoted up there
  // is not repeated down here.
  const groups = groupRemainingNutrients(
    day.nutrients,
    selectDayNutrients(day.nutrients)
  );
  if (groups.length === 0) return null;

  return (
    <div className="space-y-4">
      {groups.map(({ group, entries }) => (
        <div key={group}>
          <SectionLabel>{GROUP_LABEL[group]}</SectionLabel>
          <div className="mt-2 space-y-3">
            {entries.map((assessment) => {
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
        </div>
      ))}
    </div>
  );
}
