'use client';

import { useState, useTransition } from 'react';
import { Loader2, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createFoodPortion,
  deleteFoodPortion,
  setDefaultFoodPortion,
  updateFoodPortion,
} from '@/actions/foods';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Disclosure } from '@/components/ui/disclosure';
import { Field, FieldError, Input } from '@/components/ui/field';
import { SectionLabel } from '@/components/ui/section-label';
import { formatGermanNumber, parseGermanNumber } from '@/lib/nutrition';
import {
  resolvePortionGrams,
  type PortionGramsField,
  type PortionGramsMode,
} from '@/lib/validation/food';

export type PortionRow = {
  id: string;
  labelDe: string;
  grams: number;
  isDefault: boolean;
};

/** The grams half of the form, as the strings the inputs hold. */
type Draft = {
  labelDe: string;
  mode: PortionGramsMode;
  amount: string;
  count: string;
  totalAmount: string;
  kcalPerUnit: string;
};

const EMPTY: Draft = {
  labelDe: '',
  mode: 'direct',
  amount: '',
  count: '',
  totalAmount: '',
  kcalPerUnit: '',
};

const MODES: { key: PortionGramsMode; label: string }[] = [
  { key: 'direct', label: 'direkt' },
  { key: 'weighed', label: 'abwiegen' },
  { key: 'kcal', label: 'aus kcal' },
];

/**
 * Maintaining a food's own measures — "1 Stück", "1 Scheibe" — and the weight of
 * one of them.
 *
 * Until this existed, `food_portion` rows could only ever be born from an Open
 * Food Facts `serving_size`; nothing in the app could create, rename, re-weigh
 * or delete one. A food from the BLS catalog got none at all, so an egg had no
 * way to be counted in pieces.
 *
 * The two conversion modes are the actual point. Nobody knows what an egg
 * weighs, but ten of them on a kitchen scale is a fact you can read off, and a
 * packet that only states calories per bar is a fact you can divide. Doing that
 * arithmetic in your head and typing the result is exactly the step this is
 * meant to remove.
 */
export function PortionEditor({
  foodId,
  portions,
  suggestions,
  kcal100,
  basisUnit,
}: {
  foodId: string;
  portions: PortionRow[];
  /** Household measures plus the labels already used in the shared catalog. */
  suggestions: string[];
  /** The food's energy per 100 basis units — the "aus kcal" mode's only anchor. */
  kcal100: number | null;
  basisUnit: 'g' | 'ml';
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, id: string, done: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (result.ok) toast.success(done);
      else toast.error(result.error ?? 'Fehlgeschlagen');
    });
  }

  return (
    <div className="space-y-3">
      {portions.length > 0 ? (
        <ul className="divide-y divide-line-soft">
          {portions.map((portion) =>
            editingId === portion.id ? (
              <li key={portion.id} className="py-2">
                <PortionForm
                  submitLabel="Speichern"
                  initial={{
                    ...EMPTY,
                    labelDe: portion.labelDe,
                    amount: formatGermanNumber(portion.grams, 2),
                  }}
                  suggestions={suggestions}
                  kcal100={kcal100}
                  basisUnit={basisUnit}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(payload, finish) =>
                    startTransition(async () => {
                      const result = await updateFoodPortion({
                        portionId: portion.id,
                        ...payload,
                      });
                      if (result.ok) {
                        toast.success('Einheit gespeichert');
                        setEditingId(null);
                        finish();
                      } else toast.error(result.error);
                    })
                  }
                />
              </li>
            ) : (
              <li key={portion.id} className="flex items-center gap-1 py-1">
                <button
                  type="button"
                  onClick={() =>
                    run(
                      () => setDefaultFoodPortion(portion.id),
                      portion.id,
                      `„${portion.labelDe}“ ist jetzt die Standardeinheit`
                    )
                  }
                  disabled={pending || portion.isDefault}
                  aria-label={
                    portion.isDefault
                      ? `${portion.labelDe} ist die Standardeinheit`
                      : `${portion.labelDe} zur Standardeinheit machen`
                  }
                  aria-pressed={portion.isDefault}
                  className="flex size-11 shrink-0 items-center justify-center rounded-control disabled:opacity-100"
                >
                  <Star
                    aria-hidden
                    className={
                      portion.isDefault
                        ? 'size-4 fill-primary text-primary'
                        : 'size-4 text-muted'
                    }
                  />
                </button>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">
                    {portion.labelDe}
                    {/* Not colour alone: the filled star gets a word next to it. */}
                    {portion.isDefault ? (
                      <span className="text-muted"> · Standard</span>
                    ) : null}
                  </p>
                  <p className="num text-xs text-muted">
                    1 {portion.labelDe} = {formatGermanNumber(portion.grams, 2)}{' '}
                    {basisUnit}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingId(portion.id)}
                  disabled={pending}
                >
                  Ändern
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => deleteFoodPortion(portion.id),
                      portion.id,
                      'Einheit gelöscht'
                    )
                  }
                  aria-label={`Einheit ${portion.labelDe} löschen`}
                >
                  {pending && busyId === portion.id ? (
                    <Loader2 aria-hidden className="size-4 animate-spin" />
                  ) : (
                    <Trash2 aria-hidden className="size-4 text-muted" />
                  )}
                </Button>
              </li>
            )
          )}
        </ul>
      ) : null}

      <Disclosure label="Einheit hinzufügen">
        <PortionForm
          submitLabel="Anlegen"
          initial={EMPTY}
          suggestions={suggestions}
          kcal100={kcal100}
          basisUnit={basisUnit}
          onSubmit={(payload, finish) =>
            startTransition(async () => {
              const result = await createFoodPortion({ foodId, ...payload });
              if (result.ok) {
                toast.success('Einheit angelegt');
                finish();
              } else toast.error(result.error);
            })
          }
        />
      </Disclosure>

      <p className="text-xs text-muted">
        Die Standardeinheit ist die Menge, mit der ein Tippen auf den Chip beim
        Erfassen zählt. Eine Einheit zu löschen ändert nichts an bereits
        erfassten Mahlzeiten – deren Menge und Nährwerte stehen fest.
      </p>
    </div>
  );
}

type Payload = {
  labelDe: string;
  mode: PortionGramsMode;
  amount: string;
  count: string;
  totalAmount: string;
  kcalPerUnit: string;
};

function PortionForm({
  submitLabel,
  initial,
  suggestions,
  kcal100,
  basisUnit,
  onSubmit,
  onCancel,
}: {
  submitLabel: string;
  initial: Draft;
  suggestions: string[];
  kcal100: number | null;
  basisUnit: 'g' | 'ml';
  onSubmit: (payload: Payload, finish: () => void) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  // The same function the server action calls. A preview that does its own
  // arithmetic eventually promises a number the server refuses to store.
  const resolved = resolvePortionGrams({
    mode: draft.mode,
    amount: parseGermanNumber(draft.amount),
    count: parseGermanNumber(draft.count),
    totalAmount: parseGermanNumber(draft.totalAmount),
    kcalPerUnit: parseGermanNumber(draft.kcalPerUnit),
    kcal100,
    unit: basisUnit,
  });

  // Nothing typed yet is not a mistake. Without this the form scolds you the
  // moment it opens — and, worse, right after a successful create, when it
  // resets to empty and the fresh red border reads as "that did not save".
  const touched =
    draft.amount.trim() !== '' ||
    draft.count.trim() !== '' ||
    draft.totalAmount.trim() !== '' ||
    draft.kcalPerUnit.trim() !== '';
  const errorField: PortionGramsField | null =
    resolved.ok || !touched ? null : resolved.field;
  const nameMissing = draft.labelDe.trim() === '';
  const unitName = draft.labelDe.trim() || 'Einheit';

  function submit() {
    onSubmit(draft, () => setDraft(initial));
  }

  return (
    <div className="space-y-4">
      <Field
        label="Name der Einheit"
        htmlFor="portionLabel"
        hint="Wie du die Menge nennst – „Stück“, „Scheibe“, „EL“."
      >
        {suggestions.length > 0 ? (
          <ChipRow className="mb-2">
            {suggestions.map((label) => (
              <Chip
                key={label}
                selected={
                  draft.labelDe.trim().toLocaleLowerCase('de-DE') ===
                  label.toLocaleLowerCase('de-DE')
                }
                onClick={() => set({ labelDe: label })}
              >
                {label}
              </Chip>
            ))}
          </ChipRow>
        ) : null}
        <Input
          id="portionLabel"
          type="text"
          value={draft.labelDe}
          maxLength={40}
          onChange={(event) => set({ labelDe: event.target.value })}
          placeholder="z. B. Stück"
        />
      </Field>

      <div className="space-y-2">
        <SectionLabel>Gewicht einer Einheit</SectionLabel>
        <ChipRow>
          {MODES.map((mode) => (
            <Chip
              key={mode.key}
              selected={draft.mode === mode.key}
              disabled={mode.key === 'kcal' && !kcal100}
              onClick={() => set({ mode: mode.key })}
            >
              {mode.label}
            </Chip>
          ))}
        </ChipRow>
        {!kcal100 ? (
          <p className="text-xs text-muted">
            „aus kcal“ braucht einen Kalorienwert je 100 {basisUnit}. Trag ihn
            oben unter „Nährwerte ändern“ ein.
          </p>
        ) : null}
      </div>

      {draft.mode === 'direct' ? (
        <Field
          label={`Gewicht (${basisUnit})`}
          htmlFor="portionAmount"
          error={errorField === 'amount' && !resolved.ok ? resolved.error : null}
        >
          <Input
            id="portionAmount"
            type="text"
            inputMode="decimal"
            value={draft.amount}
            aria-invalid={errorField === 'amount'}
            onChange={(event) => set({ amount: event.target.value })}
            placeholder="z. B. 58"
          />
        </Field>
      ) : null}

      {draft.mode === 'weighed' ? (
        <div className="space-y-3">
          <Field
            label="Anzahl"
            htmlFor="portionCount"
            hint="Wie viele du zusammen auf die Waage gelegt hast."
            error={errorField === 'count' && !resolved.ok ? resolved.error : null}
          >
            <Input
              id="portionCount"
              type="text"
              inputMode="numeric"
              value={draft.count}
              aria-invalid={errorField === 'count'}
              onChange={(event) => set({ count: event.target.value })}
              placeholder="z. B. 10"
            />
          </Field>
          <Field
            label={`Gesamtgewicht (${basisUnit})`}
            htmlFor="portionTotal"
            error={
              errorField === 'totalAmount' && !resolved.ok
                ? resolved.error
                : null
            }
          >
            <Input
              id="portionTotal"
              type="text"
              inputMode="decimal"
              value={draft.totalAmount}
              aria-invalid={errorField === 'totalAmount'}
              onChange={(event) => set({ totalAmount: event.target.value })}
              placeholder="z. B. 580"
            />
          </Field>
        </div>
      ) : null}

      {draft.mode === 'kcal' ? (
        <Field
          label={`Kalorien je ${unitName}`}
          htmlFor="portionKcal"
          hint={
            kcal100
              ? `Dieses Lebensmittel hat ${formatGermanNumber(kcal100, 1)} kcal je 100 ${basisUnit}.`
              : undefined
          }
          error={
            errorField === 'kcalPerUnit' && !resolved.ok ? resolved.error : null
          }
        >
          <Input
            id="portionKcal"
            type="text"
            inputMode="decimal"
            value={draft.kcalPerUnit}
            aria-invalid={errorField === 'kcalPerUnit'}
            onChange={(event) => set({ kcalPerUnit: event.target.value })}
            placeholder="z. B. 90"
          />
        </Field>
      ) : null}

      {touched ? (
        resolved.ok ? (
          <p className="num rounded-control border border-line bg-bg-sunken p-3 text-sm text-fg">
            1 {unitName} = {formatGermanNumber(resolved.grams, 2)} {basisUnit}
          </p>
        ) : (
          <div className="rounded-control border border-danger/40 bg-danger-tint p-3">
            <FieldError>{resolved.error}</FieldError>
          </div>
        )
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          onClick={submit}
          disabled={!resolved.ok || nameMissing}
          className="flex-1"
        >
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
        ) : null}
      </div>
    </div>
  );
}
