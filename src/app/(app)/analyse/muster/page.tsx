import { Suspense } from 'react';
import { requireUser } from '@/auth.helpers';
import {
  foodGroupGramsByDay,
  foodSourceGramsRange,
  symptomGroupsByDay,
} from '@/db/queries/analysis';
import { loadDaySeries } from '@/services/analysis/loader';
import { ChartFrame } from '@/components/chart/chart-frame';
import { DataTable } from '@/components/chart/data-table';
import {
  CompositionBar,
  CompositionLegend,
} from '@/components/chart/composition-bars';
import { RangeFilter, type RangePreset } from '@/components/analysis/range-filter';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Stat, StatGroup } from '@/components/ui/stat';
import { blsGroupLabel, foldToTopGroups } from '@/lib/food-groups';
import { SYMPTOM_GROUP_LABELS } from '@/lib/scales';
import { SAME_DAY_NOTICE } from '@/services/analysis/labels';
import { parseRangePreset, rangeFromPreset } from '@/lib/range';

export default async function PatternsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const preset: RangePreset = parseRangePreset(range);

  return (
    <RangeFilter current={preset}>
      <div className="space-y-4">
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <PatternsContent preset={preset} />
        </Suspense>
      </div>
    </RangeFilter>
  );
}

async function PatternsContent({ preset }: { preset: RangePreset }) {
  const user = await requireUser();
  const window = rangeFromPreset(preset);
  const { range, facts } = await loadDaySeries(user.id, window);

  const [symptomRows, foodGroupRows, sourceRows] = await Promise.all([
    symptomGroupsByDay(user.id, range.from, range.to),
    foodGroupGramsByDay(user.id, range.from, range.to),
    foodSourceGramsRange(user.id, range.from, range.to),
  ]);

  // --- what she actually ate, by BLS group -------------------------------
  const groupTotals = new Map<string, number>();
  for (const row of foodGroupRows) {
    const label = blsGroupLabel(row.groupKey);
    groupTotals.set(label, (groupTotals.get(label) ?? 0) + row.grams);
  }
  // Six slots is the palette cap; the tail is summed into "Sonstiges", never
  // dropped and never given a seventh generated colour.
  const groupSegments = foldToTopGroups(groupTotals, 5);
  const groupTotal = groupSegments.reduce((sum, s) => sum + s.value, 0);

  // --- which symptoms dominate -------------------------------------------
  const symptomTotals = new Map<string, { days: number; peak: number }>();
  for (const row of symptomRows) {
    const label =
      SYMPTOM_GROUP_LABELS[row.groupKey as keyof typeof SYMPTOM_GROUP_LABELS] ??
      row.groupKey;
    const current = symptomTotals.get(label) ?? { days: 0, peak: 0 };
    symptomTotals.set(label, {
      days: current.days + 1,
      peak: Math.max(current.peak, row.severity),
    });
  }
  const symptomList = [...symptomTotals.entries()]
    .map(([label, value]) => ({ label, ...value }))
    .sort((a, b) => b.days - a.days);

  // --- adherence ---------------------------------------------------------
  const adherenceValues = facts.days
    .map((d) => d.dmardAdherence7d)
    .filter((v): v is number => v !== null);
  const meanAdherence =
    adherenceValues.length === 0
      ? null
      : adherenceValues.reduce((a, b) => a + b, 0) / adherenceValues.length;

  const sourceTotal = sourceRows.reduce((sum, row) => sum + row.grams, 0);

  return (
    <>
      {groupTotal > 0 ? (
        <ChartFrame
          title="Was auf dem Teller war"
          caption="Gramm je Lebensmittelgruppe, aus dem Bundeslebensmittelschlüssel."
          summary={groupSegments
            .map(
              (segment) =>
                `${segment.label}: ${Math.round(
                  (segment.value / groupTotal) * 100
                )} Prozent`
            )
            .join('. ')}
          chart={
            <>
              <CompositionBar segments={groupSegments} total={groupTotal} />
              <CompositionLegend
                segments={groupSegments}
                total={groupTotal}
                unit="g"
              />
            </>
          }
          table={
            <DataTable
              caption="Gramm je Gruppe"
              columns={[
                { key: 'label', label: 'Gruppe', render: (row) => row.label },
                {
                  key: 'grams',
                  label: 'Gramm',
                  align: 'right',
                  render: (row) => Math.round(row.value),
                },
                {
                  key: 'share',
                  label: 'Anteil',
                  align: 'right',
                  render: (row) =>
                    `${Math.round((row.value / groupTotal) * 100)} %`,
                },
              ]}
              rows={groupSegments}
              rowKey={(row) => row.label}
            />
          }
          footer="Die Gruppe kommt aus dem BLS-Code, nicht aus einer Namensregel — deshalb ist sie verlässlicher als die Kennzeichnungen."
        />
      ) : (
        <EmptyState
          title="Noch keine Mahlzeiten im Zeitraum"
          description="Sobald Mahlzeiten erfasst sind, entsteht hier die Zusammensetzung."
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Welche Beschwerden</CardTitle>
          <CardMeta>Tage mit Eintrag je Gruppe, und der Höchstwert.</CardMeta>
        </CardHeader>
        {symptomList.length === 0 ? (
          <p className="text-sm text-muted">Keine Symptomeinträge im Zeitraum.</p>
        ) : (
          <DataTable
            caption="Beschwerden je Gruppe"
            columns={[
              { key: 'label', label: 'Gruppe', render: (row) => row.label },
              {
                key: 'days',
                label: 'Tage',
                align: 'right',
                render: (row) => row.days,
              },
              {
                key: 'peak',
                label: 'Höchstwert',
                align: 'right',
                render: (row) => row.peak,
              },
            ]}
            rows={symptomList}
            rowKey={(row) => row.label}
          />
        )}
        <p className="mt-3 text-xs text-muted">{SAME_DAY_NOTICE}</p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datenqualität</CardTitle>
          <CardMeta>
            Warum manche Faktoren noch nicht auswertbar sind.
          </CardMeta>
        </CardHeader>
        <StatGroup>
          <Stat
            label="Erfasste Tage"
            value={`${facts.counts.trackedDays}/${facts.counts.rangeDays}`}
          />
          <Stat
            label="Gramm mit Messwert"
            value={`${Math.round(facts.counts.blsGramsShare * 100)} %`}
          />
          <Stat
            label="Gramm mit Menge"
            value={`${Math.round(facts.counts.portionEvidenceShare * 100)} %`}
          />
          <Stat
            label="Adhärenz"
            value={meanAdherence === null ? '–' : `${Math.round(meanAdherence * 100)} %`}
          />
        </StatGroup>
        {sourceTotal > 0 ? (
          <p className="mt-3 text-xs text-muted">
            Herkunft der Lebensmittel:{' '}
            {sourceRows
              .sort((a, b) => b.grams - a.grams)
              .map(
                (row) =>
                  `${sourceLabel(row.source)} ${Math.round(
                    (row.grams / sourceTotal) * 100
                  )} %`
              )
              .join(' · ')}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted">
          Ein Lebensmittel ohne Katalogeintrag hat keine Messwerte. Diese Gramm
          zählen nicht als null, sondern als unbekannt — sonst wäre jede Dosis
          systematisch zu niedrig, und zwar am stärksten an den Tagen mit
          Fertigprodukten.
        </p>
      </Card>
    </>
  );
}

function sourceLabel(source: string): string {
  if (source === 'bls') return 'Bundeslebensmittelschlüssel';
  if (source === 'off') return 'Open Food Facts';
  return 'selbst angelegt';
}
