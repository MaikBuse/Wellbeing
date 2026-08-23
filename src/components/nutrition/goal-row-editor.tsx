'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { NUTRIENT_META, UNIT_LABEL, type NutrientKey } from '@/lib/nutrients';
import {
  clearTargetOverride,
  setTargetOverride,
} from '@/actions/nutrition';

/**
 * Override one target, or go back to the derived value.
 *
 * The only client island on the goal list. The direction is deliberately not
 * editable — it belongs to the catalogue, so an override can move the number
 * but cannot turn a minimum into a limit.
 *
 * A range target gets two fields, and it needs them: writing a single value
 * into `min` nulls `bandMax` in `deriveTargets`, and `formatTarget` then falls
 * through to "mindestens 65 g" for something the catalogue still calls a range.
 * A doctor's protein ceiling was not enterable at all.
 *
 * The derived value is printed inside the reset button rather than beside it,
 * so it is obvious where "back" leads.
 */
export function GoalRowEditor({
  nutrientKey,
  direction,
  derivedText,
  overridden,
  unavailable,
}: {
  nutrientKey: NutrientKey;
  /** From the catalogue, never from the user: an override moves the number. */
  direction: 'min' | 'max' | 'range';
  derivedText: string;
  overridden: boolean;
  unavailable: boolean;
}) {
  const [value, setValue] = useState('');
  const [upper, setUpper] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const meta = NUTRIENT_META[nutrientKey];
  const unit = UNIT_LABEL[meta.unit];
  const isLimit = direction === 'max';
  const isRange = direction === 'range';
  const incomplete =
    value.trim() === '' || (isRange && upper.trim() === '');

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await setTargetOverride({
        nutrientKey,
        min: isLimit ? null : value,
        max: isLimit ? value : isRange ? upper : null,
      });
      if (result.ok) {
        setValue('');
        setUpper('');
        toast.success('Zielwert gespeichert');
      } else {
        setError(result.error);
      }
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await clearTargetOverride({ nutrientKey });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="space-y-2 border-t border-line-soft pt-2">
      <Field
        label={isRange ? 'Eigener Zielbereich' : 'Eigener Zielwert'}
        htmlFor={`override-${nutrientKey}`}
        error={error}
        hint={
          unavailable
            ? 'Ohne abgeleiteten Wert kannst du hier trotzdem einen eigenen setzen.'
            : undefined
        }
      >
        <div className="flex gap-2">
          <Input
            id={`override-${nutrientKey}`}
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={isRange ? `von ${unit}` : unit}
            aria-label={isRange ? `Unterer Wert in ${unit}` : undefined}
            aria-invalid={error !== null}
          />
          {isRange ? (
            <Input
              inputMode="decimal"
              value={upper}
              onChange={(event) => setUpper(event.target.value)}
              placeholder={`bis ${unit}`}
              aria-label={`Oberer Wert in ${unit}`}
              aria-invalid={error !== null}
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || incomplete}
            onClick={save}
          >
            Übernehmen
          </Button>
        </div>
      </Field>

      {overridden ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={reset}
          >
            Auf abgeleiteten Wert zurücksetzen ({derivedText})
          </Button>
          <p className="text-xs text-muted">
            Selbst gesetzte Werte werden bei Änderungen am Profil nicht mehr
            angepasst.
          </p>
        </>
      ) : null}
    </div>
  );
}
