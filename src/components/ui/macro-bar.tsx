import { cn } from '@/lib/utils';

/**
 * The day's macronutrient split as one segmented bar plus a legend.
 *
 * Segment widths are the share of *energy*, not of grams — fat carries 9 kcal
 * per gram against 4 for protein and carbs, so a gram-proportional bar would
 * misrepresent the split. The grams are what the legend prints.
 *
 * Every segment appears in the legend with its name and value: the three
 * palette tones (calm blue-grey, apricot, rose) are not far enough apart to
 * carry the meaning on their own.
 */

const KCAL_PER_G = { protein: 4, fat: 9, carbs: 4 } as const;

type Macro = keyof typeof KCAL_PER_G;

const SEGMENTS: { key: Macro; label: string; bar: string; dot: string }[] = [
  { key: 'protein', label: 'Protein', bar: 'bg-calm', dot: 'bg-calm' },
  { key: 'carbs', label: 'Kohlenhydrate', bar: 'bg-primary', dot: 'bg-primary' },
  { key: 'fat', label: 'Fett', bar: 'bg-secondary', dot: 'bg-secondary' },
];

export function MacroBar({
  proteinG,
  fatG,
  carbsG,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
}) {
  const grams: Record<Macro, number> = {
    protein: proteinG ?? 0,
    fat: fatG ?? 0,
    carbs: carbsG ?? 0,
  };

  const energy: Record<Macro, number> = {
    protein: grams.protein * KCAL_PER_G.protein,
    fat: grams.fat * KCAL_PER_G.fat,
    carbs: grams.carbs * KCAL_PER_G.carbs,
  };
  const total = energy.protein + energy.fat + energy.carbs;

  return (
    <div className={cn('space-y-2', className)} {...props}>
      <div
        className="flex h-2 gap-0.5 overflow-hidden rounded-pill bg-bg-sunken"
        aria-hidden
      >
        {total > 0
          ? SEGMENTS.map((segment) => {
              const share = energy[segment.key] / total;
              if (share <= 0) return null;
              return (
                <div
                  key={segment.key}
                  className={segment.bar}
                  style={{ width: `${share * 100}%` }}
                />
              );
            })
          : null}
      </div>

      <dl className="flex flex-wrap gap-x-4 gap-y-1">
        {SEGMENTS.map((segment) => (
          <div key={segment.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn('size-2 shrink-0 rounded-pill', segment.dot)}
            />
            <dt className="text-xs text-muted">{segment.label}</dt>
            <dd className="num text-xs font-semibold text-fg">
              {Math.round(grams[segment.key])} g
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
