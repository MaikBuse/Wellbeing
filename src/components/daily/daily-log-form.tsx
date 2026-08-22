'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { Check, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { saveDailyLogField, toggleJoint } from '@/actions/dailyLog';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Disclosure } from '@/components/ui/disclosure';
import { Field, Input } from '@/components/ui/field';
import { ScoreChips } from '@/components/ui/score-chips';
import {
  BRISTOL_SCALE,
  SLEEP_CHIPS,
  STIFFNESS_CHIPS,
  bristolGroup,
} from '@/lib/scales';
import { cn } from '@/lib/utils';

export type DailyLogValues = {
  jointPain: number | null;
  morningStiffnessMinutes: number | null;
  fatigue: number | null;
  wellbeing: number | null;
  isFlare: boolean;
  sleepMinutes: number | null;
  sleepQuality: number | null;
  stress: number | null;
  activityMinutes: number | null;
  bristolTypical: number | null;
  weightKg: number | null;
  note: string | null;
};

export type JointOption = { key: string; labelDe: string };

/**
 * One scrollable form, everything optional, autosave per field — no submit
 * button. A daily check-in that demands completeness gets skipped on bad days,
 * and bad days are exactly the ones the analysis needs.
 */
export function DailyLogForm({
  logDate,
  values,
  joints,
  selectedJoints,
  trackWeight,
}: {
  logDate: string;
  values: DailyLogValues;
  joints: JointOption[];
  selectedJoints: string[];
  trackWeight: boolean;
}) {
  const [, startTransition] = useTransition();
  const [saved, setSaved] = useState<string | null>(null);
  const [optimisticJoints, addOptimisticJoint] = useOptimistic(
    selectedJoints,
    (current: string[], key: string) =>
      current.includes(key)
        ? current.filter((value) => value !== key)
        : [...current, key]
  );

  function save(field: string, value: string | boolean | null) {
    startTransition(async () => {
      const result = await saveDailyLogField({ logDate, field, value });
      if (result.ok) {
        setSaved(field);
        setTimeout(() => setSaved(null), 1200);
      } else {
        toast.error(result.error);
      }
    });
  }

  function flip(key: string) {
    startTransition(async () => {
      addOptimisticJoint(key);
      const result = await toggleJoint({
        logDate,
        jointKey: key,
        side: 'both',
      });
      if (!result.ok) toast.error(result.error);
    });
  }

  const filled = [
    values.jointPain,
    values.morningStiffnessMinutes,
    values.fatigue,
    values.sleepQuality,
    values.stress,
  ].filter((value) => value !== null).length;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Tagescheck</CardTitle>
          <CardMeta>{filled} von 5 Kernwerten erfasst</CardMeta>
        </div>
        {saved ? (
          <span className="flex items-center gap-1 text-xs text-ok">
            <Check aria-hidden className="size-3.5" />
            gespeichert
          </span>
        ) : null}
      </CardHeader>

      <div className="space-y-5">
        <Field label="Gelenkschmerzen" htmlFor="jointPain">
          <ScoreChips
            name="jointPain"
            value={values.jointPain}
            onChange={(value) => save('jointPain', value?.toString() ?? '')}
            labelledBy="jointPain-label"
          />
        </Field>

        <Field label="Morgensteifigkeit">
          <ChipRow>
            {STIFFNESS_CHIPS.map((option) => (
              <Chip
                key={option.value}
                selected={values.morningStiffnessMinutes === option.value}
                onClick={() =>
                  save('morningStiffnessMinutes', option.value.toString())
                }
              >
                {option.label}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label="Erschöpfung" htmlFor="fatigue">
          <ScoreChips
            name="fatigue"
            value={values.fatigue}
            onChange={(value) => save('fatigue', value?.toString() ?? '')}
            labelledBy="fatigue-label"
          />
        </Field>

        {/* The single most valuable field for the later analysis: flares last
            weeks, and without marking them every food eaten during one looks
            guilty. */}
        <button
          type="button"
          onClick={() => save('isFlare', !values.isFlare)}
          aria-pressed={values.isFlare}
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors',
            values.isFlare
              ? 'border-danger bg-danger/10'
              : 'border-line bg-card hover:bg-soft'
          )}
        >
          <span className="flex items-center gap-2">
            <Flame
              aria-hidden
              className={cn(
                'size-5',
                values.isFlare ? 'text-danger' : 'text-muted'
              )}
            />
            <span>
              <span className="block text-sm font-medium text-fg">
                Heute ein Schub
              </span>
              <span className="block text-xs text-muted">
                Hilft später, Schubphasen aus der Auswertung herauszurechnen.
              </span>
            </span>
          </span>
          <span
            className={cn(
              'text-sm font-medium',
              values.isFlare ? 'text-danger' : 'text-muted'
            )}
          >
            {values.isFlare ? 'ja' : 'nein'}
          </span>
        </button>

        <Disclosure label="Betroffene Gelenke">
          <ChipRow>
            {joints.map((joint) => (
              <Chip
                key={joint.key}
                selected={optimisticJoints.includes(joint.key)}
                onClick={() => flip(joint.key)}
              >
                {joint.labelDe}
              </Chip>
            ))}
          </ChipRow>
        </Disclosure>

        <Disclosure label="Schlaf, Stress und Bewegung">
          <div className="space-y-5">
            <Field
              label="Schlafdauer"
              hint="Schlechter Schlaf treibt Schmerz und Essverhalten gleichzeitig – ohne diesen Wert sind Essens-Zusammenhänge unzuverlässig."
            >
              <ChipRow>
                {SLEEP_CHIPS.map((option) => (
                  <Chip
                    key={option.value}
                    selected={values.sleepMinutes === option.value}
                    onClick={() =>
                      save('sleepMinutes', option.value.toString())
                    }
                  >
                    {option.label}
                  </Chip>
                ))}
              </ChipRow>
            </Field>

            <Field label="Schlafqualität" htmlFor="sleepQuality">
              <ScoreChips
                name="sleepQuality"
                value={values.sleepQuality}
                onChange={(value) =>
                  save('sleepQuality', value?.toString() ?? '')
                }
                labelledBy="sleepQuality-label"
              />
            </Field>

            <Field label="Stress" htmlFor="stress">
              <ScoreChips
                name="stress"
                value={values.stress}
                onChange={(value) => save('stress', value?.toString() ?? '')}
                labelledBy="stress-label"
              />
            </Field>

            <Field label="Bewegung (Minuten)" htmlFor="activityMinutes">
              <Input
                id="activityMinutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={1440}
                defaultValue={values.activityMinutes ?? ''}
                onBlur={(event) => save('activityMinutes', event.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
        </Disclosure>

        <Disclosure label="Verdauung und Gewicht">
          <div className="space-y-5">
            <Field
              label="Stuhlgang (Bristol-Skala)"
              hint={
                values.bristolTypical
                  ? bristolGroup(values.bristolTypical)
                  : undefined
              }
            >
              <ChipRow>
                {BRISTOL_SCALE.map((option) => (
                  <Chip
                    key={option.value}
                    selected={values.bristolTypical === option.value}
                    onClick={() =>
                      save('bristolTypical', option.value.toString())
                    }
                    title={option.label}
                  >
                    Typ {option.value}
                  </Chip>
                ))}
              </ChipRow>
            </Field>

            {trackWeight ? (
              <Field label="Gewicht (kg)" htmlFor="weightKg">
                <Input
                  id="weightKg"
                  type="text"
                  inputMode="decimal"
                  defaultValue={values.weightKg ?? ''}
                  onBlur={(event) => save('weightKg', event.target.value)}
                  placeholder="z. B. 64,5"
                />
              </Field>
            ) : null}
          </div>
        </Disclosure>
      </div>
    </Card>
  );
}
