import type { RangePreset } from '@/components/analysis/range-filter';
import type { LogDate } from '@/lib/time';

/**
 * Resolve a preset name into a day window — on the SERVER.
 *
 * The client only ever writes the preset name into the URL. Computing the window
 * there would mean calling `todayLogDate()` in a client component, which ignores
 * the user's `dayStartHour` and is a hydration mismatch across the 04:00
 * boundary; CLAUDE.md forbids it for exactly that reason.
 *
 * `undefined` bounds let the loader apply its own default and the full history
 * respectively, which keeps the day-boundary arithmetic in one place.
 *
 * Lives in `lib/` rather than under `app/(app)/analyse/` because the nutrient
 * screens use the same presets and the same filter component; leaving it inside
 * one route segment would have meant importing across two of them.
 */
export const PRESET_DAYS: Record<Exclude<RangePreset, 'all'>, number> = {
  '30': 30,
  '90': 90,
  '180': 180,
};

export function rangeFromPreset(preset: RangePreset): {
  from?: LogDate;
  to?: LogDate;
  days?: number;
} {
  if (preset === 'all') return {};
  return { days: PRESET_DAYS[preset] };
}


/**
 * A preset name off a search param, or the default.
 *
 * Every analysis page repeated this ternary verbatim, which is one place per
 * page for the list of valid names to fall out of step with `RANGE_PRESETS`.
 */
export function parseRangePreset(
  value: string | undefined,
  fallback: RangePreset = '90'
): RangePreset {
  return value === '30' || value === '90' || value === '180' || value === 'all'
    ? value
    : fallback;
}
