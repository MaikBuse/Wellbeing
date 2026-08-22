'use client';

import { SEVERITY_ANCHORS, type ScaleOption } from '@/lib/scales';
import { severityClasses } from '@/components/ui/severity-badge';
import { cn } from '@/lib/utils';

/**
 * A 0-10 score entered as anchored chips.
 *
 * The number is always printed next to the colour: rose and apricot sit close
 * together on the colour wheel, so colour alone must never carry the value.
 */
export function ScoreChips({
  name,
  value,
  onChange,
  labelledBy,
  /** Defaults to the full 0-10 ramp. The reaction form drops the 0 anchor,
   * because "keine" is a step of its own there. */
  options = SEVERITY_ANCHORS,
  disabled = false,
}: {
  name: string;
  value: number | null;
  onChange: (value: number | null) => void;
  labelledBy?: string;
  options?: ScaleOption[];
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="-mx-1 flex flex-wrap gap-2 px-1"
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            name={name}
            // A real disabled attribute, not just a faded look: a control that
            // reads as unavailable and still responds is worse than either.
            disabled={disabled}
            onClick={() => onChange(selected ? null : option.value)}
            className={cn(
              'flex min-h-11 flex-1 basis-24 flex-col items-center justify-center rounded-control border px-2 py-1.5',
              'transition-[background-color,border-color,color,box-shadow,transform] duration-120 ease-out-soft',
              'active:scale-[0.97]',
              'disabled:pointer-events-none disabled:opacity-50',
              selected
                ? cn(
                    'animate-pop border-transparent ring-2 ring-primary-strong ring-offset-1',
                    severityClasses(option.value)
                  )
                : // border-line-strong, not border-line: on the pale background
                  // a hairline border reads as a disabled control.
                  'border-line-strong bg-card text-fg hover:border-primary-strong hover:bg-primary-tint'
            )}
          >
            <span className="num text-base font-semibold leading-none">
              {option.value}
            </span>
            <span className="mt-0.5 text-[0.7rem] leading-tight">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
