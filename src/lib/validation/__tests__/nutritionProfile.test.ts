import { describe, expect, it } from 'vitest';
import {
  nutritionProfileFieldSchema,
  targetOverrideSchema,
} from '../nutritionProfile';

/**
 * The questionnaire's payload, field by field.
 *
 * This file exists because of a bug it would have caught on day one: the form
 * sent `Number(input.value)` while the schema expected the raw string that
 * `germanNumber` parses. Every manual weight was rejected — 30 kg as surely as
 * 115 kg — with zod's English default, "Invalid input", which named neither the
 * field nor the reason. So the assertions here are deliberately about two
 * things at once: that the value the form sends is accepted, and that a refusal
 * is a German sentence naming the range and an example.
 */

function parse(field: string, value: unknown) {
  return nutritionProfileFieldSchema.safeParse({ field, value });
}

function message(field: string, value: unknown): string {
  const result = parse(field, value);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('unreachable');
  return result.error.issues[0]?.message ?? '';
}

function parsed(field: string, value: unknown) {
  const result = parse(field, value);
  if (!result.success) {
    throw new Error(`${field}=${String(value)}: ${result.error.issues[0]?.message}`);
  }
  return result.data.value;
}

describe('the number fields of the questionnaire', () => {
  const cases = [
    { field: 'birthYear', good: '1985', expect: 1985 },
    { field: 'heightCm', good: '178', expect: 178 },
    { field: 'referenceWeightKg', good: '115', expect: 115 },
    { field: 'proteinMaxGPerKg', good: '0,8', expect: 0.8 },
  ] as const;

  for (const testCase of cases) {
    it(`takes ${testCase.field} as the string the form sends`, () => {
      expect(parsed(testCase.field, testCase.good)).toBe(testCase.expect);
    });

    it(`clears ${testCase.field} on an empty string`, () => {
      expect(parsed(testCase.field, '')).toBeNull();
    });

    it(`refuses a number for ${testCase.field}`, () => {
      // The regression itself. A number reaches `germanNumber`, which is a
      // z.string(), and fails the TYPE check before any range check runs.
      const result = parse(testCase.field, Number(testCase.expect));
      expect(result.success).toBe(false);
    });
  }

  it('keeps the German decimal comma', () => {
    expect(parsed('referenceWeightKg', '115,5')).toBe(115.5);
    expect(parsed('referenceWeightKg', '115.5')).toBe(115.5);
    expect(parsed('referenceWeightKg', ' 72,5 ')).toBe(72.5);
  });

  it('accepts a weight anywhere inside the table CHECK', () => {
    expect(parsed('referenceWeightKg', '30')).toBe(30);
    expect(parsed('referenceWeightKg', '250')).toBe(250);
  });
});

describe('the refusals', () => {
  it('name the range and an example for a weight', () => {
    const text = message('referenceWeightKg', '999');
    expect(text).toContain('30');
    expect(text).toContain('250');
    expect(text).toContain('72,5');
  });

  it('name the range and an example for a birth year', () => {
    const text = message('birthYear', '85');
    expect(text).toContain('1900');
    expect(text).toContain('1985');
  });

  it('name the range and an example for a height', () => {
    const text = message('heightCm', '17');
    expect(text).toContain('250');
    expect(text).toContain('178');
  });

  it('name the range and an example for the protein cap', () => {
    const text = message('proteinMaxGPerKg', '9');
    expect(text).toContain('2,50');
    expect(text).toContain('0,80');
  });

  it('are German, never zod defaults', () => {
    const texts = [
      message('referenceWeightKg', '999'),
      message('referenceWeightKg', 'abc'),
      message('birthYear', '85'),
      message('birthYear', '1985,5'),
      message('heightCm', '17'),
      message('proteinMaxGPerKg', '9'),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/Invalid|expected|Too small|Too big/);
      expect(text.startsWith('Bitte')).toBe(true);
    }
  });

  it('refuse a fractional birth year rather than rounding it', () => {
    expect(parse('birthYear', '1985,5').success).toBe(false);
  });
});

describe('the choice fields', () => {
  it('take the enum values the chips send', () => {
    expect(parsed('referenceSex', 'female')).toBe('female');
    expect(parsed('activityLevel', 'very_active')).toBe('very_active');
    expect(parsed('dietForm', 'vegan')).toBe('vegan');
    expect(parsed('weightSource', 'manual')).toBe('manual');
    expect(parsed('hasSarcopenia', true)).toBe(true);
    expect(parsed('menopauseStage', null)).toBeNull();
  });

  it('refuse a value from another field', () => {
    expect(parse('activityLevel', 'vegan').success).toBe(false);
    expect(parse('referenceSex', 'divers').success).toBe(false);
  });

  it('refuse an unknown field outright', () => {
    expect(parse('weightKg', '80').success).toBe(false);
  });
});

describe('a target override', () => {
  it('takes both ends of a range', () => {
    const result = targetOverrideSchema.safeParse({
      nutrientKey: 'protein',
      min: '70',
      max: '90',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.min).toBe(70);
      expect(result.data.max).toBe(90);
    }
  });

  it('refuses an upper end below the lower one', () => {
    const result = targetOverrideSchema.safeParse({
      nutrientKey: 'protein',
      min: '90',
      max: '70',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Der untere Wert muss kleiner sein'
      );
    }
  });
});
