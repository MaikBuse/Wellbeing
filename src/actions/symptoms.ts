'use server';

import { and, eq } from 'drizzle-orm';
import { requireUserWithSettings } from '@/auth.helpers';
import { db } from '@/db';
import { meals, symptomEntries, symptomEntrySymptoms } from '@/db/schema';
import { revalidateDay } from '@/lib/revalidate';
import { toLogDate } from '@/lib/time';
import { createSymptomEntrySchema } from '@/lib/validation/symptom';
import type { ActionResult } from './meals';

/**
 * A symptom entry may or may not belong to a meal. Attributing every symptom
 * to a meal would silently drop the 03:00 flare, which is exactly the kind of
 * event the analysis needs.
 */
export async function createSymptomEntry(input: {
  mealId?: string | null;
  severity: number;
  onsetLag?: string | null;
  symptomTypeIds: string[];
  note?: string | null;
  occurredAt?: string;
}): Promise<ActionResult> {
  const { user, settings } = await requireUserWithSettings();
  const parsed = createSymptomEntrySchema.safeParse({
    ...input,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe unvollständig',
    };
  }

  if (parsed.data.mealId) {
    const [meal] = await db
      .select({ id: meals.id })
      .from(meals)
      .where(and(eq(meals.id, parsed.data.mealId), eq(meals.userId, user.id)))
      .limit(1);
    if (!meal) return { ok: false, error: 'Mahlzeit nicht gefunden' };
  }

  const occurredAt = parsed.data.occurredAt ?? new Date();
  await db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(symptomEntries)
      .values({
        userId: user.id,
        mealId: parsed.data.mealId ?? null,
        occurredAt,
        logDate: toLogDate(
          occurredAt,
          settings.timeZone,
          settings.dayStartHour
        ),
        severity: parsed.data.severity,
        onsetLag: parsed.data.onsetLag ?? null,
        onsetMinutes: parsed.data.onsetMinutes ?? null,
        durationMinutes: parsed.data.durationMinutes ?? null,
        note: parsed.data.note ?? null,
      })
      .returning({ id: symptomEntries.id });

    if (parsed.data.symptomTypeIds.length > 0) {
      await tx.insert(symptomEntrySymptoms).values(
        parsed.data.symptomTypeIds.map((symptomTypeId) => ({
          entryId: entry.id,
          symptomTypeId,
        }))
      );
    }
  });

  revalidateDay();
  return { ok: true };
}

export async function deleteSymptomEntry(
  entryId: string
): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const deleted = await db
    .delete(symptomEntries)
    .where(
      and(eq(symptomEntries.id, entryId), eq(symptomEntries.userId, user.id))
    )
    .returning({ id: symptomEntries.id });
  if (deleted.length === 0) {
    return { ok: false, error: 'Eintrag nicht gefunden' };
  }
  revalidateDay();
  return { ok: true };
}
