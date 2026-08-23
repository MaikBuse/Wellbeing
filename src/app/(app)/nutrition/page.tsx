import { requireUser } from '@/auth.helpers';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Stat, StatGroup } from '@/components/ui/stat';
import { Button } from '@/components/ui/button';
import {
  RangeFilter,
  type RangePreset,
} from '@/components/analysis/range-filter';
import { CoverageCard } from '@/components/nutrition/coverage-card';
import { GoalScoreboard } from '@/components/nutrition/goal-scoreboard';
import { PRESET_DAYS, parseRangePreset } from '@/lib/range';
import { loadNutrition } from '@/services/nutrition/loader';
import {
  MIN_EVALUABLE_DAYS,
  periodScoreboard,
} from '@/services/nutrition/period';
import { NUTRITION_JOKER_MAX } from '@/services/nutrition/streak';
import { NUTRITION_QUOTIENT_DAYS } from '@/services/nutrition/loader';
import Link from 'next/link';

export const metadata = { title: 'Nährstoffe – Wellbeing' };

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const preset: RangePreset = parseRangePreset(range);
  const user = await requireUser();

  const data = await loadNutrition(
    user.id,
    preset === 'all' ? {} : { days: PRESET_DAYS[preset] }
  );

  if (data.blocked !== null) {
    return (
      <main className="space-y-4 p-4">
        <PageHeader eyebrow="Ernährung" title="Nährstoffe" />
        <EmptyState
          title="Noch keine Zielwerte"
          description="Ein kurzer Fragebogen in den Einstellungen leitet Zielwerte für Makro- und Mikronährstoffe ab."
          action={
            <Button asChild size="sm">
              <Link href="/settings/nutrition-goals">Zu den Zielen</Link>
            </Button>
          }
        />
      </main>
    );
  }

  const totalGrams = data.raw.reduce((sum, day) => sum + day.totalGrams, 0);
  const blsGrams = data.raw.reduce((sum, day) => sum + day.blsGrams, 0);
  const statedGrams = data.raw.reduce((sum, day) => sum + day.statedGrams, 0);

  const board = periodScoreboard(data.days, MIN_EVALUABLE_DAYS.month);

  return (
    <main className="space-y-4 p-4">
      <PageHeader
        eyebrow="Ernährung"
        title="Nährstoffe"
        description="Wie die Tage gegen deine Zielwerte ausfallen — soweit sie sich messen lassen."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/nutrition-goals">Ziele</Link>
          </Button>
        }
      />

      <RangeFilter current={preset}>
        <div className="space-y-4">
          <CoverageCard
            totalGrams={totalGrams}
            measuredGrams={blsGrams}
            statedShare={totalGrams <= 0 ? 0 : statedGrams / totalGrams}
          />

          <Card>
            <CardHeader>
              <CardTitle>Im Zielbereich</CardTitle>
              <CardMeta>
                {quotientLine(data.recent, NUTRITION_QUOTIENT_DAYS)}
              </CardMeta>
            </CardHeader>

            <StatGroup className="mt-3 border-t border-line-soft pt-3">
              <Stat
                value={data.streak.current}
                unit="Tage"
                label="Serie im Zielbereich"
              />
              <Stat
                value={data.streak.longest}
                unit="Tage"
                label="längste Serie"
              />
              <Stat
                value={data.streak.jokersAvailable}
                unit={`von ${NUTRITION_JOKER_MAX}`}
                label="Schutztage"
              />
            </StatGroup>

            <p className="mt-3 text-xs text-muted">
              Ein Schubtag zählt weder als getroffen noch als verfehlt — er
              fällt aus der Rechnung und lässt die Serie unberührt. Dasselbe
              gilt für Tage, an denen zu wenig gemessen werden konnte.
            </p>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Am häufigsten unter Ziel</CardTitle>
              <CardMeta>
                Der Nenner sind auswertbare Tage, nicht Kalendertage. Ein nicht
                erfasster Tag zählt nicht als verfehlt.
              </CardMeta>
            </CardHeader>
            {board.length === 0 ? (
              <CardMeta className="mt-2">
                Noch keine auswertbaren Tage in diesem Zeitraum.
              </CardMeta>
            ) : (
              <div className="mt-2">
                <GoalScoreboard rows={board} />
              </div>
            )}
          </Card>
        </div>
      </RangeFilter>
    </main>
  );
}

function quotientLine(
  summary: {
    assessableDays: number;
    goodDays: number;
    flareDaysSkipped: number;
    unreliableDays: number;
  },
  days: number
): string {
  if (summary.assessableDays === 0) {
    return `In den letzten ${days} Tagen gab es noch keinen Tag, für den sich ein Wert berechnen ließ.`;
  }
  const extras: string[] = [];
  if (summary.flareDaysSkipped > 0) {
    extras.push(`${summary.flareDaysSkipped} Schubtage nicht gewertet`);
  }
  if (summary.unreliableDays > 0) {
    extras.push(`${summary.unreliableDays} Tage zu wenig Messwerte`);
  }
  const suffix = extras.length > 0 ? ` (${extras.join(', ')})` : '';
  return `In den letzten ${days} Tagen: an ${summary.goodDays} von ${summary.assessableDays} belastbaren Tagen im Zielbereich${suffix}.`;
}
