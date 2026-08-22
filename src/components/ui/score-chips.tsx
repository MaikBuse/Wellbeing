'use client';

import { SEVERITY_ANCHORS } from '@/lib/scales';
import { severityClasses } from '@/components/ui/severity-badge';
import { cn } from '@/lib/utils';

/**
 * A 0-10 score entered as six anchored chips.
 *
 * The number is always printed next to the colour: rose and apricot sit close
 * together on the colour wheel, so colour alone must never carry the value.
 */
export function ScoreChips({
  name,
  value,
  onChange,
  labelledBy,
}: {
  name: string;
  value: number | null;
  onChange: (value: number | null) => void;
  labelledBy?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className="-mx-1 flex flex-wrap gap-2 px-1"
    >
      {SEVERITY_ANCHORS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            name={name}
            onClick={() => onChange(selected ? null : option.value)}
            className={cn(
              'flex min-h-11 flex-1 basis-24 flex-col items-center justify-center rounded-control border px-2 py-1.5',
              'transition-[background-color,border-color,color,box-shadow,transform] duration-120 ease-out-soft',
              'active:scale-[0.97]',
              selected
                ? cn(
                    'animate-pop border-transparent ring-2 ring-primary-strong ring-offset-1',
                    severityClasses(option.value)
                  )
                : 'border-line bg-card text-fg hover:border-line-strong hover:bg-primary-tint'
            )}
          >
            <span className="num text-base font-semibold leading-none">
              {option.value}
            </span>
            <span className="mt-0.5 text-[0.7rem] leading-tight opacity-80">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
