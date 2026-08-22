'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createMedication } from '@/actions/medication';
import { Button } from '@/components/ui/button';
import { Card, CardMeta } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import {
  DOSE_UNIT_LABELS,
  MED_CATEGORY_LABELS,
  MED_FORM_LABELS,
  SCHEDULE_KIND_LABELS,
  WEEKDAY_LABELS,
} from '@/lib/scales';
import { todayLogDate } from '@/lib/time';

export function MedicationForm() {
  const router = useRouter();
  const [kind, setKind] = useState<
    'daily' | 'weekly' | 'interval_days' | 'as_needed'
  >('daily');
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await createMedication(formData);
      if (result.ok) {
        toast.success('Medikament angelegt');
        router.push('/medications');
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <Card className="space-y-4">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" required autoComplete="off" />
        </Field>
        <Field label="Wirkstoff" htmlFor="activeSubstance">
          <Input
            id="activeSubstance"
            name="activeSubstance"
            placeholder="z. B. Methotrexat"
            autoComplete="off"
          />
        </Field>
        <Field label="Form" htmlFor="form">
          <Select id="form" name="form" defaultValue="tablet">
            {Object.entries(MED_FORM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Art"
          htmlFor="category"
          hint="Kortison wird in der Auswertung eigens berücksichtigt, weil es Beschwerden direkt dämpft."
        >
          <Select id="category" name="category" defaultValue="other">
            {Object.entries(MED_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="space-y-4">
        <Field label="Einnahme" htmlFor="scheduleKind">
          <Select
            id="scheduleKind"
            name="scheduleKind"
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            {Object.entries(SCHEDULE_KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {kind === 'weekly' ? (
          <Field label="Wochentag" htmlFor="weekday">
            <Select id="weekday" name="weekday" defaultValue="2">
              {WEEKDAY_LABELS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {kind === 'interval_days' ? (
          <>
            <Field label="Alle wie viele Tage?" htmlFor="intervalDays">
              <Input
                id="intervalDays"
                name="intervalDays"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                defaultValue={14}
              />
            </Field>
            <Field
              label="Erste Einnahme"
              htmlFor="anchorDate"
              hint="Ab diesem Tag wird das Intervall gerechnet."
            >
              <Input
                id="anchorDate"
                name="anchorDate"
                type="date"
                defaultValue={todayLogDate()}
              />
            </Field>
          </>
        ) : null}

        {kind !== 'as_needed' ? (
          <Field label="Uhrzeit" htmlFor="timeOfDay">
            <Input
              id="timeOfDay"
              name="timeOfDay"
              type="time"
              defaultValue="08:00"
            />
          </Field>
        ) : (
          <input type="hidden" name="timeOfDay" value="12:00" />
        )}

        <div className="flex gap-2">
          <Field label="Dosis" htmlFor="doseAmount" className="flex-1">
            <Input
              id="doseAmount"
              name="doseAmount"
              type="text"
              inputMode="decimal"
              required
              placeholder="z. B. 15"
            />
          </Field>
          <Field label="Einheit" htmlFor="doseUnit" className="w-28">
            <Select id="doseUnit" name="doseUnit" defaultValue="mg">
              {Object.entries(DOSE_UNIT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <CardMeta>
          Dosisänderungen später bitte über „Dosis ändern“ eintragen, nicht hier
          überschreiben – die alte Dosis bleibt sonst nicht als Zeitraum
          erhalten.
        </CardMeta>
      </Card>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : null}
        Speichern
      </Button>
    </form>
  );
}
