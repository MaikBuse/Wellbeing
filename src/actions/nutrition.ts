'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { requireUserForAction, requireUserWithSettings } from '@/auth.helpers';
import { db } from '@/db';
import {
  medicationNutrients,
  medications,
  nutritionTargetOverrides,
  userNutritionProfiles,
  userSettings,
} from '@/db/schema';
import { NUTRIENT_META, type NutrientKey } from '@/lib/nutrients';
import { revalidateNutritionGoals } from '@/lib/revalidate';
import { todayLogDate } from '@/lib/time';
import {
  clearTargetOverrideSchema,
  medicationNutrientSchema,
  nutritionAckSchema,
  nutritionProfileFieldSchema,
  removeMedicationNutrientSchema,
  targetOverrideSchema,
  type NutritionProfileFieldInput,
} from '@/lib/validation/nutritionProfile';
import { NUTRITION_DISCLAIMER_VERSION } from '@/lib/nutrition-goals';
import { NUTRIENT_TARGETS } from '@/services/nutrition/targets/catalog';
import type { ActionResult } from './meals';

function invalid(message: string | undefined): ActionResult {
  return { ok: false, error: message ?? 'Eingabe ungültig' };
}

/**
 * Save one answer of the questionnaire.
 *
 * VERSIONING, and the rule that keeps it from becoming noise: while the open
 * version still starts today, the row is corrected in place. A mistyped body
 * height is not history. From the next day on, a change closes the old version
 * and opens a new one — the same shape `medication_schedule` uses, and for the
 * same reason. Without it, a renal cap entered in August would turn every day
 * since January into a breach of a limit that did not exist then, and move the
 * milestone dates already written to `achievement` out from under themselves.
 */
export async function saveNutritionProfileField(
  input: NutritionProfileFieldInput
): Promise<ActionResult> {
  const { user, settings } = await requireUserWithSettings();

  const parsed = nutritionProfileFieldSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const today = todayLogDate(settings.timeZone, settings.dayStartHour);
  const { field, value } = parsed.data;

  await db.transaction(async (tx) => {
    const [open] = await tx
      .select()
      .from(userNutritionProfiles)
      .where(
        and(
          eq(userNutritionProfiles.userId, user.id),
          isNull(userNutritionProfiles.validTo)
        )
      )
      .limit(1);

    if (!open) {
      await tx
        .insert(userNutritionProfiles)
        .values({ userId: user.id, validFrom: today, [field]: value });
      return;
    }

    if (open.validFrom === today) {
      await tx
        .update(userNutritionProfiles)
        .set({ [field]: value })
        .where(eq(userNutritionProfiles.id, open.id));
      return;
    }

    // A new day, so the change is history: close the old version on yesterday
    // and carry every other answer forward unchanged. The columns are listed
    // rather than spread, so adding one to the table without deciding whether
    // it should carry forward is a type error instead of a silent copy.
    await tx
      .update(userNutritionProfiles)
      .set({ validTo: previousDay(today) })
      .where(eq(userNutritionProfiles.id, open.id));
    await tx.insert(userNutritionProfiles).values({
      userId: user.id,
      referenceSex: open.referenceSex,
      birthYear: open.birthYear,
      heightCm: open.heightCm,
      activityLevel: open.activityLevel,
      goal: open.goal,
      hasSarcopenia: open.hasSarcopenia,
      menopauseStage: open.menopauseStage,
      dietForm: open.dietForm,
      renalImpairment: open.renalImpairment,
      proteinMaxGPerKg: open.proteinMaxGPerKg,
      weightSource: open.weightSource,
      referenceWeightKg: open.referenceWeightKg,
      validFrom: today,
      validTo: null,
      [field]: value,
    });
  });

  revalidateNutritionGoals();
  return { ok: true };
}

/** One day back, as a plain calendar date. */
function previousDay(logDate: string): string {
  const date = new Date(`${logDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Acknowledge the framing, which is what switches the feature on.
 *
 * There is no separate enable flag: a state where the targets show without the
 * sentence around them should not be reachable.
 */
export async function setNutritionAcknowledged(input: {
  acknowledged: boolean;
}): Promise<ActionResult> {
  const user = await requireUserForAction();

  const parsed = nutritionAckSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const value = parsed.data.acknowledged
    ? { nutritionAckVersion: NUTRITION_DISCLAIMER_VERSION, nutritionAckAt: new Date() }
    : { nutritionAckVersion: null, nutritionAckAt: null };

  await db
    .insert(userSettings)
    .values({ userId: user.id, ...value })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...value, updatedAt: new Date() },
    });

  revalidateNutritionGoals();
  return { ok: true };
}

/**
 * Override one target.
 *
 * Versioned like the profile, and for the same reason: a target raised today
 * must not retroactively turn last month into a failure.
 */
export async function setTargetOverride(input: {
  nutrientKey: string;
  min?: string | number | null;
  max?: string | number | null;
  reason?: string | null;
}): Promise<ActionResult> {
  const { user, settings } = await requireUserWithSettings();

  const parsed = targetOverrideSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const key = parsed.data.nutrientKey as NutrientKey;
  const definition = NUTRIENT_TARGETS[key];
  if (!definition) {
    return { ok: false, error: 'Für diesen Nährstoff gibt es kein Ziel' };
  }

  const today = todayLogDate(settings.timeZone, settings.dayStartHour);
  // The unit is the nutrient's own, never the caller's: an override moves the
  // number, it does not get to redefine what the number means.
  const unit = NUTRIENT_META[key].unit;

  await db.transaction(async (tx) => {
    await closeOpenOverride(tx, user.id, key, today);
    await tx.insert(nutritionTargetOverrides).values({
      userId: user.id,
      nutrientKey: key,
      minValue: parsed.data.min,
      maxValue: parsed.data.max,
      unit,
      reason: parsed.data.reason,
      validFrom: today,
    });
  });

  revalidateNutritionGoals();
  return { ok: true };
}

/** Back to the derived value. Closing the override, not deleting the history. */
export async function clearTargetOverride(input: {
  nutrientKey: string;
}): Promise<ActionResult> {
  const { user, settings } = await requireUserWithSettings();

  const parsed = clearTargetOverrideSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const today = todayLogDate(settings.timeZone, settings.dayStartHour);
  await db.transaction(async (tx) => {
    await closeOpenOverride(
      tx,
      user.id,
      parsed.data.nutrientKey as NutrientKey,
      today
    );
  });

  revalidateNutritionGoals();
  return { ok: true };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function closeOpenOverride(
  tx: Tx,
  userId: string,
  nutrientKey: NutrientKey,
  today: string
): Promise<void> {
  const [open] = await tx
    .select()
    .from(nutritionTargetOverrides)
    .where(
      and(
        eq(nutritionTargetOverrides.userId, userId),
        eq(nutritionTargetOverrides.nutrientKey, nutrientKey),
        isNull(nutritionTargetOverrides.validTo)
      )
    )
    .limit(1);
  if (!open) return;

  if (open.validFrom === today) {
    // Same-day correction, not a second version.
    await tx
      .delete(nutritionTargetOverrides)
      .where(eq(nutritionTargetOverrides.id, open.id));
    return;
  }
  await tx
    .update(nutritionTargetOverrides)
    .set({ validTo: previousDay(today) })
    .where(eq(nutritionTargetOverrides.id, open.id));
}

/**
 * Map a preparation to a nutrient.
 *
 * The amount is per piece, and the schedule has to be in pieces for it to mean
 * anything — that convention is what lets one row describe a combination
 * preparation without a unit discriminator, so it is enforced here rather than
 * left to be discovered as a wrong total later.
 */
export async function setMedicationNutrient(input: {
  medicationId: string;
  nutrientKey: string;
  amountPerPiece: string | number;
  unit: string;
}): Promise<ActionResult> {
  const user = await requireUserForAction();

  const parsed = medicationNutrientSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const [medication] = await db
    .select({ id: medications.id })
    .from(medications)
    .where(
      and(
        eq(medications.id, parsed.data.medicationId),
        eq(medications.userId, user.id)
      )
    )
    .limit(1);
  if (!medication) return { ok: false, error: 'Medikament nicht gefunden' };

  await db
    .insert(medicationNutrients)
    .values({
      medicationId: parsed.data.medicationId,
      nutrientKey: parsed.data.nutrientKey,
      amountPerPiece: parsed.data.amountPerPiece,
      unit: parsed.data.unit,
    })
    .onConflictDoUpdate({
      target: [medicationNutrients.medicationId, medicationNutrients.nutrientKey],
      set: {
        amountPerPiece: parsed.data.amountPerPiece,
        unit: parsed.data.unit,
      },
    });

  revalidateNutritionGoals();
  return { ok: true };
}

export async function removeMedicationNutrient(input: {
  medicationId: string;
  nutrientKey: string;
}): Promise<ActionResult> {
  const user = await requireUserForAction();

  const parsed = removeMedicationNutrientSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const [medication] = await db
    .select({ id: medications.id })
    .from(medications)
    .where(
      and(
        eq(medications.id, parsed.data.medicationId),
        eq(medications.userId, user.id)
      )
    )
    .limit(1);
  if (!medication) return { ok: false, error: 'Medikament nicht gefunden' };

  await db
    .delete(medicationNutrients)
    .where(
      and(
        eq(medicationNutrients.medicationId, parsed.data.medicationId),
        eq(medicationNutrients.nutrientKey, parsed.data.nutrientKey)
      )
    );

  revalidateNutritionGoals();
  return { ok: true };
}
