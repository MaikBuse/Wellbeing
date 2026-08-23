'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/field';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  CONSEQUENCE,
  DIET_CHOICES,
  GOAL_CHOICES,
  MENOPAUSE_CHOICES,
  NUTRITION_DISCLAIMER_DE,
  PAL_CHOICES,
  SEX_CHOICES,
} from '@/lib/nutrition-goals';
import { formatGermanNumber } from '@/lib/nutrition';
import {
  saveNutritionProfileField,
  setNutritionAcknowledged,
} from '@/actions/nutrition';
import type { NutritionProfileFieldInput } from '@/lib/validation/nutritionProfile';

/**
 * The questionnaire.
 *
 * Field-by-field autosave, exactly like the daily check: filling it in the
 * first time and correcting it a year later are then the same screen with the
 * same interaction — no edit mode, no "discard changes", no half-finished state
 * to lose. Cross-field rules are enforced server-side and by table CHECKs, so a
 * partly answered profile is a legal state rather than an error to fight.
 *
 * No wizard steps. There is no stepper primitive in this project, and six route
 * segments would be the wrong investment for a form filled once and then
 * touched occasionally. The guidance comes from order, a progress ring, and a
 * consequence sentence directly under each answer.
 *
 * No `Disclosure` around the sections either: it unmounts its children, and
 * these questions depend on one another — menopause only appears for a female
 * reference, the renal cap only with a renal diagnosis. Collapsing them would
 * hide the fact that one answer created another question.
 */

export type ProfileFormValues = {
  referenceSex: 'female' | 'male' | null;
  birthYear: number | null;
  heightCm: number | null;
  activityLevel: (typeof PAL_CHOICES)[number]['value'];
  goal: (typeof GOAL_CHOICES)[number]['value'];
  hasSarcopenia: boolean;
  menopauseStage: 'pre' | 'peri' | 'post' | null;
  dietForm: (typeof DIET_CHOICES)[number]['value'];
  renalImpairment: boolean;
  proteinMaxGPerKg: number | null;
  weightSource: 'daily_log' | 'manual';
  referenceWeightKg: number | null;
};

/** Answers the ring counts. The rest have a usable default. */
const REQUIRED: (keyof ProfileFormValues)[] = [
  'referenceSex',
  'birthYear',
  'heightCm',
  'activityLevel',
  'goal',
  'dietForm',
];

export function GoalProfileForm({
  initial,
  /** Resolved on the server — a client clock would ignore the day boundary. */
  currentYear,
  latestWeight,
  acknowledged,
  steroidDetected,
}: {
  initial: ProfileFormValues;
  currentYear: number;
  latestWeight: { kg: number; onDate: string } | null;
  acknowledged: boolean;
  steroidDetected: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [ack, setAck] = useState(acknowledged);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const answered = REQUIRED.filter((key) => values[key] !== null).length;

  function save<K extends keyof ProfileFormValues>(
    field: K,
    value: ProfileFormValues[K]
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    startTransition(async () => {
      const result = await saveNutritionProfileField({
        field,
        value,
      } as NutritionProfileFieldInput);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleAck() {
    const next = !ack;
    setAck(next);
    startTransition(async () => {
      const result = await setNutritionAcknowledged({ acknowledged: next });
      if (!result.ok) {
        setAck(!next);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          action={
            saved ? (
              <span className="flex items-center gap-1 text-xs text-ok">
                <Check aria-hidden className="size-4" />
                gespeichert
              </span>
            ) : null
          }
        >
          <CardTitle>Angaben</CardTitle>
          <CardMeta>
            {answered} von {REQUIRED.length} Pflichtangaben erfasst. Jede
            Antwort wird sofort gespeichert.
          </CardMeta>
        </CardHeader>
        <div className="mt-3 flex justify-center">
          <ProgressRing
            value={answered}
            max={REQUIRED.length}
            label="Angaben"
          />
        </div>
      </Card>

      <Card>
        <CardTitle>Körper</CardTitle>

        <div className="mt-3 space-y-4">
          <Field
            label="Referenzwerte nach"
            hint="Wählt eine Spalte der Referenztabellen. Eisen, Calcium und der Energiebedarf unterscheiden sich dort; alles andere ist davon unberührt."
          >
            <ChipRow>
              {SEX_CHOICES.map((choice) => (
                <Chip
                  key={choice.value}
                  selected={values.referenceSex === choice.value}
                  onClick={() => save('referenceSex', choice.value)}
                >
                  {choice.labelDe}
                </Chip>
              ))}
            </ChipRow>
          </Field>

          <Field label="Geburtsjahr" htmlFor="birth-year">
            <Input
              id="birth-year"
              type="number"
              inputMode="numeric"
              min={1900}
              max={currentYear}
              defaultValue={values.birthYear ?? ''}
              onBlur={(event) =>
                save(
                  'birthYear',
                  event.target.value === '' ? null : Number(event.target.value)
                )
              }
            />
          </Field>

          <Field label="Körpergröße in cm" htmlFor="height-cm">
            <Input
              id="height-cm"
              type="number"
              inputMode="numeric"
              min={100}
              max={250}
              defaultValue={values.heightCm ?? ''}
              onBlur={(event) =>
                save(
                  'heightCm',
                  event.target.value === '' ? null : Number(event.target.value)
                )
              }
            />
          </Field>

          <Field
            label="Gewicht"
            hint="Das Eiweiß- und Energieziel hängen daran. Aus dem Tagescheck wird der Mittelwert der letzten vier Wochen genommen, damit das Ziel nicht mit dem Tagesgewicht schwankt."
          >
            <ChipRow>
              <Chip
                selected={values.weightSource === 'daily_log'}
                disabled={latestWeight === null}
                onClick={() => save('weightSource', 'daily_log')}
              >
                {latestWeight
                  ? `Aus dem Tagescheck (${formatGermanNumber(latestWeight.kg, 1)} kg)`
                  : 'Aus dem Tagescheck'}
              </Chip>
              <Chip
                selected={values.weightSource === 'manual'}
                onClick={() => save('weightSource', 'manual')}
              >
                Selbst angeben
              </Chip>
            </ChipRow>
            {latestWeight === null ? (
              <p className="text-xs text-muted">
                Im Tagescheck ist noch kein Gewicht erfasst.
              </p>
            ) : null}
            {values.weightSource === 'manual' ? (
              <Input
                inputMode="decimal"
                aria-label="Gewicht in Kilogramm"
                defaultValue={
                  values.referenceWeightKg === null
                    ? ''
                    : formatGermanNumber(values.referenceWeightKg, 1)
                }
                onBlur={(event) =>
                  save(
                    'referenceWeightKg',
                    event.target.value.trim() === ''
                      ? null
                      : Number(event.target.value.replace(',', '.'))
                  )
                }
              />
            ) : null}
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Alltag</CardTitle>

        <div className="mt-3 space-y-4">
          <Field label="Wie viel bewegst du dich an einem üblichen Tag?">
            <ChipRow>
              {PAL_CHOICES.map((choice) => (
                <Chip
                  key={choice.value}
                  selected={values.activityLevel === choice.value}
                  onClick={() => save('activityLevel', choice.value)}
                  className="h-auto min-h-11 flex-1 basis-24 flex-col items-start py-1.5"
                >
                  <span className="num text-sm font-semibold">
                    {choice.number}
                  </span>
                  <span className="text-left text-xs font-normal opacity-90">
                    {choice.labelDe}
                  </span>
                </Chip>
              ))}
            </ChipRow>
          </Field>

          <Field label="Gewichtsziel">
            <ChipRow>
              {GOAL_CHOICES.map((choice) => (
                <Chip
                  key={choice.value}
                  selected={values.goal === choice.value}
                  onClick={() => save('goal', choice.value)}
                >
                  {choice.labelDe}
                </Chip>
              ))}
            </ChipRow>
            {values.goal === 'lose' ? (
              <p className="text-xs text-muted">{CONSEQUENCE.lose}</p>
            ) : null}
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Ernährungsform</CardTitle>
        <div className="mt-3">
          <ChipRow>
            {DIET_CHOICES.map((choice) => (
              <Chip
                key={choice.value}
                selected={values.dietForm === choice.value}
                onClick={() => save('dietForm', choice.value)}
              >
                {choice.labelDe}
              </Chip>
            ))}
          </ChipRow>
          {CONSEQUENCE[values.dietForm] ? (
            <p className="mt-2 text-xs text-muted">
              {CONSEQUENCE[values.dietForm]}
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gesundheit</CardTitle>
          <CardMeta>Nur, wenn es ärztlich festgestellt wurde.</CardMeta>
        </CardHeader>

        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-medium text-fg">Kortison dauerhaft</p>
            <p className="mt-1 text-xs text-muted">
              {steroidDetected
                ? 'Aus deiner Medikationsliste erkannt: ja. Calcium und Vitamin D sind entsprechend angehoben.'
                : 'Aus deiner Medikationsliste erkannt: nein. Sobald dort dauerhaft ein Kortisonpräparat steht, ändert sich das von selbst.'}
            </p>
            {steroidDetected ? (
              <p className="mt-1 text-xs text-muted">{CONSEQUENCE.steroid}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-fg">
                Sarkopenie oder ungewollter Gewichtsverlust
              </span>
              <Switch
                checked={values.hasSarcopenia}
                onCheckedChange={(next) => save('hasSarcopenia', next)}
                disabled={pending}
                aria-label="Sarkopenie oder ungewollter Gewichtsverlust"
              />
            </label>
            {values.hasSarcopenia ? (
              <p className="text-xs text-muted">{CONSEQUENCE.sarcopenia}</p>
            ) : null}
          </div>

          {values.referenceSex === 'female' ? (
            <Field label="Menopause">
              <ChipRow>
                {MENOPAUSE_CHOICES.map((choice) => (
                  <Chip
                    key={choice.value}
                    selected={values.menopauseStage === choice.value}
                    onClick={() => save('menopauseStage', choice.value)}
                  >
                    {choice.labelDe}
                  </Chip>
                ))}
              </ChipRow>
            </Field>
          ) : null}

          <div className="space-y-2">
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-fg">
                Nierenerkrankung
              </span>
              <Switch
                checked={values.renalImpairment}
                onCheckedChange={(next) => save('renalImpairment', next)}
                disabled={pending}
                aria-label="Nierenerkrankung"
              />
            </label>
            {values.renalImpairment ? (
              <>
                <p className="text-xs text-muted">{CONSEQUENCE.renal}</p>
                <Field
                  label="Ärztlich gesetzte Eiweiß-Obergrenze in g je kg"
                  htmlFor="protein-cap"
                  hint="Nur eintragen, wenn dir eine Zahl genannt wurde."
                >
                  <Input
                    id="protein-cap"
                    inputMode="decimal"
                    defaultValue={
                      values.proteinMaxGPerKg === null
                        ? ''
                        : formatGermanNumber(values.proteinMaxGPerKg, 2)
                    }
                    onBlur={(event) =>
                      save(
                        'proteinMaxGPerKg',
                        event.target.value.trim() === ''
                          ? null
                          : Number(event.target.value.replace(',', '.'))
                      )
                    }
                  />
                </Field>
              </>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Einordnung</CardTitle>
        <CardMeta className="mt-1">{NUTRITION_DISCLAIMER_DE}</CardMeta>

        {/*
         * A pressed button, not a switch. A switch reads as a preference, and
         * this is the condition under which the numbers may be shown at all —
         * the same shape the flare button on the daily check uses.
         */}
        <button
          type="button"
          aria-pressed={ack}
          disabled={pending}
          onClick={toggleAck}
          className={cn(
            'mt-3 flex min-h-11 w-full items-center justify-between rounded-control border px-3 text-sm font-medium',
            'transition-[background-color,border-color] duration-120 ease-out-soft',
            ack
              ? 'border-primary-strong bg-primary text-primary-fg'
              : 'border-line-strong bg-card text-fg hover:border-primary-strong'
          )}
        >
          <span>Verstanden — Ziele anzeigen</span>
          <span className="text-xs">{ack ? 'ja' : 'nein'}</span>
        </button>
      </Card>
    </div>
  );
}
