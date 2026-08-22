'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createSymptomEntry } from '@/actions/symptoms';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Field, Textarea } from '@/components/ui/field';
import { ScoreChips } from '@/components/ui/score-chips';
import {
  ONSET_LAG_LABELS,
  ONSET_LAG_ORDER,
  SYMPTOM_GROUP_LABELS,
  SYMPTOM_GROUP_ORDER,
  type OnsetLagKey,
} from '@/lib/scales';
import { RED_FLAG_NOTICE } from '@/db/seed/symptomTypes';
import { SectionLabel } from '@/components/ui/section-label';

export type SymptomTypeOption = {
  id: string;
  key: string;
  labelDe: string;
  groupKey: string;
  isRedFlag: boolean;
};

/**
 * Reaction entry: severity, symptoms, lag. Three taps plus save.
 *
 * The lag chip is pre-selected from the time elapsed since the meal, because
 * the lag bucket IS the analysis window and a wrong default would quietly
 * corrupt the statistics. That default is computed on the server and passed in
 * — reading the clock during render is impure.
 */
export function ReactionSheet({
  mealId,
  defaultLag = null,
  symptomTypes,
  onDone,
}: {
  mealId: string | null;
  defaultLag?: OnsetLagKey | null;
  symptomTypes: SymptomTypeOption[];
  onDone?: () => void;
}) {
  const [severity, setSeverity] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [lag, setLag] = useState<OnsetLagKey | null>(defaultLag);
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  const redFlagSelected = symptomTypes.some(
    (type) => type.isRedFlag && selected.includes(type.id)
  );

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  }

  function save() {
    if (severity === null) {
      toast.error('Bitte angeben, wie stark es war');
      return;
    }
    if (mealId && !lag) {
      toast.error('Bitte angeben, wann die Reaktion aufgetreten ist');
      return;
    }
    startTransition(async () => {
      const result = await createSymptomEntry({
        mealId,
        severity,
        onsetLag: lag,
        symptomTypeIds: selected,
        note: note.trim() === '' ? null : note.trim(),
      });
      if (result.ok) {
        toast.success('Gespeichert');
        setSeverity(null);
        setSelected([]);
        setNote('');
        onDone?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      <Field label="Wie stark war es?" htmlFor="severity">
        <ScoreChips
          name="severity"
          value={severity}
          onChange={setSeverity}
          labelledBy="severity-label"
        />
      </Field>

      {mealId ? (
        <Field
          label="Wann ging es los?"
          hint="Der Zeitabstand entscheidet später darüber, welches Lebensmittel überhaupt in Frage kommt."
        >
          <ChipRow>
            {ONSET_LAG_ORDER.map((key) => (
              <Chip
                key={key}
                selected={lag === key}
                onClick={() => setLag(key)}
              >
                {ONSET_LAG_LABELS[key]}
              </Chip>
            ))}
          </ChipRow>
        </Field>
      ) : null}

      <Field label="Was genau?">
        <div className="space-y-3">
          {SYMPTOM_GROUP_ORDER.map((group) => {
            const types = symptomTypes.filter((t) => t.groupKey === group);
            if (types.length === 0) return null;
            return (
              <div key={group} className="space-y-1.5">
                <SectionLabel>{SYMPTOM_GROUP_LABELS[group]}</SectionLabel>
                <ChipRow>
                  {types.map((type) => (
                    <Chip
                      key={type.id}
                      selected={selected.includes(type.id)}
                      onClick={() => toggle(type.id)}
                    >
                      {type.labelDe}
                    </Chip>
                  ))}
                </ChipRow>
              </div>
            );
          })}
        </div>
      </Field>

      {redFlagSelected ? (
        <p
          role="alert"
          className="rounded-control border border-danger/40 bg-danger-tint p-3 text-sm font-medium text-danger"
        >
          {RED_FLAG_NOTICE}
        </p>
      ) : null}

      <Field label="Notiz" htmlFor="reaction-note">
        <Textarea
          id="reaction-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional – oft steckt hier das eigentliche Signal."
        />
      </Field>

      <Button onClick={save} disabled={pending} size="lg" className="w-full">
        {pending ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : null}
        Speichern
      </Button>
    </div>
  );
}
