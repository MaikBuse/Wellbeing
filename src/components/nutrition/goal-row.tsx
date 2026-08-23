import { Pencil } from 'lucide-react';
import { Disclosure } from '@/components/ui/disclosure';
import { NUTRIENT_META, type NutrientKey } from '@/lib/nutrients';
import { formatAmount, formatTarget } from '@/lib/nutrition-goals';
import { SOURCES } from '@/services/nutrition/targets/sources';
import { NUTRIENT_TARGETS } from '@/services/nutrition/targets/catalog';
import type { TargetValue } from '@/services/nutrition/targets/types';
import { GoalRowEditor } from './goal-row-editor';

/**
 * One target in the list.
 *
 * The origin badge is a WORD, not a colour — which satisfies the rule about
 * colour never coding a value on its own by construction rather than by
 * remembering to add a second channel. Line two names the kind of target in
 * plain German, and those words ("mindestens", "höchstens", "Zielbereich") are
 * what carry the minimum/limit distinction everywhere in this app.
 *
 * The reasoning sits behind a `Disclosure` because there are two dozen of these
 * and each carries a paragraph; unmounting the closed ones is exactly what that
 * component is for.
 */
export function GoalRow({
  nutrientKey,
  target,
  overridden,
}: {
  nutrientKey: NutrientKey;
  target: TargetValue;
  overridden: boolean;
}) {
  const meta = NUTRIENT_META[nutrientKey];
  const definition = NUTRIENT_TARGETS[nutrientKey];
  const headline =
    target.unavailableReason !== null
      ? '–'
      : formatAmount(target.min ?? target.max, nutrientKey);

  return (
    <div className="border-t border-line-soft py-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-fg">{meta.labelDe}</span>
        <span className="flex items-center gap-2">
          <span className="num text-sm tabular-nums text-fg">{headline}</span>
          <span
            className={
              overridden
                ? 'inline-flex items-center gap-1 rounded-pill bg-soft px-2 py-0.5 text-xs text-fg'
                : 'inline-flex items-center rounded-pill bg-bg-sunken px-2 py-0.5 text-xs text-muted'
            }
          >
            {overridden ? (
              <>
                <Pencil aria-hidden className="size-3" />
                selbst gesetzt
              </>
            ) : (
              'abgeleitet'
            )}
          </span>
        </span>
      </div>

      <p className="mt-0.5 text-xs text-muted">
        {formatTarget(target, nutrientKey)}
        {definition?.showVerdict === false ? ' · wird nicht bewertet' : null}
      </p>

      <Disclosure label="Warum dieser Wert" className="mt-2">
        <div className="space-y-2 text-xs text-muted">
          <p>{target.rationaleDe}</p>
          {definition?.cautionDe ? (
            <p className="text-fg">{definition.cautionDe}</p>
          ) : null}
          {target.sourceKeys.map((key) => (
            <p key={key}>
              <span className="font-medium text-fg">{SOURCES[key].labelDe}</span>{' '}
              ({SOURCES[key].year}) — {SOURCES[key].citation}.{' '}
              {SOURCES[key].strengthDe}
            </p>
          ))}
          <GoalRowEditor
            nutrientKey={nutrientKey}
            direction={target.direction}
            derivedText={headline}
            overridden={overridden}
            unavailable={target.unavailableReason !== null}
          />
        </div>
      </Disclosure>
    </div>
  );
}
