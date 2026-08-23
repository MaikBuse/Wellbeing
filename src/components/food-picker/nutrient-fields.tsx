'use client';

import { Chip, ChipRow } from '@/components/ui/chip';
import { Field, FieldError, Input } from '@/components/ui/field';
import { SectionLabel } from '@/components/ui/section-label';
import { formatGermanNumber, parseGermanNumber, type Per100 } from '@/lib/nutrition';
import {
  NUTRIENT_FIELDS,
  NUTRIENT_LABELS,
  resolveNutrientBasis,
  type NutrientBasisKind,
  type NutrientBasisResolution,
  type NutrientField,
} from '@/lib/validation/food';

/** Everything the nutrient fieldset holds, as the strings the inputs hold. */
export type NutrientDraft = Record<NutrientField, string> & {
  basisKind: NutrientBasisKind;
  basisAmount: string;
};

export const EMPTY_NUTRIENT_DRAFT: NutrientDraft = {
  kcal100: '',
  protein100: '',
  fat100: '',
  satFat100: '',
  carbs100: '',
  sugar100: '',
  fiber100: '',
  salt100: '',
  basisKind: 'per100',
  basisAmount: '',
};

/**
 * Prefill from a stored food.
 *
 * Always on the per-100 basis, because that is the only basis the row records —
 * the reference amount is an input aid and is not persisted. So a food entered
 * per piece comes back per 100, which is honest: those per-100 numbers are what
 * every screen and the whole analysis actually use.
 */
export function nutrientDraftFrom(food: Per100): NutrientDraft {
  const draft = { ...EMPTY_NUTRIENT_DRAFT };
  for (const field of NUTRIENT_FIELDS) {
    draft[field] = formatGermanNumber(food[field], 2);
  }
  return draft;
}

export function draftValues(draft: NutrientDraft): Per100 {
  const values = {} as Per100;
  for (const field of NUTRIENT_FIELDS) {
    values[field] = parseGermanNumber(draft[field]);
  }
  return values;
}

export function resolveDraft(
  draft: NutrientDraft,
  unit: 'g' | 'ml',
  portionGrams: number | null
): NutrientBasisResolution {
  return resolveNutrientBasis({
    values: draftValues(draft),
    kind: draft.basisKind,
    basisAmount: parseGermanNumber(draft.basisAmount),
    portionGrams,
    unit,
  });
}

export function basisLabel(
  draft: NutrientDraft,
  unit: 'g' | 'ml',
  portionGrams: number | null
): string {
  switch (draft.basisKind) {
    case 'unit':
      return `je 1 ${unit}`;
    case 'per100':
      return `je 100 ${unit}`;
    case 'portion':
      return portionGrams === null
        ? 'je 1 Portion'
        : `je 1 Portion (${formatGermanNumber(portionGrams, 1)} ${unit})`;
    case 'custom': {
      const amount = parseGermanNumber(draft.basisAmount);
      return amount === null ? `je … ${unit}` : `je ${formatGermanNumber(amount, 2)} ${unit}`;
    }
  }
}

const BASIS_ORDER: NutrientBasisKind[] = ['unit', 'per100', 'portion', 'custom'];

function chipLabel(kind: NutrientBasisKind, unit: 'g' | 'ml'): string {
  if (kind === 'unit') return `1 ${unit}`;
  if (kind === 'per100') return `100 ${unit}`;
  if (kind === 'portion') return '1 Portion';
  return 'eigene Menge';
}

const UNIT_SUFFIX: Record<NutrientField, string> = {
  kcal100: 'kcal',
  protein100: 'g',
  fat100: 'g',
  satFat100: 'g',
  carbs100: 'g',
  sugar100: 'g',
  fiber100: 'g',
  salt100: 'g',
};

/**
 * The nutrient fieldset, shared by anlegen and bearbeiten.
 *
 * One component for both so the two cannot drift, which has already happened
 * once in this project: the create form never offered saturated fat at all, so
 * the column stayed null for every manually entered food while OFF and the BLS
 * filled it.
 *
 * Fully controlled. The parent owns the draft, which is what makes it survive a
 * collapsed `Disclosure` — that component unmounts its children.
 */
export function NutrientFields({
  draft,
  onChange,
  unit,
  portionGrams,
  portionSlot,
  disabled = false,
}: {
  draft: NutrientDraft;
  onChange: (next: NutrientDraft) => void;
  unit: 'g' | 'ml';
  /** The food's portion weight — the only anchor the "1 Portion" basis has. */
  portionGrams: number | null;
  /** Where the portion weight is editable, the field itself goes here. */
  portionSlot?: React.ReactNode;
  disabled?: boolean;
}) {
  const set = (patch: Partial<NutrientDraft>) => onChange({ ...draft, ...patch });
  const resolved = resolveDraft(draft, unit, portionGrams);
  const anyEntered = NUTRIENT_FIELDS.some((field) => draft[field].trim() !== '');
  const errorField = resolved.ok ? null : resolved.field;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SectionLabel>Die Werte auf der Verpackung gelten für</SectionLabel>
        <ChipRow>
          {BASIS_ORDER.map((kind) => (
            <Chip
              key={kind}
              selected={draft.basisKind === kind}
              disabled={disabled}
              onClick={() => set({ basisKind: kind })}
            >
              {chipLabel(kind, unit)}
            </Chip>
          ))}
        </ChipRow>
        <p className="text-xs text-muted">
          Gespeichert wird immer je 100 {unit} – die Umrechnung passiert beim
          Speichern.
        </p>
      </div>

      {draft.basisKind === 'custom' ? (
        <Field
          label={`Bezugsmenge (${unit})`}
          htmlFor="basisAmount"
          hint="Die Menge, für die die Angaben auf der Verpackung gelten."
          error={errorField === 'basisAmount' && !resolved.ok ? resolved.error : null}
        >
          <Input
            id="basisAmount"
            type="text"
            inputMode="decimal"
            value={draft.basisAmount}
            disabled={disabled}
            aria-invalid={errorField === 'basisAmount'}
            onChange={(event) => set({ basisAmount: event.target.value })}
            placeholder={`z. B. 330`}
          />
        </Field>
      ) : null}

      {portionSlot ?? null}

      {portionSlot === undefined &&
      draft.basisKind === 'portion' &&
      portionGrams === null ? (
        <FieldError>
          Für „je 1 Portion“ fehlt das Portionsgewicht. Es wird unter
          „Einheiten“ gepflegt, weil daran auch die Menge jeder künftig
          erfassten Portion hängt.
        </FieldError>
      ) : null}

      <div className="space-y-3">
        {NUTRIENT_FIELDS.map((field) => (
          <Field
            key={field}
            label={`${NUTRIENT_LABELS[field]} (${UNIT_SUFFIX[field]})`}
            htmlFor={field}
            error={errorField === field && !resolved.ok ? resolved.error : null}
          >
            <Input
              id={field}
              type="text"
              inputMode="decimal"
              value={draft[field]}
              disabled={disabled}
              aria-invalid={errorField === field}
              onChange={(event) => set({ [field]: event.target.value } as Partial<NutrientDraft>)}
              placeholder="optional"
            />
          </Field>
        ))}
      </div>

      {anyEntered && draft.basisKind !== 'per100' ? (
        <NutrientPreview resolved={resolved} unit={unit} />
      ) : null}
    </div>
  );
}

/**
 * What will actually be stored.
 *
 * Not optional garnish: without it the conversion is magic — you type 3,5 and
 * find 350 in the row later. It calls the same function the action calls, and it
 * prints two decimals rather than going through `formatKcal`/`formatGrams`,
 * which round to tens and to whole grams. A preview that cannot distinguish
 * 366,67 from 374 verifies nothing.
 */
function NutrientPreview({
  resolved,
  unit,
}: {
  resolved: NutrientBasisResolution;
  unit: 'g' | 'ml';
}) {
  if (!resolved.ok) {
    return (
      <div className="rounded-control border border-danger/40 bg-danger-tint p-3">
        <FieldError>{resolved.error}</FieldError>
      </div>
    );
  }

  const rows = NUTRIENT_FIELDS.filter((field) => resolved.values[field] !== null);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-control border border-line bg-bg-sunken p-3">
      <SectionLabel>Wird gespeichert als je 100 {unit}</SectionLabel>
      <dl className="mt-2 divide-y divide-line-soft">
        {rows.map((field) => (
          <div key={field} className="flex justify-between py-1 text-sm">
            <dt className="text-muted">{NUTRIENT_LABELS[field]}</dt>
            <dd className="num text-fg">
              {formatGermanNumber(resolved.values[field], 2)}{' '}
              {UNIT_SUFFIX[field]}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
