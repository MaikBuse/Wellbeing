'use client';

import { useState, useTransition } from 'react';
import { CopyPlus, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  copyMealFromYesterday,
  deleteMealItem,
  updateMealItem,
} from '@/actions/meals';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardMeta, CardTitle } from '@/components/ui/card';
import { Disclosure } from '@/components/ui/disclosure';
import { Input } from '@/components/ui/field';
import { FoodPicker } from '@/components/food-picker/food-picker';
import {
  ReactionSheet,
  type SymptomTypeOption,
} from '@/components/symptom/reaction-sheet';
import type { DayMeal } from '@/db/queries/day';
import type { FoodListItem } from '@/db/queries/foods';
import { formatGermanNumber, formatKcal, sumNutrients } from '@/lib/nutrition';
import {
  MEAL_SLOT_LABELS,
  ONSET_LAG_LABELS,
  severityToken,
  type MealSlotKey,
  type OnsetLagKey,
} from '@/lib/scales';
import { formatTime } from '@/lib/time';
import { cn } from '@/lib/utils';

const RAMP: Record<string, string> = {
  'sev-0': 'bg-sev-0 text-fg',
  'sev-1': 'bg-sev-1 text-fg',
  'sev-2': 'bg-sev-2 text-primary-fg',
  'sev-3': 'bg-sev-3 text-primary-fg',
  'sev-4': 'bg-sev-4 text-white',
};

export function MealSlotCard({
  slot,
  logDate,
  meals,
  frequent,
  recent,
  symptomTypes,
  defaultLags,
  compact = false,
  showEmptyHint = false,
  readOnly = false,
}: {
  slot: MealSlotKey;
  logDate: string;
  meals: DayMeal[];
  frequent: FoodListItem[];
  recent: FoodListItem[];
  symptomTypes: SymptomTypeOption[];
  /** Per meal, the lag bucket implied by the time since it was eaten. */
  defaultLags: Record<string, OnsetLagKey>;
  /** Stay collapsed while empty — used for snacks and drinks. */
  compact?: boolean;
  showEmptyHint?: boolean;
  readOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const items = meals.flatMap((meal) => meal.items);
  const totals = sumNutrients(
    items.map((item) => ({
      kcal: item.kcal,
      proteinG: item.proteinG,
      fatG: item.fatG,
      satFatG: null,
      carbsG: item.carbsG,
      sugarG: null,
      fiberG: null,
      saltG: null,
    }))
  );

  const collapsed = compact && items.length === 0 && !expanded;

  function copyYesterday() {
    startTransition(async () => {
      const result = await copyMealFromYesterday({
        slot,
        targetLogDate: logDate,
      });
      if (result.ok) toast.success('Von gestern übernommen');
      else toast.error(result.error);
    });
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="tap flex w-full items-center gap-2 rounded-card border border-dashed border-line px-4 py-3 text-left text-base font-medium text-muted hover:bg-soft"
      >
        <Plus aria-hidden className="size-4" />
        {MEAL_SLOT_LABELS[slot]} hinzufügen
      </button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{MEAL_SLOT_LABELS[slot]}</CardTitle>
          {items.length > 0 ? (
            <CardMeta>
              {items.length} {items.length === 1 ? 'Eintrag' : 'Einträge'} ·{' '}
              {formatKcal(totals.kcal)} (geschätzt)
            </CardMeta>
          ) : null}
        </div>
        {!readOnly && items.length === 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={copyYesterday}
            disabled={pending}
            title="Denselben Slot von gestern übernehmen"
          >
            {pending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <CopyPlus aria-hidden className="size-4" />
            )}
            Wie gestern
          </Button>
        ) : null}
      </CardHeader>

      {meals.map((meal) => (
        <div key={meal.id} className="mb-3 space-y-2">
          {meals.length > 1 ? (
            <p className="text-xs text-muted">
              {formatTime(new Date(meal.occurredAt))}
            </p>
          ) : null}

          <ul className="divide-y divide-line">
            {meal.items.map((item) => (
              <MealItemRow key={item.id} item={item} readOnly={readOnly} />
            ))}
          </ul>

          {meal.reactions.length > 0 ? (
            <ul className="space-y-1.5">
              {meal.reactions.map((reaction) => (
                <li
                  key={reaction.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl bg-soft/60 px-3 py-2 text-sm"
                >
                  <span
                    className={cn(
                      'inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                      RAMP[severityToken(reaction.severity)]
                    )}
                  >
                    {reaction.severity}
                  </span>
                  <span className="text-fg">
                    {reaction.symptoms.length > 0
                      ? reaction.symptoms.join(', ')
                      : 'Reaktion'}
                  </span>
                  {reaction.onsetLag ? (
                    <span className="text-muted">
                      ·{' '}
                      {ONSET_LAG_LABELS[reaction.onsetLag as OnsetLagKey] ??
                        reaction.onsetLag}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {!readOnly && meal.items.length > 0 ? (
            <Disclosure label="Reaktion erfassen">
              <ReactionSheet
                mealId={meal.id}
                defaultLag={defaultLags[meal.id] ?? null}
                symptomTypes={symptomTypes}
              />
            </Disclosure>
          ) : null}
        </div>
      ))}

      {!readOnly ? (
        <FoodPicker
          slot={slot}
          logDate={logDate}
          frequent={frequent}
          recent={recent}
          showEmptyHint={showEmptyHint}
        />
      ) : items.length === 0 ? (
        <CardMeta>Nichts erfasst.</CardMeta>
      ) : null}
    </Card>
  );
}

function MealItemRow({
  item,
  readOnly,
}: {
  item: DayMeal['items'][number];
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(
    formatGermanNumber(item.quantity, 2)
  );
  const [pending, startTransition] = useTransition();

  function save() {
    const formData = new FormData();
    formData.set('mealItemId', item.id);
    formData.set('quantity', quantity);
    formData.set('unit', item.unit);
    startTransition(async () => {
      const result = await updateMealItem(formData);
      if (result.ok) {
        setEditing(false);
        toast.success('Menge angepasst');
      } else toast.error(result.error);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteMealItem(item.id);
      if (result.ok) toast.success('Entfernt');
      else toast.error(result.error);
    });
  }

  return (
    <li className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base text-fg">{item.foodName}</p>
        <p className="text-xs text-muted">
          {Math.round(item.grams)} g · {formatKcal(item.kcal)}
        </p>
      </div>

      {readOnly ? null : editing ? (
        <div className="flex items-center gap-2">
          <Input
            type="text"
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="w-20 text-center"
            aria-label="Menge"
          />
          <Button size="sm" onClick={save} disabled={pending}>
            OK
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            aria-label={`Menge von ${item.foodName} anpassen`}
          >
            Menge
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={remove}
            disabled={pending}
            aria-label={`${item.foodName} entfernen`}
          >
            <Trash2 aria-hidden className="size-4 text-muted" />
          </Button>
        </div>
      )}
    </li>
  );
}
