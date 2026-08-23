import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { COVERAGE_EXPLANATION_DE } from '@/lib/nutrition-goals';
import { formatGermanNumber } from '@/lib/nutrition';

/**
 * How much of the range could be measured at all — first on the page, before
 * anything it qualifies. Same position `DataBasisBanner` takes in the analysis.
 *
 * Neutral throughout. Thin data is a thin measurement, not a bad outcome.
 */
export function CoverageCard({
  totalGrams,
  measuredGrams,
  statedShare,
}: {
  totalGrams: number;
  measuredGrams: number;
  statedShare: number;
}) {
  const share = totalGrams <= 0 ? 0 : measuredGrams / totalGrams;
  const percent = Math.round(share * 100);
  const statedPercent = Math.round(statedShare * 100);
  const segments = Math.round(share * 8);

  return (
    <Card>
      <CardHeader
        action={
          <p className="num text-metric font-semibold text-fg">
            {percent}
            <span className="ml-0.5 text-sm font-normal text-muted">%</span>
          </p>
        }
      >
        <CardTitle>Datengrundlage</CardTitle>
        <CardMeta>
          Von {formatGermanNumber(totalGrams, 0)} g im Zeitraum haben {percent} %
          einen Messwert. Bei {statedPercent} % der Gramm war auch die Menge
          angegeben.
        </CardMeta>
      </CardHeader>

      <div
        role="img"
        aria-label={`Messwertabdeckung ${percent} Prozent`}
        className="mt-3 flex gap-1"
      >
        {Array.from({ length: 8 }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className={
              index < segments
                ? 'h-1.5 flex-1 rounded-pill bg-chart-1'
                : 'h-1.5 flex-1 rounded-pill bg-bg-sunken'
            }
          />
        ))}
      </div>

      <CardMeta className="mt-3">{COVERAGE_EXPLANATION_DE}</CardMeta>
    </Card>
  );
}
