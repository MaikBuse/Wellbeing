import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/auth.helpers';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { GoalMeter } from '@/components/ui/goal-meter';
import {
  RangeFilter,
  type RangePreset,
} from '@/components/analysis/range-filter';
import { ChartFrame } from '@/components/chart/chart-frame';
import {
  NUTRIENT_KEYS,
  NUTRIENT_META,
  type NutrientKey,
} from '@/lib/nutrients';
import type { GoalMeterStatus } from '@/components/ui/goal-meter';
import type { NutritionDay } from '@/services/nutrition/types';
import type { TargetValue } from '@/services/nutrition/targets/types';
import { STATUS_WORD, formatAmount, formatTarget } from '@/lib/nutrition-goals';
import { PRESET_DAYS, parseRangePreset } from '@/lib/range';
import { formatLogDateShort } from '@/lib/time';
import { loadNutrition } from '@/services/nutrition/loader';
import {
  MIN_EVALUABLE_DAYS,
  byIsoWeek,
  summarisePeriod,
} from '@/services/nutrition/period';
import { NUTRIENT_TARGETS } from '@/services/nutrition/targets/catalog';
import { SOURCES } from '@/services/nutrition/targets/sources';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nutrient: string }>;
}) {
  const { nutrient } = await params;
  const meta = NUTRIENT_META[nutrient as NutrientKey];
  return { title: `${meta?.labelDe ?? 'Nährstoff'} – Wellbeing` };
}

export default async function NutrientPage({
  params,
  searchParams,
}: {
  params: Promise<{ nutrient: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const [{ nutrient }, { range }] = await Promise.all([params, searchParams]);
  if (!(NUTRIENT_KEYS as readonly string[]).includes(nutrient)) notFound();
  const key = nutrient as NutrientKey;

  const preset: RangePreset = parseRangePreset(range);
  const user = await requireUser();
  const data = await loadNutrition(
    user.id,
    preset === 'all' ? {} : { days: PRESET_DAYS[preset] }
  );

  if (data.blocked !== null || !data.targets?.has(key)) notFound();

  const target = data.targets.get(key)!;
  const definition = NUTRIENT_TARGETS[key];
  const period = summarisePeriod(key, data.days, MIN_EVALUABLE_DAYS.month);
  const weeks = byIsoWeek(data.days);

  return (
    <main className="space-y-4 p-4">
      <PageHeader
        eyebrow="Nährstoffe"
        title={NUTRIENT_META[key].labelDe}
        description={formatTarget(target, key)}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/nutrition">Zurück</Link>
          </Button>
        }
      />

      <RangeFilter current={preset}>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Warum dieser Wert</CardTitle>
              <CardMeta>{target.rationaleDe}</CardMeta>
            </CardHeader>
            {definition?.cautionDe ? (
              <p className="mt-2 text-xs text-fg">{definition.cautionDe}</p>
            ) : null}
            <div className="mt-2 space-y-1">
              {target.sourceKeys.map((sourceKey) => (
                <p key={sourceKey} className="text-xs text-muted">
                  <span className="font-medium text-fg">
                    {SOURCES[sourceKey].labelDe}
                  </span>{' '}
                  ({SOURCES[sourceKey].year}) — {SOURCES[sourceKey].strengthDe}
                </p>
              ))}
            </div>
          </Card>

          <ChartFrame
            title="Wochenverlauf"
            caption={
              period.daysEvaluable === 0
                ? 'Noch keine auswertbaren Tage.'
                : `An ${period.daysInTarget} von ${period.daysEvaluable} auswertbaren Tagen im Ziel.`
            }
            summary={weekSummary(period.labelDe, weeks.length)}
            chart={
              <div className="space-y-3">
                {weeks.map((week) => {
                  const view = weekView(week.days, key, target);
                  return (
                    <GoalMeter
                      key={week.week}
                      label={week.week.replace('-W', ', Woche ')}
                      valueText={view.valueText}
                      targetText={formatTarget(target, key)}
                      statusText={view.statusText}
                      status={view.status}
                      fill={view.fill}
                    />
                  );
                })}
              </div>
            }
            table={
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 font-medium">Tag</th>
                    <th className="py-1 font-medium">Wert</th>
                    <th className="py-1 font-medium">Stand</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((day) => {
                    const entry = day.nutrients.find((n) => n.key === key);
                    return (
                      <tr
                        key={day.logDate}
                        className="border-t border-line-soft"
                      >
                        <td className="py-1">
                          {formatLogDateShort(day.logDate)}
                        </td>
                        <td className="num py-1 tabular-nums">
                          {entry?.total.total === null ||
                          entry?.total.total === undefined
                            ? '–'
                            : formatAmount(entry.total.total, key)}
                        </td>
                        <td className="py-1 text-muted">
                          {day.isFlare
                            ? 'Schubtag, nicht gewertet'
                            : statusWord(entry?.status)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            }
          />
        </div>
      </RangeFilter>
    </main>
  );
}

function statusWord(status: string | undefined): string {
  if (status === 'met') return STATUS_WORD.in;
  if (status === 'exceeded') return STATUS_WORD.over;
  if (status === 'missed') return STATUS_WORD.below;
  return STATUS_WORD.unmeasured;
}

function weekSummary(label: string, weeks: number): string {
  return `${label} je Kalenderwoche über ${weeks} Wochen, jeweils als Median der auswertbaren Tage gegen den Zielwert.`;
}

/**
 * A week as one meter: the median of its evaluable days.
 *
 * Median rather than mean, for the reason the RA baseline is a median — one
 * festive meal should not move a week. Flare days are skipped, and a week with
 * nothing evaluable shows the unmeasured state rather than a zero.
 */
function weekView(
  days: readonly NutritionDay[],
  key: NutrientKey,
  target: TargetValue
): {
  valueText: string | null;
  statusText: string;
  status: GoalMeterStatus;
  fill: number;
} {
  const values: number[] = [];
  for (const day of days) {
    if (day.isFlare) continue;
    const entry = day.nutrients.find((n) => n.key === key);
    if (!entry || entry.status === 'unknown' || entry.total.total === null) {
      continue;
    }
    values.push(entry.total.total);
  }

  if (values.length === 0) {
    return {
      valueText: null,
      statusText: STATUS_WORD.unmeasured,
      status: 'unmeasured',
      fill: 0,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const bound = target.min ?? target.max;
  const status: GoalMeterStatus =
    target.max !== null && median > target.max
      ? 'over'
      : target.min !== null && median >= target.min
        ? 'in'
        : target.min === null
          ? 'in'
          : 'below';

  return {
    valueText: formatAmount(median, key),
    statusText: `${STATUS_WORD[status]} · Median aus ${values.length} auswertbaren ${values.length === 1 ? 'Tag' : 'Tagen'}`,
    status,
    fill: bound === null || bound <= 0 ? 0 : median / bound,
  };
}
