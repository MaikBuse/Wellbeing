import { AlertTriangle, Check, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One nutrient against its target: a bar with a notch where the target sits.
 *
 * Why a notch and not a ring. A ring cannot express "over the limit" — it is
 * full at a hundred percent and then it is finished, and four 48-pixel rings
 * eat the card. Why not a stacked bar either: a stack implies parts of a whole,
 * and these are independent quantities.
 *
 * FOUR STATES, EACH ON THREE CHANNELS — a word, a glyph and a fill. Colour
 * could be removed entirely and nothing would be lost, which is what
 * CLAUDE.md's rule about colour never coding a value alone actually asks for.
 * Minimum and maximum are told apart by GEOMETRY and WORDING, not by hue: below
 * a minimum the bar grows towards the notch and overshooting costs nothing;
 * against a limit the track is the allowance and the excess gets its own
 * segment past the notch, separated by a two-pixel gap.
 *
 * The supplement share is a second, hatched segment in the same bar. A target
 * reached only through a preparation should look like that.
 *
 * The geometry is `aria-hidden`; the container carries a full German label and
 * the number sits beside it as real text.
 */

export type GoalMeterStatus = 'below' | 'in' | 'over' | 'unmeasured';

export type GoalMeterProps = {
  label: string;
  /** Already formatted, German decimal comma, with unit. Null when unmeasured. */
  valueText: string | null;
  /** "mindestens 90 g", "höchstens 6 g", "Zielbereich 55–75 g". */
  targetText: string;
  status: GoalMeterStatus;
  /** 0..1 of the way to the notch; may exceed 1 for an overshoot. */
  fill: number;
  /** Share of `fill` that came from a preparation rather than from food. */
  supplementFill?: number;
  /** "zu wenig Messwerte", "über der Grenze" — the state as a word. */
  statusText: string;
  /** Prefixes the number when the day can only understate it. */
  isLowerBound?: boolean;
  className?: string;
};

const STATUS_FILL: Record<GoalMeterStatus, string> = {
  below: 'bg-chart-1',
  in: 'bg-ok',
  over: 'bg-ramp-4',
  unmeasured: 'bg-transparent',
};

function Glyph({ status }: { status: GoalMeterStatus }) {
  if (status === 'in') return <Check aria-hidden className="size-3.5 text-ok" />;
  if (status === 'over') {
    return <AlertTriangle aria-hidden className="size-3.5 text-ramp-5" />;
  }
  if (status === 'unmeasured') {
    return <HelpCircle aria-hidden className="size-3.5 text-muted" />;
  }
  return null;
}

export function GoalMeter({
  label,
  valueText,
  targetText,
  status,
  fill,
  supplementFill = 0,
  statusText,
  isLowerBound = false,
  className,
}: GoalMeterProps) {
  const clamped = Math.min(1, Math.max(0, fill));
  const overshoot = Math.min(1, Math.max(0, fill - 1));
  const supplement = Math.min(clamped, Math.max(0, supplementFill));
  const fromFood = Math.max(0, clamped - supplement);

  const spoken =
    status === 'unmeasured'
      ? `${label}: ${statusText}`
      : `${label}: ${isLowerBound ? 'mindestens ' : ''}${valueText ?? '–'}, ${targetText}, ${statusText}`;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-fg">{label}</span>
        <span className="flex items-center gap-1.5">
          <Glyph status={status} />
          <span className="num text-sm tabular-nums text-muted">
            {status === 'unmeasured'
              ? statusText
              : `${isLowerBound ? 'mind. ' : ''}${valueText ?? '–'}`}
          </span>
        </span>
      </div>

      <div role="img" aria-label={spoken}>
        <div
          aria-hidden
          className={cn(
            'relative flex h-1.5 overflow-hidden rounded-pill',
            status === 'unmeasured'
              ? 'border border-dashed border-line-strong bg-transparent'
              : 'bg-bg-sunken'
          )}
        >
          {status === 'unmeasured' ? null : (
            <>
              <span
                className={cn('block h-full', STATUS_FILL[status])}
                style={{ width: `${fromFood * 100}%` }}
              />
              {supplement > 0 ? (
                <span
                  className={cn('block h-full opacity-70', STATUS_FILL[status])}
                  style={{
                    width: `${supplement * 100}%`,
                    backgroundImage:
                      'repeating-linear-gradient(45deg, rgba(255,255,255,.55) 0 2px, transparent 2px 4px)',
                  }}
                />
              ) : null}
              {overshoot > 0 ? (
                // Two-pixel surface gap, then the excess as its own segment:
                // past the notch is a different thing, not more of the same.
                <>
                  <span className="block h-full w-0.5 shrink-0 bg-card" />
                  <span
                    className="block h-full bg-ramp-5"
                    style={{ width: `${overshoot * 100}%` }}
                  />
                </>
              ) : null}
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">
        {targetText}
        {status === 'unmeasured' ? null : <> · {statusText}</>}
      </p>
    </div>
  );
}
