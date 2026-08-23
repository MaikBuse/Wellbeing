'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
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
  PAL_CHOICES,
  SEX_CHOICES,
} from '@/lib/nutrition-goals';
import { formatGermanNumber, parseGermanNumber } from '@/lib/nutrition';
import { saveNutritionProfileField } from '@/actions/nutrition';
import {
  PROFILE_HINT_DE,
  type NutritionProfileFieldInput,
  type NutritionProfileNumberField,
} from '@/lib/validation/nutritionProfile';

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
 *
 * Every number leaves here as the STRING the user typed. The schema parses it
 * with `germanNumber`, so "72,5" survives; sending `Number(field.value)` made
 * every weight fail its type check and answered with zod's English "Invalid
 * input" — about a perfectly ordinary weight.
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

/** Everything that is not a free-typed number: chips, switches, enums. */
type ChoiceFieldInput = Exclude<
  NutritionProfileFieldInput,
  { field: NutritionProfileNumberField }
>;

/**
 * The answers a target actually depends on.
 *
 * Not the same as "fields on this form": `activityLevel`, `goal` and `dietForm`
 * have defaults and are therefore always answered. Counting them made the ring
 * read "6 von 6" while nothing at all was being computed.
 */
const REQUIRED = ['referenceSex', 'birthYear', 'heightCm', 'weight'] as const;
type RequiredAnswer = (typeof REQUIRED)[number];

const MISSING_TEXT: Record<RequiredAnswer, string> = {
  referenceSex:
    'Referenzwerte nach — ohne sie bleiben die Vitamin-, Eisen- und Zinkziele leer.',
  birthYear: 'Geburtsjahr — ohne es lässt sich der Energiebedarf nicht schätzen.',
  heightCm: 'Körpergröße — ohne sie lässt sich der Energiebedarf nicht schätzen.',
  weight: 'Gewicht — ohne es gibt es kein Energie- und kein Eiweißziel.',
};

/** Plain digits: `formatGermanNumber` would group 1985 into "1.985". */
function integerText(value: number | null): string {
  return value === null ? '' : String(value);
}

export function GoalProfileForm({
  initial,
  /** Resolved on the server — a client clock would ignore the day boundary. */
  currentYear,
  latestWeight,
  weightFromLog,
  steroidDetected,
}: {
  initial: ProfileFormValues;
  currentYear: number;
  latestWeight: { kg: number; onDate: string } | null;
  /**
   * The 28-day median from the daily check, exactly as the derivation reads it
   * — not the latest entry. Showing the number the targets are built from is
   * the whole point of printing it here.
   */
  weightFromLog: number | null;
  steroidDetected: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [text, setText] = useState({
    birthYear: integerText(initial.birthYear),
    heightCm: integerText(initial.heightCm),
    referenceWeightKg: formatGermanNumber(initial.referenceWeightKg, 1),
    proteinMaxGPerKg: formatGermanNumber(initial.proteinMaxGPerKg, 2),
  });
  const [errors, setErrors] = useState<
    Partial<Record<NutritionProfileNumberField, string>>
  >({});
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  /*
   * The weight the derivation will use, recomputed here rather than taken from
   * the server: switching the source is a client-side change, and a stale
   * number under the field would be worse than none.
   */
  const weightKg =
    values.weightSource === 'manual'
      ? values.referenceWeightKg
      : (weightFromLog ?? values.referenceWeightKg);

  const missing = REQUIRED.filter((key) =>
    key === 'weight' ? weightKg === null : values[key] === null
  );

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  function save(input: ChoiceFieldInput) {
    setValues((current) => ({ ...current, [input.field]: input.value }));
    startTransition(async () => {
      const result = await saveNutritionProfileField(input);
      if (result.ok) flashSaved();
    });
  }

  /**
   * Build the discriminated-union payload with the field narrowed.
   *
   * Four lines instead of an `as NutritionProfileFieldInput` cast — and that
   * cast is exactly what let a `number` reach a `string` schema unnoticed.
   */
  function numberInput(
    field: NutritionProfileNumberField,
    value: string
  ): NutritionProfileFieldInput {
    switch (field) {
      case 'birthYear':
        return { field, value };
      case 'heightCm':
        return { field, value };
      case 'proteinMaxGPerKg':
        return { field, value };
      case 'referenceWeightKg':
        return { field, value };
    }
  }

  function saveNumber(field: NutritionProfileNumberField, raw: string) {
    const trimmed = raw.trim();
    startTransition(async () => {
      const result = await saveNutritionProfileField(numberInput(field, trimmed));
      if (result.ok) {
        setValues((current) => ({
          ...current,
          [field]: trimmed === '' ? null : parseGermanNumber(trimmed),
        }));
        setErrors((current) => {
          if (current[field] === undefined) return current;
          const next = { ...current };
          delete next[field];
          return next;
        });
        flashSaved();
      } else {
        // Back to the last value the server accepted: leaving the rejected
        // text in place next to an error reads as if it had been stored.
        setErrors((current) => ({ ...current, [field]: result.error }));
        setText((current) => ({
          ...current,
          [field]:
            field === 'birthYear' || field === 'heightCm'
              ? integerText(values[field])
              : formatGermanNumber(
                  values[field],
                  field === 'proteinMaxGPerKg' ? 2 : 1
                ),
        }));
      }
    });
  }

  function numberField(field: NutritionProfileNumberField) {
    return {
      value: text[field],
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        setText((current) => ({ ...current, [field]: event.target.value })),
      onBlur: (event: React.FocusEvent<HTMLInputElement>) =>
        saveNumber(field, event.target.value),
      'aria-invalid': errors[field] !== undefined,
    };
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
            {REQUIRED.length - missing.length} von {REQUIRED.length} Angaben
            erfasst, aus denen gerechnet wird. Jede Antwort wird sofort
            gespeichert.
          </CardMeta>
        </CardHeader>
        <div className="mt-3 flex justify-center">
          <ProgressRing
            value={REQUIRED.length - missing.length}
            max={REQUIRED.length}
            label="Angaben"
          />
        </div>
        {missing.length > 0 ? (
          <div className="mt-3">
            <p className="text-sm font-medium text-fg">Es fehlt noch:</p>
            <ul className="mt-1 space-y-1">
              {missing.map((key) => (
                <li key={key} className="text-xs text-muted">
                  {MISSING_TEXT[key]}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">
            Alles da. Die Zielwerte stehen unter „Nährstoff-Ziele“ und in der
            Tagesansicht.
          </p>
        )}
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
                  onClick={() =>
                    save({ field: 'referenceSex', value: choice.value })
                  }
                >
                  {choice.labelDe}
                </Chip>
              ))}
            </ChipRow>
          </Field>

          <Field
            label="Geburtsjahr"
            htmlFor="birth-year"
            hint={PROFILE_HINT_DE.birthYear}
            error={errors.birthYear ?? null}
          >
            <Input
              id="birth-year"
              type="number"
              inputMode="numeric"
              min={1900}
              max={currentYear}
              {...numberField('birthYear')}
            />
          </Field>

          <Field
            label="Körpergröße in cm"
            htmlFor="height-cm"
            hint={PROFILE_HINT_DE.heightCm}
            error={errors.heightCm ?? null}
          >
            <Input
              id="height-cm"
              type="number"
              inputMode="numeric"
              min={100}
              max={250}
              {...numberField('heightCm')}
            />
          </Field>

          <Field
            label="Gewicht"
            hint="Das Eiweiß- und Energieziel hängen daran. Aus dem Tagescheck wird der Mittelwert der letzten vier Wochen genommen, damit das Ziel nicht mit dem Tagesgewicht schwankt."
            error={errors.referenceWeightKg ?? null}
          >
            <ChipRow>
              <Chip
                selected={values.weightSource === 'daily_log'}
                disabled={latestWeight === null}
                onClick={() =>
                  save({ field: 'weightSource', value: 'daily_log' })
                }
              >
                {latestWeight
                  ? `Aus dem Tagescheck (${formatGermanNumber(latestWeight.kg, 1)} kg)`
                  : 'Aus dem Tagescheck'}
              </Chip>
              <Chip
                selected={values.weightSource === 'manual'}
                onClick={() => save({ field: 'weightSource', value: 'manual' })}
              >
                Selbst angeben
              </Chip>
            </ChipRow>
            {values.weightSource === 'manual' ? (
              <Input
                inputMode="decimal"
                aria-label="Gewicht in Kilogramm"
                placeholder="72,5"
                {...numberField('referenceWeightKg')}
              />
            ) : null}
            <p className="text-xs text-muted">
              {weightKg !== null
                ? `Gerechnet wird mit ${formatGermanNumber(weightKg, 1)} kg.`
                : values.weightSource === 'manual'
                  ? `Noch kein Gewicht eingetragen. ${PROFILE_HINT_DE.referenceWeightKg}`
                  : 'Im Tagescheck ist noch kein Gewicht erfasst. Bis dahin bleiben das Energie- und das Eiweißziel leer — oder gib es hier selbst an.'}
            </p>
          </Field>
        </div>
      </Card>

      <Card>
        <CardTitle>Alltag</CardTitle>

        <div className="mt-3 space-y-4">
          <Field label="Wie viel bewegst du dich an einem üblichen Tag?">
            {/*
             * A list, not a row of pills. The labels are half sentences, and a
             * pill radius on a wrapped two-line chip cut into the words.
             */}
            <div className="grid gap-2">
              {PAL_CHOICES.map((choice) => (
                <OptionRow
                  key={choice.value}
                  selected={values.activityLevel === choice.value}
                  lead={choice.number}
                  onClick={() =>
                    save({ field: 'activityLevel', value: choice.value })
                  }
                >
                  {choice.labelDe}
                </OptionRow>
              ))}
            </div>
          </Field>

          <Field label="Gewichtsziel">
            <ChipRow>
              {GOAL_CHOICES.map((choice) => (
                <Chip
                  key={choice.value}
                  selected={values.goal === choice.value}
                  onClick={() => save({ field: 'goal', value: choice.value })}
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
                onClick={() => save({ field: 'dietForm', value: choice.value })}
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
                onCheckedChange={(next) =>
                  save({ field: 'hasSarcopenia', value: next })
                }
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
                    onClick={() =>
                      save({ field: 'menopauseStage', value: choice.value })
                    }
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
                onCheckedChange={(next) =>
                  save({ field: 'renalImpairment', value: next })
                }
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
                  hint={`Nur eintragen, wenn dir eine Zahl genannt wurde. ${PROFILE_HINT_DE.proteinMaxGPerKg}`}
                  error={errors.proteinMaxGPerKg ?? null}
                >
                  <Input
                    id="protein-cap"
                    inputMode="decimal"
                    placeholder="0,80"
                    {...numberField('proteinMaxGPerKg')}
                  />
                </Field>
              </>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * One answer on its own line, with a lead-in number.
 *
 * Square, not a pill: these labels are half sentences, and a wrapped pill puts
 * its radius through the first and last word. Same colours as `Chip` so the
 * selected state reads identically across the form.
 */
function OptionRow({
  selected,
  lead,
  children,
  ...props
}: React.ComponentProps<'button'> & { selected: boolean; lead: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-control border px-3 py-2 text-left',
        'transition-[background-color,border-color,color] duration-120 ease-out-soft',
        selected
          ? 'border-primary-strong bg-primary text-primary-fg'
          : 'border-line-strong bg-card text-fg hover:border-primary-strong hover:bg-primary-tint'
      )}
      {...props}
    >
      <span className="num w-8 shrink-0 text-sm font-semibold tabular-nums">
        {lead}
      </span>
      <span className="text-sm font-medium">{children}</span>
    </button>
  );
}
