/**
 * Idempotent seed, keyed on `key`. Safe to re-run: it is executed both from
 * `npm run db:seed` locally and from the app on first sign-in, so a fresh
 * database is never empty when someone logs in.
 */
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { foodTagDefs, joints, symptomTypes, tagRules } from '../schema';
import { FOOD_TAGS } from './tags';
import { SYMPTOM_TYPES } from './symptomTypes';
import { JOINTS } from './joints';
import { TAG_RULES } from './tagRules';

type Database = PostgresJsDatabase<Record<string, unknown>>;

export async function seedLookups(db: Database): Promise<{
  tags: number;
  symptoms: number;
  joints: number;
  rules: number;
}> {
  await db
    .insert(foodTagDefs)
    .values(
      FOOD_TAGS.map((t, i) => ({
        key: t.key,
        labelDe: t.labelDe,
        descriptionDe: t.descriptionDe ?? null,
        category: t.category,
        isAnalysed: t.isAnalysed,
        primaryWindow: t.primaryWindow ?? null,
        minDoseGrams: t.minDoseGrams ?? 5,
        sortOrder: i,
      }))
    )
    .onConflictDoUpdate({
      target: [foodTagDefs.userId, foodTagDefs.key],
      set: {
        labelDe: sql`excluded.label_de`,
        category: sql`excluded.category`,
        isAnalysed: sql`excluded.is_analysed`,
        primaryWindow: sql`excluded.primary_window`,
        minDoseGrams: sql`excluded.min_dose_grams`,
        sortOrder: sql`excluded.sort_order`,
      },
    });

  await db
    .insert(symptomTypes)
    .values(
      SYMPTOM_TYPES.map((s, i) => ({
        key: s.key,
        labelDe: s.labelDe,
        groupKey: s.groupKey,
        isRedFlag: s.isRedFlag ?? false,
        sortOrder: i,
      }))
    )
    .onConflictDoUpdate({
      target: [symptomTypes.userId, symptomTypes.key],
      set: {
        labelDe: sql`excluded.label_de`,
        groupKey: sql`excluded.group_key`,
        isRedFlag: sql`excluded.is_red_flag`,
        sortOrder: sql`excluded.sort_order`,
      },
    });

  await db
    .insert(joints)
    .values(
      JOINTS.map((j, i) => ({
        key: j.key,
        labelDe: j.labelDe,
        region: j.region,
        isPaired: j.isPaired ?? true,
        inDas28: j.inDas28 ?? false,
        sortOrder: i,
      }))
    )
    .onConflictDoUpdate({
      target: joints.key,
      set: {
        labelDe: sql`excluded.label_de`,
        region: sql`excluded.region`,
        isPaired: sql`excluded.is_paired`,
        inDas28: sql`excluded.in_das28`,
        sortOrder: sql`excluded.sort_order`,
      },
    });

  // Tag rules have no natural key, so they are replaced wholesale. That is
  // intentional: the rule set is authored in tagRules.ts and the database is
  // only a projection of it.
  const tagIds = await db
    .select({ id: foodTagDefs.id, key: foodTagDefs.key })
    .from(foodTagDefs)
    .where(sql`${foodTagDefs.userId} is null`);
  const byKey = new Map(tagIds.map((t) => [t.key, t.id]));

  await db.delete(tagRules);
  const ruleRows = TAG_RULES.flatMap((r) => {
    const tagId = byKey.get(r.tagKey);
    if (!tagId) {
      console.warn(`tag rule references unknown tag: ${r.tagKey}`);
      return [];
    }
    return [
      {
        tagId,
        matchType: r.matchType,
        pattern: r.pattern,
        confidence: r.confidence ?? 'likely',
        isNegative: r.isNegative ?? false,
        enabled: true,
      },
    ];
  });
  if (ruleRows.length > 0) await db.insert(tagRules).values(ruleRows);

  return {
    tags: FOOD_TAGS.length,
    symptoms: SYMPTOM_TYPES.length,
    joints: JOINTS.length,
    rules: ruleRows.length,
  };
}

// Allow `npm run db:seed`.
if (process.argv[1] && process.argv[1].endsWith('run.ts')) {
  const { db } = await import('../index');
  seedLookups(db)
    .then((counts) => {
      console.log('seeded', counts);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
