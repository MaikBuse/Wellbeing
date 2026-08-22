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
  SEVERITY_ANCHORS,
  SYMPTOM_GROUP_LABELS,
  SYMPTOM_GROUP_ORDER,
  type OnsetLagKey,
} from '@/lib/scales';
import { RED_FLAG_NOTICE } from '@/db/seed/symptomTypes';
import { SectionLabel } from '@/components/ui/section-label';
import { cn } from '@/lib/utils';

export type SymptomTypeOption = {
  id: string;
  key: string;
  labelDe: string;
  groupKey: string;
  isRedFlag: boolean;
};

/**
 * "Keine" is a step, not a severity. Everything else is a real reaction, so the
 * 0 anchor is dropped from the scale here.
 */
const REACTION_SEVERITIES = SEVERITY_ANCHORS.filter(
  (option) => option.value > 0
);

/**
 * Reaction entry, asked in the order the answers actually arrive.
 *
 * It used to ask "wie stark?" first, then "wann?", then "was?" — which demands a
 * severity before naming what got a severity, and demanded a time even when the
 * answer was "nothing happened". Now: was there anything, what was it, how bad,
 * when did it start. Each step unlocks the next, and a locked step is really
 * disabled rather than merely faded.
 *
 * The lag chip is pre-selected from the time elapsed since the meal, because the
 * lag bucket IS the analysis window and a wrong default would quietly corrupt
 * the statistics. That default is computed on the server and passed in —
 * reading the clock during render is impure.
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
  // Only a meal-bound reaction has a "was there one at all" question: the
  // meal-less form is opened precisely because something happened.
  const [started, setStarted] = useState(mealId === null);
  const [selected, setSelected] = useState<string[]>([]);
  const [severity, setSeverity] = useState<number | null>(null);
  const [lag, setLag] = useState<OnsetLagKey | null>(defaultLag);
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  const redFlagSelected = symptomTypes.some(
    (type) => type.isRedFlag && selected.includes(type.id)
  );
  const hasSymptom = selected.length > 0;
  const canRateSeverity = hasSymptom;
  const canPickLag = hasSymptom && severity !== null;
  const canSave = hasSymptom && severity !== null && (!mealId || lag !== null);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  }

  function reset() {
    setSelected([]);
    setSeverity(null);
    setLag(defaultLag);
    setNote('');
    setStarted(mealId === null);
  }

  function save() {
    startTransition(async () => {
      const result = await createSymptomEntry({
        mealId,
        // canSave gates the button, so these are set by the time we get here.
        severity: severity as number,
        onsetLag: lag,
        symptomTypeIds: selected,
        note: note.trim() === '' ? null : note.trim(),
      });
      if (result.ok) {
        toast.success('Gespeichert');
        reset();
        onDone?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (!started) {
    return (
      <div className="space-y-3">
        <Field label="Gab es eine Reaktion?">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                // Nothing is written. "Keine Reaktion" and "not recorded" are
                // therefore indistinguishable in the data — a deliberate call,
                // and one worth revisiting when the analysis needs negative
                // observations.
                onDone?.();
              }}
            >
              Keine
            </Button>
            <Button onClick={() => setStarted(true)}>Ja, erfassen</Button>
          </div>
        </Field>
      </div>
    );
  }

  return (
    <div className="space-y-5">
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

      <Field
        label="Wie stark war es?"
        hint={canRateSeverity ? undefined : 'Erst auswählen, was es war.'}
      >
        <ScoreChips
          name="severity"
          value={severity}
          onChange={setSeverity}
          options={REACTION_SEVERITIES}
          disabled={!canRateSeverity}
        />
      </Field>

      {mealId ? (
        <Field
          label="Wann ging es los?"
          hint={
            canPickLag
              ? 'Der Zeitabstand entscheidet später darüber, welches Lebensmittel überhaupt in Frage kommt.'
              : 'Erst die Stärke angeben.'
          }
        >
          <ChipRow className={cn(!canPickLag && 'opacity-50')}>
            {ONSET_LAG_ORDER.map((key) => (
              <Chip
                key={key}
                selected={lag === key}
                disabled={!canPickLag}
                onClick={() => setLag(lag === key ? null : key)}
              >
                {ONSET_LAG_LABELS[key]}
              </Chip>
            ))}
          </ChipRow>
        </Field>
      ) : null}

      <Field label="Notiz" htmlFor="reaction-note">
        <Textarea
          id="reaction-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional – oft steckt hier das eigentliche Signal."
        />
      </Field>

      <Button
        onClick={save}
        disabled={pending || !canSave}
        size="lg"
        className="w-full"
      >
        {pending ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : null}
        Speichern
      </Button>
    </div>
  );
}
