import { pgEnum } from 'drizzle-orm/pg-core';

/*
 * pgEnum for closed sets the code switches on and that never need user
 * extension or ordering metadata. Sets that carry metadata, need ordering, or
 * that the user may extend are lookup tables instead (see lookup.ts).
 */

export const mealSlot = pgEnum('meal_slot', [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
  'drink',
]);

/**
 * Onset buckets ARE the analysis windows. Three buckets could not separate a
 * histamine reaction (minutes) from a FODMAP reaction (hours) from an RA effect
 * (next morning), so there are five.
 */
export const onsetLag = pgEnum('onset_lag', [
  'immediate', // < 30 min
  'early', // 30 min - 2 h
  'mid', // 2 - 6 h
  'late', // 6 - 12 h
  'next_day',
]);

export const foodSource = pgEnum('food_source', ['off', 'bls', 'manual']);
export const tagSource = pgEnum('tag_source', [
  'off_derived',
  'rule',
  'manual',
]);
/** 'trace' assignments are excluded from the analysis by default. */
export const tagConfidence = pgEnum('tag_confidence', [
  'certain',
  'likely',
  'trace',
]);
export const tagCategory = pgEnum('tag_category', [
  'trigger',
  'nutrient',
  'group',
  'custom',
]);
export const tagRuleMatch = pgEnum('tag_rule_match', [
  'off_allergen',
  'off_trace',
  'off_category',
  'off_additive',
  'ingredient_keyword',
  'name_keyword',
  /** Regex on the BLS code, so a rule can address a food group: '^E1' is egg,
   * '^T' is fish. The leading letter alone is not enough — group E holds both
   * pasta and eggs. */
  'bls_group',
  /** A threshold on a measured BLS nutrient: 'lactose>0.5'. This is the reason
   * the catalog carries the trigger columns at all — see services/off/tagRules. */
  'bls_measured',
]);
export const portionUnit = pgEnum('portion_unit', [
  'g',
  'ml',
  'piece',
  'portion',
]);

export const scheduleKind = pgEnum('schedule_kind', [
  'daily',
  'weekly',
  'interval_days',
  'as_needed',
]);
export const intakeStatus = pgEnum('intake_status', [
  'taken',
  'skipped',
  'missed',
]);
export const medForm = pgEnum('med_form', [
  'tablet',
  'capsule',
  'injection',
  'infusion',
  'drops',
  'spray',
  'ointment',
  'other',
]);
export const doseUnit = pgEnum('dose_unit', [
  'mg',
  'ug',
  'g',
  'ml',
  'iu',
  'piece',
]);
export const medCategory = pgEnum('med_category', [
  'csdmard',
  'bdmard',
  'tsdmard',
  'nsaid',
  'steroid',
  'analgesic',
  'supplement',
  'other',
]);

export const jointSide = pgEnum('joint_side', ['left', 'right', 'both']);
export const jointRegion = pgEnum('joint_region', [
  'jaw',
  'neck',
  'shoulder',
  'elbow',
  'wrist',
  'hand',
  'hip',
  'knee',
  'ankle',
  'foot',
  'spine',
  'si',
]);

export const menstrualEventKind = pgEnum('menstrual_event_kind', [
  'period_start',
  'period_end',
  'spotting',
]);

export const protocolStatus = pgEnum('protocol_status', [
  'planned',
  'active',
  'completed',
  'aborted',
]);
export const phaseKind = pgEnum('phase_kind', [
  'baseline',
  'elimination',
  'reintroduction',
  'washout',
]);
export const ruleMode = pgEnum('rule_mode', ['avoid', 'allow', 'challenge']);
export const challengeVerdict = pgEnum('challenge_verdict', [
  'tolerated',
  'suspicious',
  'reactive',
  'inconclusive',
]);
