import { describe, expect, it } from 'vitest';
import { COMMON_PORTION_LABELS, portionLabelSuggestions } from '../food-units';

describe('portionLabelSuggestions', () => {
  it('offers the household measures when nothing has been used yet', () => {
    expect(portionLabelSuggestions([])).toEqual([...COMMON_PORTION_LABELS]);
  });

  it('appends labels already used in the shared catalog', () => {
    const out = portionLabelSuggestions(['Riegel']);
    expect(out).toContain('Riegel');
    expect(out.indexOf('Riegel')).toBeGreaterThan(out.indexOf('Stück'));
  });

  /**
   * The reason the fixed list is first rather than merged by frequency: it is
   * what decides the chip says „Stück“. Someone who once typed „stück“ into a
   * catalog every account shares must not turn that into the offered spelling.
   */
  it('dedupes case-insensitively and keeps the canonical spelling', () => {
    const out = portionLabelSuggestions(['stück', 'STÜCK', ' Stück ']);
    expect(out.filter((l) => l.toLowerCase() === 'stück')).toEqual(['Stück']);
  });

  it('ignores blank labels rather than offering an empty chip', () => {
    expect(portionLabelSuggestions(['   ', ''])).toEqual([
      ...COMMON_PORTION_LABELS,
    ]);
  });

  it('caps the row so the chips do not become the page', () => {
    const many = Array.from({ length: 50 }, (_, i) => `Einheit ${i}`);
    expect(portionLabelSuggestions(many)).toHaveLength(16);
  });
});
