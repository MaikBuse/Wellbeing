import {
  boolean,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  index,
} from 'drizzle-orm/pg-core';
import { appUsers } from './auth';
import { num, pk, tsz } from './_helpers';
import {
  jointRegion,
  onsetLag,
  tagCategory,
  tagConfidence,
  tagRuleMatch,
} from './enums';

/**
 * Seeded lookup tables. `user_id IS NULL` means a global seed row; a non-null
 * user_id is a row that person added.
 */

export const foodTagDefs = pgTable(
  'food_tag_def',
  {
    id: pk(),
    userId: uuid('user_id').references(() => appUsers.id, {
      onDelete: 'cascade',
    }),
    key: text('key').notNull(), // 'lactose'
    labelDe: text('label_de').notNull(), // 'Laktose'
    descriptionDe: text('description_de'),
    category: tagCategory('category').notNull(),
    /** Gates the suspicion ranking — descriptive tags stay out of it. */
    isAnalysed: boolean('is_analysed').notNull().default(false),
    /**
     * Pre-declared lag window. Testing every tag against every window would
     * multiply the number of hypotheses and manufacture false positives, so
     * each tag commits to one window up front.
     */
    primaryWindow: onsetLag('primary_window'),
    /** Below this amount a day does not count as exposed. */
    minDoseGrams: num('min_dose_grams').default(5),
    sortOrder: smallint('sort_order').notNull().default(100),
  },
  (t) => [uniqueIndex('food_tag_def_key_uq').on(t.userId, t.key)]
);

/**
 * Open Food Facts has allergens, ingredients, categories and additives — and
 * nothing on histamine, FODMAP, nightshades or salicylates. These local rules
 * are what makes those tags exist at all; the suspicion ranking is only as
 * good as this table.
 */
export const tagRules = pgTable(
  'tag_rule',
  {
    id: pk(),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => foodTagDefs.id, { onDelete: 'cascade' }),
    matchType: tagRuleMatch('match_type').notNull(),
    pattern: text('pattern').notNull(), // 'en:milk' | 'weizen|dinkel' | 'e621'
    confidence: tagConfidence('confidence').notNull().default('likely'),
    /** A negative rule excludes the tag: 'laktosefrei', 'glutenfrei'. */
    isNegative: boolean('is_negative').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => [index('tag_rule_tag_idx').on(t.tagId)]
);

export const symptomTypes = pgTable(
  'symptom_type',
  {
    id: pk(),
    userId: uuid('user_id').references(() => appUsers.id, {
      onDelete: 'cascade',
    }),
    key: text('key').notNull(),
    labelDe: text('label_de').notNull(),
    groupKey: text('group_key').notNull(), // gi | systemic | msk | skin | airway | other
    /** Shows an emergency notice in the UI instead of just being logged. */
    isRedFlag: boolean('is_red_flag').notNull().default(false),
    sortOrder: smallint('sort_order').notNull().default(100),
    archivedAt: tsz('archived_at'),
  },
  (t) => [uniqueIndex('symptom_type_key_uq').on(t.userId, t.key)]
);

export const joints = pgTable(
  'joint',
  {
    id: pk(),
    key: text('key').notNull(),
    labelDe: text('label_de').notNull(),
    region: jointRegion('region').notNull(),
    isPaired: boolean('is_paired').notNull().default(true),
    inDas28: boolean('in_das28').notNull().default(false),
    sortOrder: smallint('sort_order').notNull().default(100),
  },
  (t) => [uniqueIndex('joint_key_uq').on(t.key)]
);
