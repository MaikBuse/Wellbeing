import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireUser } from '@/auth.helpers';
import { listMedications } from '@/db/queries/medication';
import { Button } from '@/components/ui/button';
import { Card, CardMeta, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { SectionLabel } from '@/components/ui/section-label';
import {
  DOSE_UNIT_LABELS,
  MED_CATEGORY_LABELS,
  SCHEDULE_KIND_LABELS,
  WEEKDAY_LABELS,
} from '@/lib/scales';
import { formatTimeOfDay } from '@/services/medication/schedule';

export const metadata = { title: 'Medikamente – Wellbeing' };

function describeSchedule(row: {
  kind: string | null;
  weekday: number | null;
  intervalDays: number | null;
  timeOfDay: string | null;
  doseAmount: number | null;
  doseUnit: string | null;
}): string {
  if (!row.kind) return 'Kein aktives Schema';
  const parts: string[] = [];
  if (row.kind === 'weekly' && row.weekday !== null) {
    parts.push(`jeden ${WEEKDAY_LABELS[row.weekday]}`);
  } else if (row.kind === 'interval_days' && row.intervalDays) {
    parts.push(`alle ${row.intervalDays} Tage`);
  } else {
    parts.push(
      SCHEDULE_KIND_LABELS[row.kind as keyof typeof SCHEDULE_KIND_LABELS]
    );
  }
  if (row.timeOfDay && row.kind !== 'as_needed') {
    parts.push(`um ${formatTimeOfDay(row.timeOfDay)}`);
  }
  if (row.doseAmount && row.doseUnit) {
    parts.push(
      `${row.doseAmount} ${
        DOSE_UNIT_LABELS[row.doseUnit as keyof typeof DOSE_UNIT_LABELS]
      }`
    );
  }
  return parts.join(' · ');
}

export default async function MedicationsPage() {
  const user = await requireUser();
  const rows = await listMedications(user.id);
  const active = rows.filter((row) => row.isActive);
  const stopped = rows.filter((row) => !row.isActive);

  return (
    <main className="space-y-4 p-4">
      <PageHeader
        title="Medikamente"
        action={
          <Button asChild size="sm">
            <Link href="/medications/new">
              <Plus aria-hidden className="size-4" />
              Neu
            </Link>
          </Button>
        }
      />

      {active.length === 0 ? (
        <EmptyState
          icon={<Plus aria-hidden className="size-7" />}
          title="Noch keine Medikamente"
          description="Nach dem Anlegen erscheinen die fälligen Dosen automatisch auf dem Heute-Screen."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/medications/new">Medikament anlegen</Link>
            </Button>
          }
        />
      ) : (
        active.map((row, index) => (
          <Card
            key={`${row.id}-${row.scheduleId ?? 'none'}`}
            className="rise-in"
            style={{ '--i': index } as React.CSSProperties}
          >
            <CardTitle>{row.name}</CardTitle>
            <CardMeta className="mt-1">
              {[row.activeSubstance, MED_CATEGORY_LABELS[row.category]]
                .filter(Boolean)
                .join(' · ')}
            </CardMeta>
            <p className="mt-2 text-sm text-fg">{describeSchedule(row)}</p>
          </Card>
        ))
      )}

      {stopped.length > 0 ? (
        <Card variant="sunken">
          <SectionLabel>Abgesetzt</SectionLabel>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {stopped.map((row) => (
              <li key={`${row.id}-stopped`}>
                {row.name}
                {row.endedOn ? ` · bis ${row.endedOn}` : ''}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </main>
  );
}
