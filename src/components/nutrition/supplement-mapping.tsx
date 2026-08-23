'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Disclosure } from '@/components/ui/disclosure';
import { Field, Input, Select } from '@/components/ui/field';
import { NUTRIENT_KEYS, NUTRIENT_META, type NutrientKey } from '@/lib/nutrients';
import { formatGermanNumber } from '@/lib/nutrition';
import {
  removeMedicationNutrient,
  setMedicationNutrient,
} from '@/actions/nutrition';

/**
 * Which preparation carries which nutrient.
 *
 * THE AMOUNT IS ALWAYS PER PIECE, and the hint says so, because the whole
 * convention rests on it: one drop, one capsule, one tablet. The schedule then
 * has to be in pieces too, which the action enforces — that is what lets a
 * single row describe a combination product without a unit discriminator.
 *
 * `iu` is offered because that is what vitamin D labels print. It is refused
 * for vitamin E, where the natural and synthetic forms differ by half and the
 * package does not always say which; the action returns the reason.
 */

const UNITS: { value: string; label: string }[] = [
  { value: 'ug', label: 'µg' },
  { value: 'mg', label: 'mg' },
  { value: 'g', label: 'g' },
  { value: 'iu', label: 'IE' },
];

/** Only the nutrients a preparation plausibly carries. */
const OFFERED: NutrientKey[] = NUTRIENT_KEYS.filter((key) => {
  const group = NUTRIENT_META[key].group;
  return group === 'vitamin' || group === 'mineral' || key === 'epaDha';
});

export type SupplementCandidate = {
  id: string;
  name: string;
  mapped: { nutrientKey: NutrientKey; amountPerPiece: number; unit: string }[];
};

export function SupplementMapping({
  candidates,
}: {
  candidates: SupplementCandidate[];
}) {
  if (candidates.length === 0) {
    return (
      <p className="text-xs text-muted">
        Sobald ein Präparat in der Medikationsliste steht, kann es hier einem
        Nährstoff zugeordnet werden.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {candidates.map((candidate) => (
        <CandidateRow key={candidate.id} candidate={candidate} />
      ))}
    </div>
  );
}

function CandidateRow({ candidate }: { candidate: SupplementCandidate }) {
  const [nutrientKey, setNutrientKey] = useState<NutrientKey>('vitD');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState('iu');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await setMedicationNutrient({
        medicationId: candidate.id,
        nutrientKey,
        amountPerPiece: amount,
        unit,
      });
      if (result.ok) {
        setAmount('');
        toast.success('Zuordnung gespeichert');
      } else {
        setError(result.error);
      }
    });
  }

  function remove(key: NutrientKey) {
    startTransition(async () => {
      const result = await removeMedicationNutrient({
        medicationId: candidate.id,
        nutrientKey: key,
      });
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="border-t border-line-soft pt-2 first:border-t-0 first:pt-0">
      <p className="text-sm font-medium text-fg">{candidate.name}</p>

      {candidate.mapped.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {candidate.mapped.map((entry) => (
            <li
              key={entry.nutrientKey}
              className="flex items-center justify-between gap-2 text-xs text-muted"
            >
              <span>
                {NUTRIENT_META[entry.nutrientKey].labelDe}{' '}
                <span className="num">
                  {formatGermanNumber(entry.amountPerPiece, 3)}
                </span>{' '}
                {UNITS.find((u) => u.value === entry.unit)?.label ?? entry.unit} je
                Stück
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(entry.nutrientKey)}
                aria-label={`${NUTRIENT_META[entry.nutrientKey].labelDe} entfernen`}
                className="tap rounded-control p-1 text-muted hover:text-danger"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Disclosure label="Nährstoff zuordnen" className="mt-1">
        <Field
          label="Gehalt je Stück"
          error={error}
          hint="Pro Tropfen, Kapsel oder Tablette. Die Dosis im Medikationsplan muss dann in Stück erfasst sein."
        >
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label="Nährstoff"
              value={nutrientKey}
              onChange={(event) =>
                setNutrientKey(event.target.value as NutrientKey)
              }
              className="flex-1 basis-40"
            >
              {OFFERED.map((key) => (
                <option key={key} value={key}>
                  {NUTRIENT_META[key].labelDe}
                </option>
              ))}
            </Select>
            <Input
              aria-label="Menge je Stück"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="flex-1 basis-24"
              aria-invalid={error !== null}
            />
            <Select
              aria-label="Einheit"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              className="basis-24"
            >
              {UNITS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || amount.trim() === ''}
              onClick={add}
            >
              Speichern
            </Button>
          </div>
        </Field>
      </Disclosure>
    </div>
  );
}
