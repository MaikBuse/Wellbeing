import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHART_INK,
  CHART_SERIES,
  DIVERGE_NEGATIVE,
  DIVERGE_POSITIVE,
  SEVERITY_RAMP,
  rampClassFor,
  rampStepFor,
} from '@/lib/chart-theme';

/**
 * The anti-drift guard.
 *
 * Recharts needs the hex values in TypeScript and the plain-HTML charts want
 * Tailwind classes from the same tokens, so the values exist twice. Two copies
 * of a colour eventually disagree, and the disagreement would be invisible —
 * one chart quietly a shade off. So the copies are checked against each other.
 */
const css = readFileSync('src/app/globals.css', 'utf8');

function tokenValue(name: string): string | null {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  return match ? match[1].toLowerCase() : null;
}

describe('chart theme', () => {
  it('matches the --color-chart-* tokens in globals.css', () => {
    CHART_SERIES.forEach((hex, index) => {
      expect(tokenValue(`color-chart-${index + 1}`)).toBe(hex.toLowerCase());
    });
  });

  it('matches the --color-ramp-* tokens', () => {
    SEVERITY_RAMP.forEach((hex, index) => {
      expect(tokenValue(`color-ramp-${index + 1}`)).toBe(hex.toLowerCase());
    });
  });

  it('matches the diverging tokens', () => {
    expect(tokenValue('color-diverge-pos')).toBe(DIVERGE_POSITIVE.toLowerCase());
    expect(tokenValue('color-diverge-neg')).toBe(DIVERGE_NEGATIVE.toLowerCase());
  });

  it('reuses existing palette tokens for the chrome', () => {
    expect(tokenValue('color-line')).toBe(CHART_INK.grid.toLowerCase());
    expect(tokenValue('color-line-strong')).toBe(CHART_INK.baseline.toLowerCase());
    expect(tokenValue('color-muted')).toBe(CHART_INK.axisText.toLowerCase());
    expect(tokenValue('color-fg')).toBe(CHART_INK.valueText.toLowerCase());
  });

  it('reuses the existing sev-4 rose rather than inventing a near-match', () => {
    expect(tokenValue('color-sev-4')).toBe(SEVERITY_RAMP[3].toLowerCase());
    expect(CHART_SERIES[2].toLowerCase()).toBe(SEVERITY_RAMP[3].toLowerCase());
  });

  it('has exactly six categorical slots', () => {
    // A seventh would have to be a generated hue, which is indistinguishable
    // from an existing slot under simulated colour blindness.
    expect(CHART_SERIES).toHaveLength(6);
    expect(new Set(CHART_SERIES).size).toBe(6);
  });

  it('keeps the severity ramp monotone in lightness', () => {
    // The property the old sev-0..4 ramp lacks, which is why it cannot be a
    // heatmap ramp: there, sev-1 is lighter than sev-0.
    const luminance = (hex: string) => {
      const value = parseInt(hex.slice(1), 16);
      const r = (value >> 16) & 255;
      const g = (value >> 8) & 255;
      const b = value & 255;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (let i = 1; i < SEVERITY_RAMP.length; i++) {
      expect(luminance(SEVERITY_RAMP[i])).toBeLessThan(luminance(SEVERITY_RAMP[i - 1]));
    }
  });
});

describe('ramp mapping', () => {
  it('keeps zero out of the ramp', () => {
    // "No complaints" is neutral, not the palest rose.
    expect(rampStepFor(0)).toBeNull();
    expect(rampClassFor(0)).toBe('bg-bg-sunken');
  });

  it('distinguishes "not recorded" from zero', () => {
    // An unlogged day must never look like a good day.
    expect(rampClassFor(null)).toBe('bg-transparent');
  });

  it('covers the six values the chips can produce', () => {
    for (const value of [2, 4, 6, 8, 10]) {
      expect(rampStepFor(value)).not.toBeNull();
      expect(rampClassFor(value)).toMatch(/^bg-ramp-[1-5]$/);
    }
  });

  it('is monotone across the scale', () => {
    const steps = [2, 4, 6, 8, 10].map((v) => rampStepFor(v));
    expect(new Set(steps).size).toBe(5);
  });
});
