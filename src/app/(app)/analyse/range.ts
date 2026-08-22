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
