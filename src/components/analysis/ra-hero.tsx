import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { Stat, StatGroup } from '@/components/ui/stat';
import { Sparkline } from '@/components/chart/sparkline';
import { RA_COMPONENT_LABELS, RA_COMPONENT_ORDER } from '@/lib/scales';
import { RA_INDEX_NOTICE } from '@/services/analysis/labels';
import { formatGermanNumber } from '@/lib/nutrition';
import type { DailyFact } from '@/services/analysis/facts';

/**
 * The lead figure: the RA-Tageswert, with its five components beside it.
 *
 * Deliberately a figure and not a chart — a single current value with a trend is
 * a stat tile, and a one-bar bar chart would be worse in every way.
 *
 * The components are always shown. One number is what you can rank against;
 * only the breakdown says what is driving it, and a composite with no visible
 * parts is an invitation to over-read it. The notice below says once, in words,
 * that this is a value from her own entries and not a DAS28 — which is not
 * computable at all without blood work.
 *
 * `num` (tabular figures) on the big value, against the dataviz default of
 * proportional figures: globals.css calls `num` mandatory on every metric
 * because the app animates its numbers and proportional digits make the layout
 * jitter while they count. The app's own reason wins here.
 */
export function RaHero({ days }: { days: DailyFact[] }) {
  const withIndex = days.filter((d) => d.raIndex !== null);
  const latest = withIndex[withIndex.length - 1] ?? null;

  const lastSeven = withIndex.slice(-7).map((d) => d.raIndex as number);
  const previousSeven = withIndex.slice(-14, -7).map((d) => d.raIndex as number);
  const delta =
    lastSeven.length > 0 && previousSeven.length > 0
      ? average(lastSeven) - average(previousSeven)
      : null;

  const sparkValues = days.slice(-12).map((d) => d.raIndex);

  if (!latest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>RA-Tageswert</CardTitle>
          <CardMeta>
            Noch kein Tag mit genug Angaben. Gelenkschmerz oder markierte Gelenke
            reichen schon.
          </CardMeta>
        </CardHeader>
        <p className="text-xs text-muted">{RA_INDEX_NOTICE}</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>RA-Tageswert</CardTitle>
        <CardMeta>{latest.logDate}</CardMeta>
      </CardHeader>

      <div className="flex items-end justify-between gap-4">
        <p className="num text-display font-semibold leading-none text-fg">
          {formatGermanNumber(Math.round((latest.raIndex as number) * 10) / 10)}
        </p>
        <div className="flex flex-col items-end gap-1">
          <Sparkline values={sparkValues} />
          {delta !== null ? (
            <p className="num text-xs text-muted">
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '■'}{' '}
              {formatGermanNumber(Math.abs(Math.round(delta * 10) / 10))} vs.
              Vorwoche
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <StatGroup>
          {RA_COMPONENT_ORDER.map((key) => {
            const value = latest.raComponents[key];
            return (
              <Stat
                key={key}
                label={RA_COMPONENT_LABELS[key]}
                value={
                  value === undefined
                    ? '–'
                    : formatGermanNumber(Math.round(value * 10) / 10)
                }
              />
            );
          })}
        </StatGroup>
      </div>

      <p className="mt-3 text-xs text-muted">{RA_INDEX_NOTICE}</p>
    </Card>
  );
}

function average(values: number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}
