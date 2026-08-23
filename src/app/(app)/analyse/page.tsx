import { Suspense } from 'react';
import { requireUser } from '@/auth.helpers';
import { loadDaySeries } from '@/services/analysis/loader';
import { RaHero } from '@/components/analysis/ra-hero';
import { DataBasisBanner } from '@/components/analysis/data-basis-banner';
import { RangeFilter, type RangePreset } from '@/components/analysis/range-filter';
import { ChartFrame } from '@/components/chart/chart-frame';
import { DataTable } from '@/components/chart/data-table';
import { TrendMultiples, type TrendMetric } from '@/components/chart/trend-multiples';
import { DeviationBars } from '@/components/chart/deviation-bars';
import {
  CalendarHeatmap,
  CalendarLegend,
} from '@/components/chart/calendar-heatmap';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatLogDateShort, type LogDate } from '@/lib/time';
import { formatGermanNumber } from '@/lib/nutrition';
import { parseRangePreset, rangeFromPreset } from '@/lib/range';

export default async function AnalyseOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const preset = parseRangePreset(range);

  return (
    <RangeFilter current={preset}>
      {/* The first real Suspense boundaries in this app. The hero and the
          calendar come from cheap reads and can paint while the rest streams;
          the expensive work in this feature is a button press, not a page view. */}
      <div className="space-y-4">
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <OverviewContent preset={preset} />
        </Suspense>
      </div>
    </RangeFilter>
  );
}

async function OverviewContent({ preset }: { preset: RangePreset }) {
  const user = await requireUser();
  const window = rangeFromPreset(preset);
  const { facts } = await loadDaySeries(user.id, window);
  const days = facts.days;

  if (facts.counts.daysWithRaIndex === 0) {
    return (
      <EmptyState
        title="Noch keine Tageswerte"
        description="Sobald der Tagescheck ein paar Tage gelaufen ist, entsteht hier ein Verlauf."
      />
    );
  }

  const points = days.map((day) => ({
    logDate: day.logDate,
    label: formatLogDateShort(day.logDate),
    isFlare: day.isFlare,
    values: {
      raIndex: day.raIndex,
      jointPain: day.raComponents.jointPain ?? null,
      fatigue: day.raComponents.fatigue ?? null,
      stiffness: day.raComponents.stiffness ?? null,
    },
  }));

  const metrics: TrendMetric[] = [
    {
      key: 'raIndex',
      label: 'RA-Tageswert',
      domain: [0, 10],
      decimals: 1,
      lead: true,
    },
    {
      key: 'jointPain',
      label: 'Gelenkschmerz',
      domain: [0, 10],
    },
    {
      key: 'fatigue',
      label: 'Erschöpfung',
      domain: [0, 10],
    },
    {
      // On the 0-10 scale of the index, NOT in minutes — the minutes version
      // would need a second y-axis, and a dual-axis chart invents a
      // relationship that is not in the data.
      key: 'stiffness',
      label: 'Morgensteifigkeit',
      unit: 'umgerechnet 0–10',
      domain: [0, 10],
      decimals: 1,
    },
  ];

  const deviationPoints = days.map((day) => ({
    label: formatLogDateShort(day.logDate),
    value: day.deviation === null ? null : Math.round(day.deviation * 10) / 10,
  }));

  const flareDays = days.filter((d) => d.isFlare).length;
  const extremes = describeExtremes(days);

  return (
    <>
      <DataBasisBanner
        trackedDays={facts.counts.trackedDays}
        daysWithRaIndex={facts.counts.daysWithRaIndex}
      />

      <RaHero days={days} />

      <ChartFrame
        title="Verlauf"
        caption="Vier Größen, vier Skalen, ein gemeinsamer Zeitpunkt."
        summary={`Verlauf über ${days.length} Tage. ${extremes}${
          flareDays > 0 ? ` ${flareDays} Tage als Schub markiert.` : ''
        }`}
        chart={<TrendMultiples points={points} metrics={metrics} />}
        table={
          <DataTable
            caption="Tageswerte"
            columns={[
              { key: 'day', label: 'Tag', render: (row) => row.label },
              {
                key: 'ra',
                label: 'RA',
                align: 'right',
                render: (row) =>
                  row.values.raIndex === null
                    ? '–'
                    : formatGermanNumber(Math.round(row.values.raIndex * 10) / 10),
              },
              {
                key: 'pain',
                label: 'Schmerz',
                align: 'right',
                render: (row) => row.values.jointPain ?? '–',
              },
              {
                key: 'fatigue',
                label: 'Erschöpfung',
                align: 'right',
                render: (row) => row.values.fatigue ?? '–',
              },
              {
                key: 'flare',
                label: 'Schub',
                render: (row) => (row.isFlare ? 'ja' : ''),
              },
            ]}
            rows={points}
            rowKey={(row) => row.logDate}
          />
        }
      />

      <ChartFrame
        title="Abweichung vom eigenen Normal"
        caption="Gegen den eigenen 7-Tage-Median der Vortage. Nicht gegen einen Zielwert."
        summary={`Abweichung vom eigenen 7-Tage-Median über ${days.length} Tage. Rosé bedeutet schlechter als das eigene Normal, Blau besser.`}
        chart={<DeviationBars points={deviationPoints} />}
        table={
          <DataTable
            caption="Abweichung je Tag"
            columns={[
              { key: 'day', label: 'Tag', render: (row) => row.label },
              {
                key: 'value',
                label: 'Abweichung',
                align: 'right',
                render: (row) =>
                  row.value === null ? '–' : formatGermanNumber(row.value),
              },
            ]}
            rows={deviationPoints}
            rowKey={(row) => row.label}
          />
        }
        footer="Weil die Tageswerte über sechs Chips erfasst werden, ist die Abweichung grob gestuft — Zwischenwerte gibt es nicht."
      />

      <ChartFrame
        title="Tage"
        caption="Antippen öffnet den Tag."
        summary={`Kalender über ${days.length} Tage, gefärbt nach RA-Tageswert. Tage ohne Eintrag sind gestrichelt umrandet.`}
        chart={
          <CalendarHeatmap
            cells={days.map((day) => ({
              logDate: day.logDate,
              value: day.raIndex === null ? null : Math.round(day.raIndex),
              isFlare: day.isFlare,
            }))}
            showValues={days.length <= 35}
            valueLabel="RA-Tageswert"
          />
        }
        legend={<CalendarLegend valueLabel="RA-Tageswert" />}
      />
    </>
  );
}

function describeExtremes(
  days: { logDate: LogDate; raIndex: number | null }[]
): string {
  const withValues = days.filter(
    (d): d is { logDate: LogDate; raIndex: number } => d.raIndex !== null
  );
  if (withValues.length === 0) return '';
  const worst = withValues.reduce((a, b) => (b.raIndex > a.raIndex ? b : a));
  const best = withValues.reduce((a, b) => (b.raIndex < a.raIndex ? b : a));
  return `Höchster Wert ${formatGermanNumber(
    Math.round(worst.raIndex * 10) / 10
  )} am ${formatLogDateShort(worst.logDate)}, niedrigster ${formatGermanNumber(
    Math.round(best.raIndex * 10) / 10
  )} am ${formatLogDateShort(best.logDate)}.`;
}
