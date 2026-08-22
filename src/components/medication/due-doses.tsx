'use client';

import { useTransition } from 'react';
import { Check, Loader2, Plus, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { clearIntake, logAsNeeded, logIntake } from '@/actions/medication';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { DOSE_UNIT_LABELS } from '@/lib/scales';
import { formatTimeOfDay } from '@/services/medication/schedule';
import { cn } from '@/lib/utils';

export type DueDoseView = {
  scheduleDoseId: string;
  plannedLogDate: string;
  medicationName: string;
  activeSubstance: string | null;
  timeOfDay: string;
  doseAmount: number;
  doseUnit: keyof typeof DOSE_UNIT_LABELS;
  status: 'open' | 'taken' | 'skipped';
};

export type AsNeededView = {
  id: string;
  name: string;
  doseAmount: number;
  doseUnit: keyof typeof DOSE_UNIT_LABELS;
};

export type TakenAsNeededView = {
  id: string;
  medicationName: string;
  doseAmount: number;
  doseUnit: keyof typeof DOSE_UNIT_LABELS;
};

export function DueDoses({
  doses,
  asNeeded,
  takenAsNeeded,
  readOnly = false,
}: {
  doses: DueDoseView[];
  asNeeded: AsNeededView[];
  takenAsNeeded: TakenAsNeededView[];
  readOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function mark(dose: DueDoseView, status: 'taken' | 'skipped') {
    startTransition(async () => {
      // Tapping the same state again clears it, so a mis-tap is one tap to undo.
      const result =
        dose.status === status
          ? await clearIntake({
              scheduleDoseId: dose.scheduleDoseId,
              plannedLogDate: dose.plannedLogDate,
            })
          : await logIntake({
              scheduleDoseId: dose.scheduleDoseId,
              plannedLogDate: dose.plannedLogDate,
              status,
            });
      if (!result.ok) toast.error(result.error);
    });
  }

  function takeAsNeeded(medication: AsNeededView) {
    startTransition(async () => {
      const result = await logAsNeeded({
        medicationId: medication.id,
        doseAmount: medication.doseAmount.toString(),
        doseUnit: medication.doseUnit,
      });
      if (result.ok) toast.success(`${medication.name} erfasst`);
      else toast.error(result.error);
    });
  }

  const openCount = doses.filter((d) => d.status === 'open').length;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Medikamente</CardTitle>
          <CardMeta>
            {doses.length === 0
              ? 'Heute nichts geplant'
              : openCount === 0
                ? 'Alles erledigt'
                : `${openCount} von ${doses.length} offen`}
          </CardMeta>
        </div>
      </CardHeader>

      {doses.length > 0 ? (
        <ul className="divide-y divide-line">
          {doses.map((dose) => (
            <li
              key={`${dose.scheduleDoseId}-${dose.plannedLogDate}`}
              className="flex items-center gap-3 py-2"
            >
              <span className="w-12 shrink-0 text-sm text-muted">
                {formatTimeOfDay(dose.timeOfDay)}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'truncate text-base',
                    dose.status === 'skipped'
                      ? 'text-muted line-through'
                      : 'text-fg'
                  )}
                >
                  {dose.medicationName}
                </p>
                <p className="text-xs text-muted">
                  {dose.doseAmount} {DOSE_UNIT_LABELS[dose.doseUnit]}
                  {dose.activeSubstance ? ` · ${dose.activeSubstance}` : ''}
                </p>
              </div>

              {readOnly ? (
                <span className="text-xs text-muted">
                  {dose.status === 'taken'
                    ? 'genommen'
                    : dose.status === 'skipped'
                      ? 'ausgelassen'
                      : 'offen'}
                </span>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => mark(dose, 'skipped')}
                    disabled={pending}
                    aria-label={`${dose.medicationName} auslassen`}
                    className={cn(
                      'tap flex items-center justify-center rounded-full border',
                      dose.status === 'skipped'
                        ? 'border-muted bg-muted/20 text-fg'
                        : 'border-line text-muted'
                    )}
                  >
                    <SkipForward aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => mark(dose, 'taken')}
                    disabled={pending}
                    aria-label={`${dose.medicationName} als genommen markieren`}
                    aria-pressed={dose.status === 'taken'}
                    className={cn(
                      'tap flex items-center justify-center rounded-full border transition-colors',
                      dose.status === 'taken'
                        ? 'border-transparent bg-ok text-white'
                        : 'border-line text-muted hover:bg-soft'
                    )}
                  >
                    {pending ? (
                      <Loader2 aria-hidden className="size-4 animate-spin" />
                    ) : (
                      <Check aria-hidden className="size-5" />
                    )}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {asNeeded.length > 0 && !readOnly ? (
        <div className="mt-4 space-y-2 border-t border-line pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Bei Bedarf
          </p>
          <div className="-mx-1 flex flex-wrap gap-2 px-1">
            {asNeeded.map((medication) => (
              <Button
                key={medication.id}
                variant="outline"
                size="sm"
                onClick={() => takeAsNeeded(medication)}
                disabled={pending}
              >
                <Plus aria-hidden className="size-3.5" />
                {medication.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {takenAsNeeded.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-muted">
          {takenAsNeeded.map((intake) => (
            <li key={intake.id}>
              {intake.medicationName} · {intake.doseAmount}{' '}
              {DOSE_UNIT_LABELS[intake.doseUnit]} (bei Bedarf)
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
