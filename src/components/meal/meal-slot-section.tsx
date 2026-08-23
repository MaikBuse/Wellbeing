'use client';

import { useState, useTransition } from 'react';
import { CopyPlus, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  copyMealFromYesterday,
  deleteMealItem,
  setMealTime,
  updateMealItem,
} from '@/actions/meals';
import { Button } from '@/components/ui/button';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Input } from '@/components/ui/field';
import { FoodPicker } from '@/components/food-picker/food-picker';
import { ReactionDisclosure } from '@/components/symptom/reaction-disclosure';
import type { SymptomTypeOption } from '@/components/symptom/reaction-sheet';
import { SymptomEntryRow } from '@/components/symptom/symptom-entry-row';
import type { DayMeal } from '@/db/queries/day';
import type { FoodListItem } from '@/db/queries/foods';
import {
  formatGermanNumber,
  formatKcal,
  parseGermanNumber,
  resolveGrams,
  sumNutrients,
} from '@/lib/nutrition';
import {
  MEAL_SLOT_LABELS,
  type MealSlotKey,
  type OnsetLagKey,
} from '@/lib/scales';
import { cn } from '@/lib/utils';

/**
 * One meal slot as a station on the day's timeline.
 *
 * This replaces the card-per-slot layout: five bordered boxes in a vertical
 * stack gave every slot the same visual weight and left the screen with no
 * rhythm. The rail carries the sequence instead, and the entries sit on it as
 * plain rows.
 *
 * Behaviour is unchanged — the three-tap quick-add path, "Wie gestern", the
 * inline amount editor, several meals per slot, reactions and the food picker
 * all work exactly as before.
 */
export function MealSlotSection({
  slot,
  logDate,
  meals,
  frequent,
  recent,
  symptomTypes,
  defaultLags,
  times,
  reactionTimes,
  index = 0,
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
  /** Per meal, its 'HH:MM' in the user's zone. Formatted on the server, because
   * formatTime on the client would fall back to the module default zone. */
  times: Record<string, string>;
  /** Per reaction, its 'HH:MM' in the user's zone. Same reason as `times`. */
  reactionTimes: Record<string, string>;
  /** Position on the rail, used only for the entrance stagger. */
  index?: number;
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
  const filled = items.length > 0;
  // Several meals in one slot each keep their own time; a single meal shows its
  // time on the slot heading instead of on a sub-heading of its own.
  const singleMeal = meals.length === 1 ? meals[0] : null;

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

  return (
    <li
      className="reveal relative border-l border-line-strong pb-5 pl-5 last:border-transparent last:pb-0"
      style={{ '--i': index } as React.CSSProperties}
    >
      {/* The node sits centred on the 1px rail, with a ring of page colour so
       * the line appears to pass behind it. */}
      <span
        aria-hidden
        className={cn(
          'absolute -left-[5.5px] top-1.5 size-2.5 rounded-pill ring-4 ring-bg',
          filled ? 'bg-primary' : 'bg-line-strong'
        )}
      />

      {collapsed ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="tap -my-1 flex w-full items-center gap-2 rounded-control px-1 text-left text-base font-medium text-muted transition-colors duration-120 hover:bg-primary-tint hover:text-fg"
        >
          <Plus aria-hidden className="size-4" />
          {MEAL_SLOT_LABELS[slot]} hinzufügen
        </button>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-section font-semibold text-fg">
              {MEAL_SLOT_LABELS[slot]}
            </h2>
            <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
              {singleMeal ? (
                <MealTime
                  mealId={singleMeal.id}
                  logDate={logDate}
                  time={times[singleMeal.id] ?? ''}
                  readOnly={readOnly}
                />
              ) : null}
              {filled ? (
                <span className="num font-medium text-fg">
                  {formatKcal(totals.kcal)}
                </span>
              ) : null}
              {!readOnly && !filled ? (
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
            </div>
          </div>

          {meals.map((meal) => (
            <div key={meal.id} className="mt-2 space-y-2">
              {meals.length > 1 ? (
                <p className="text-xs text-muted">
                  <MealTime
                    mealId={meal.id}
                    logDate={logDate}
                    time={times[meal.id] ?? ''}
                    readOnly={readOnly}
                  />
                </p>
              ) : null}

              {meal.items.length > 0 ? (
                <ul className="divide-y divide-line-soft">
                  {meal.items.map((item, row) => (
                    <MealItemRow
                      key={item.id}
                      item={item}
                      index={row}
                      readOnly={readOnly}
                    />
                  ))}
                </ul>
              ) : null}

              {meal.reactions.length > 0 ? (
                <ul className="space-y-1.5">
                  {meal.reactions.map((reaction, row) => (
                    <SymptomEntryRow
                      key={reaction.id}
                      entry={reaction}
                      time={reactionTimes[reaction.id] ?? ''}
                      fallbackLabel="Reaktion"
                      index={row}
                      className="bg-soft/50"
                      readOnly={readOnly}
                    />
                  ))}
                </ul>
              ) : null}

              {!readOnly && meal.items.length > 0 ? (
                <ReactionDisclosure
                  label="Reaktion erfassen"
                  mealId={meal.id}
                  defaultLag={defaultLags[meal.id] ?? null}
                  symptomTypes={symptomTypes}
                />
              ) : null}
            </div>
          ))}

          {!readOnly ? (
            <div className="mt-3">
              <FoodPicker
                slot={slot}
                logDate={logDate}
                frequent={frequent}
                recent={recent}
                showEmptyHint={showEmptyHint}
              />
            </div>
          ) : items.length === 0 ? (
            <p className="mt-1 text-sm text-muted">Nichts erfasst.</p>
          ) : null}
        </>
      )}
    </li>
  );
}

/**
 * The meal's time, and the way to correct it.
 *
 * Quick-add can only ever guess: the clock for today, a typical hour for any
 * other day. The guess is therefore always one tap away from being fixed, right
 * where it is displayed — this used to be a plain label with no way to change it
 * at all.
 */
function MealTime({
  mealId,
  logDate,
  time,
  readOnly,
}: {
  mealId: string;
  logDate: string;
  time: string;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(time);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await setMealTime({ mealId, timeOfDay: value });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setEditing(false);
      // Crossing the day boundary moves the meal off this screen, so say so
      // rather than letting it seem to vanish.
      toast.success(
        result.logDate === logDate
          ? 'Uhrzeit geändert'
          : 'Uhrzeit geändert – die Mahlzeit liegt jetzt auf einem anderen Tag'
      );
    });
  }

  if (readOnly) return <span className="num">{time}</span>;

  if (!editing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        // min-h-11 keeps the 44px floor: in a filled slot this is the only tap
        // target in its row, so size="sm" alone would be too small.
        className="num min-h-11 text-xs text-muted"
        onClick={() => {
          setValue(time);
          setEditing(true);
        }}
        aria-label={`Uhrzeit ${time} ändern`}
      >
        {time}
      </Button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Input
        type="time"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="w-32"
        aria-label="Uhrzeit"
      />
      <Button size="sm" onClick={save} disabled={pending}>
        OK
      </Button>
    </span>
  );
}

/**
 * One unit the amount can be counted in.
 *
 * `key` exists because a chip is identified by more than its portion id: the
 * gram chip has none, and neither does the fallback that leans on the food's own
 * `defaultPortionGrams`.
 */
type UnitChoice = {
  key: string;
  label: string;
  unit: 'g' | 'ml' | 'piece' | 'portion';
  portionId: string | null;
  /** What one of it weighs, for the chip's own caption. Null for g/ml. */
  grams: number | null;
};

/**
 * The units this item can be logged in.
 *
 * The `piece` enum value is deliberately not produced here. `resolveGrams`
 * treats it exactly like `portion`, and a unit called „Stück" is a
 * `food_portion` row — giving it a second home in the enum would be two
 * truths for one thing.
 */
function unitChoices(item: DayMeal['items'][number]): UnitChoice[] {
  const choices: UnitChoice[] = item.portions.map((portion) => ({
    key: `portion:${portion.id}`,
    label: portion.labelDe,
    unit: 'portion' as const,
    portionId: portion.id,
    grams: portion.grams,
  }));

  // A food with no named measure still has the nameless weight the create form
  // writes. Offering it keeps the chip row from being a single gram button on
  // every food nobody has maintained yet.
  if (choices.length === 0) {
    choices.push({
      key: 'default',
      label: 'Portion',
      unit: 'portion',
      portionId: null,
      grams: item.defaultPortionGrams,
    });
  }

  choices.push({
    key: 'basis',
    label: item.basisUnit,
    unit: item.basisUnit,
    portionId: null,
    grams: null,
  });

  return choices;
}

function choiceFor(
  item: DayMeal['items'][number],
  choices: UnitChoice[]
): UnitChoice {
  if (item.unit === 'g' || item.unit === 'ml') {
    return choices.find((c) => c.key === 'basis') ?? choices[0];
  }
  if (item.portionId) {
    const match = choices.find((c) => c.portionId === item.portionId);
    if (match) return match;
  }
  return choices[0];
}

/** The amount of the row, in words: "2 Stück (116 g)" or just "116 g". */
function amountLabel(
  item: DayMeal['items'][number],
  choice: UnitChoice
): string {
  if (choice.unit === 'g' || choice.unit === 'ml') {
    return `${formatGermanNumber(item.grams, 1)} ${choice.unit}`;
  }
  return (
    `${formatGermanNumber(item.quantity, 2)} ${choice.label} ` +
    `(${formatGermanNumber(item.grams, 1)} ${item.basisUnit})`
  );
}

function MealItemRow({
  item,
  index,
  readOnly,
}: {
  item: DayMeal['items'][number];
  index: number;
  readOnly: boolean;
}) {
  const choices = unitChoices(item);
  const stored = choiceFor(item, choices);

  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(
    formatGermanNumber(item.quantity, 2)
  );
  const [choiceKey, setChoiceKey] = useState(stored.key);
  const [pending, startTransition] = useTransition();

  const choice = choices.find((c) => c.key === choiceKey) ?? stored;
  const parsed = parseGermanNumber(quantity);

  // The same function the server uses, for the same reason the nutrient editor
  // previews through `resolveNutrientBasis`: a preview that does its own
  // arithmetic promises an amount that may not be the one that gets stored.
  const preview =
    parsed !== null && parsed > 0
      ? resolveGrams({
          quantity: parsed,
          unit: choice.unit,
          portionGrams: choice.grams,
          defaultPortionGrams: item.defaultPortionGrams,
          // Read from the row rather than assumed to be 1: the server reads the
          // column, and a preview that quietly disagrees with what gets stored
          // is worse than no preview.
          densityGPerMl: item.densityGPerMl,
        })
      : null;

  function open() {
    setQuantity(formatGermanNumber(item.quantity, 2));
    setChoiceKey(stored.key);
    setEditing(true);
  }

  function save() {
    const formData = new FormData();
    formData.set('mealItemId', item.id);
    formData.set('quantity', quantity);
    formData.set('unit', choice.unit);
    // Sent explicitly, including when it is empty. Leaving it out used to make
    // every amount correction silently drop the named measure the item was
    // logged against, and the grams were then re-resolved from
    // `defaultPortionGrams ?? 100`.
    formData.set('portionId', choice.portionId ?? '');
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
    <li
      className="rise-in py-2"
      style={{ '--i': index } as React.CSSProperties}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base text-fg">{item.foodName}</p>
          <p className="num text-xs text-muted">
            {amountLabel(item, stored)} · {formatKcal(item.kcal)}
          </p>
        </div>

        {readOnly ? null : editing ? null : (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={open}
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
      </div>

      {!readOnly && editing ? (
        <div className="mt-2 space-y-2 rounded-control border border-line bg-bg-sunken p-2">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="w-20 text-center"
              aria-label="Menge"
              autoFocus
            />
            <ChipRow className="flex-1">
              {choices.map((option) => (
                <Chip
                  key={option.key}
                  selected={option.key === choice.key}
                  disabled={pending}
                  onClick={() => setChoiceKey(option.key)}
                >
                  {option.label}
                  {option.grams !== null ? (
                    // opacity, not text-muted: a fixed grey on the selected
                    // chip's filled background is unreadable.
                    <span className="num opacity-70">
                      {formatGermanNumber(option.grams, 1)} {item.basisUnit}
                    </span>
                  ) : null}
                </Chip>
              ))}
            </ChipRow>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="num text-xs text-muted">
              {preview === null
                ? '–'
                : `= ${formatGermanNumber(preview, 1)} ${item.basisUnit}`}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={pending}
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={pending || preview === null}
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
