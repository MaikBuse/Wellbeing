'use client';

import { useState, useTransition } from 'react';
import { Loader2, Plus, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { clearIntake, logAsNeeded, logIntake } from '@/actions/medication';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { SectionLabel } from '@/components/ui/section-label';
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
  // Which row is in flight. A single shared `pending` flag used to put a
  // spinner on *every* row whenever one was tapped, so the feedback appeared
  // everywhere except where the finger was.
  const [busyId, setBusyId] = useState<string | null>(null);

  function mark(dose: DueDoseView, status: 'taken' | 'skipped') {
    const rowId = `${dose.scheduleDoseId}-${dose.plannedLogDate}`;
    setBusyId(rowId);
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
      setBusyId(null);
    });
  }

  function takeAsNeeded(medication: AsNeededView) {
    setBusyId(medication.id);
    startTransition(async () => {
      const result = await logAsNeeded({
        medicationId: medication.id,
        doseAmount: medication.doseAmount.toString(),
        doseUnit: medication.doseUnit,
      });
      if (result.ok) toast.success(`${medication.name} erfasst`);
      else toast.error(result.error);
      setBusyId(null);
    });
  }

  const openCount = doses.filter((d) => d.status === 'open').length;
  const doneCount = doses.length - openCount;

  return (
    <Card>
      <CardHeader
        action={
          doses.length > 0 ? (
            <ProgressRing
              value={doneCount}
              max={doses.length}
              label="Dosen erledigt"
            />
          ) : null
        }
      >
        <CardTitle>Medikamente</CardTitle>
        <CardMeta>
          {doses.length === 0
            ? 'Heute nichts geplant'
            : openCount === 0
              ? 'Alles erledigt'
              : `${openCount} von ${doses.length} offen`}
        </CardMeta>
      </CardHeader>

      {doses.length > 0 ? (
        <ul className="divide-y divide-line-soft">
          {doses.map((dose, index) => {
            const rowId = `${dose.scheduleDoseId}-${dose.plannedLogDate}`;
            const busy = pending && busyId === rowId;
            return (
              <li
                key={rowId}
                className="rise-in flex items-center gap-3 py-2"
                style={{ '--i': index } as React.CSSProperties}
              >
                <span className="num w-12 shrink-0 text-sm text-muted">
                  {formatTimeOfDay(dose.timeOfDay)}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-base transition-colors duration-200',
                      dose.status === 'skipped'
                        ? 'text-muted line-through'
                        : 'text-fg'
                    )}
                  >
                    {dose.medicationName}
                  </p>
                  <p className="num text-xs text-muted">
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
                      aria-pressed={dose.status === 'skipped'}
                      className={cn(
                        'tap flex items-center justify-center rounded-pill border',
                        'transition-[background-color,border-color,color,transform] duration-120 ease-out-soft active:scale-90',
                        dose.status === 'skipped'
                          ? 'border-muted bg-muted/20 text-fg'
                          : 'border-line text-muted hover:bg-bg-sunken'
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
                        'tap flex items-center justify-center rounded-pill border',
                        'transition-[background-color,border-color,color,transform] duration-120 ease-out-soft active:scale-90',
                        dose.status === 'taken'
                          ? 'border-transparent bg-ok text-white'
                          : 'border-line text-muted hover:bg-ok-tint'
                      )}
                    >
                      {busy ? (
                        <Loader2 aria-hidden className="size-4 animate-spin" />
                      ) : (
                        <CheckMark drawn={dose.status === 'taken'} />
                      )}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}

      {asNeeded.length > 0 && !readOnly ? (
        <div className="mt-4 space-y-2 border-t border-line pt-3">
          <SectionLabel>Bei Bedarf</SectionLabel>
          <div className="-mx-1 flex flex-wrap gap-2 px-1">
            {asNeeded.map((medication) => (
              <Button
                key={medication.id}
                variant="outline"
                size="sm"
                onClick={() => takeAsNeeded(medication)}
                disabled={pending}
              >
                {pending && busyId === medication.id ? (
                  <Loader2 aria-hidden className="size-3.5 animate-spin" />
                ) : (
                  <Plus aria-hidden className="size-3.5" />
                )}
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

/**
 * The tick, drawn on rather than appearing. Checking a dose off is the most
 * repeated confirmation in the app, so it is worth the 400ms.
 *
 * `--dash` has to cover the path length; the check keyframe interpolates
 * stroke-dashoffset from it down to zero.
 */
function CheckMark({ drawn }: { drawn: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path
        d="M20 6 9 17l-5-5"
        strokeDasharray={24}
        // At rest the offset is 0, so the tick is simply visible. The keyframe
        // starts at --dash and runs to 0 with fill-mode forwards, so applying
        // the class draws it in and leaves it drawn.
        strokeDashoffset={0}
        style={{ '--dash': 24 } as React.CSSProperties}
        className={drawn ? 'animate-check' : undefined}
      />
    </svg>
  );
}
