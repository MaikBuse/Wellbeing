/**
 * Chart colours and geometry for Recharts.
 *
 * Recharts takes `fill` and `stroke` as props, not Tailwind classes, so it
 * needs the values at render time. Reading them from CSS with
 * `getComputedStyle` would require an effect — an unstyled first frame in the
 * browser and no value at all during SSR — so the hex values are duplicated
 * here on purpose.
 *
 * The duplication is guarded rather than trusted: `chart-theme.test.ts` reads
 * `globals.css` and asserts every value below still matches its token. Change a
 * colour in one place and the test names the other.
 *
 * The calendar heatmap, the ranking rows and the co-occurrence grid are plain
 * HTML and use the Tailwind classes (`bg-chart-1`, `bg-ramp-3`) instead — same
 * source, no second copy.
 */

/**
 * Categorical slots, in a FIXED order that must never be reordered or cycled.
 * The order is what makes adjacent pairs colourblind-safe. Past six series the
 * answer is "Sonstiges" or small multiples, never a seventh colour.
 */
export const CHART_SERIES = [
  '#1f6f9e',
  '#c2621f',
  '#8e3b39',
  '#4a7f3a',
  '#7d5ba8',
  '#a07a1f',
] as const;

/**
 * Scatter, bubble and small-multiple forms put any two marks side by side, so
 * they face the all-pairs gate rather than the adjacent one — and there only the
 * first three slots clear it.
 */
export const CHART_SERIES_ALL_PAIRS_CAP = 3;

/** Sequential severity ramp, light to dark, one hue. */
export const SEVERITY_RAMP = [
  '#dfa3a1',
  '#c6807e',
  '#ac605e',
  '#8e3b39',
  '#6d2b2a',
] as const;

export const DIVERGE_POSITIVE = '#1f6f9e';
export const DIVERGE_NEGATIVE = '#8e3b39';

/** Chart chrome, from the existing palette. */
export const CHART_INK = {
  /** Gridlines and axis rules: hairline, SOLID. Dashing reads as a threshold. */
  grid: '#ece1e3',
  baseline: '#ddc9cd',
  axisText: '#6b5c5f',
  valueText: '#2a2224',
  surface: '#ffffff',
  neutral: '#f6eff1',
} as const;

/**
 * Mark geometry.
 *
 * `barGap` and `barCategoryGap` are what produce the 2px surface gap between
 * touching marks. Separation is done by empty space, never by a stroke drawn around
 * a mark — a border adds data-weight ink that is not data.
 */
export const MARK = {
  maxBarSize: 24,
  barRadius: 4,
  lineWidth: 2,
  dotRadius: 4,
  /** Rings let a dot stay legible where it crosses a line. */
  dotRingWidth: 2,
  areaOpacity: 0.1,
  gridWidth: 1,
  /** The gap in surface colour between adjacent bars, in px. */
  surfaceGap: 2,
} as const;

/** Sizes tuned for one hand on a phone, in a max-w-lg column. */
export const CHART_SIZE = {
  /** A single trend panel in the small-multiples stack. */
  panelHeight: 110,
  /** The x-axis band. A container that omits this gets a nested scrollbar. */
  axisBand: 24,
  sparklineHeight: 32,
  /** Minimum touch target for any interactive mark. */
  hitTarget: 44,
} as const;

/** Recharts margins. Known here so the scrub layer can map x to an index. */
export const CHART_MARGIN = {
  top: 6,
  right: 10,
  bottom: 0,
  left: 10,
} as const;

/** Pick a severity ramp step for a 0-10 score. Zero is neutral, not pale rose. */
export function rampStepFor(value: number): string | null {
  if (value <= 0) return null;
  if (value <= 2) return SEVERITY_RAMP[0];
  if (value <= 4) return SEVERITY_RAMP[1];
  if (value <= 6) return SEVERITY_RAMP[2];
  if (value <= 8) return SEVERITY_RAMP[3];
  return SEVERITY_RAMP[4];
}

/** Tailwind class for the same step, for the plain-HTML charts. */
export function rampClassFor(value: number | null): string {
  if (value === null) return 'bg-transparent';
  if (value <= 0) return 'bg-bg-sunken';
  if (value <= 2) return 'bg-ramp-1';
  if (value <= 4) return 'bg-ramp-2';
  if (value <= 6) return 'bg-ramp-3';
  if (value <= 8) return 'bg-ramp-4';
  return 'bg-ramp-5';
}

/**
 * Text on a ramp cell. The two darkest steps need light text; the rest keep ink.
 * Chosen by luminance so a label inside a fill always clears contrast.
 */
export function rampTextClassFor(value: number | null): string {
  if (value === null || value <= 0) return 'text-muted';
  return value >= 7 ? 'text-white' : 'text-fg';
}
