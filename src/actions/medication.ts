'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { requireUserWithSettings } from '@/auth.helpers';
import { db } from '@/db';
import {
  medicationIntakes,
  medicationScheduleDoses,
  medicationSchedules,
  medications,
} from '@/db/schema';
import { toLogDate, todayLogDate } from '@/lib/time';
import {
  changeDoseSchema,
  createMedicationSchema,
  logAsNeededSchema,
  logIntakeSchema,
  stopMedicationSchema,
} from '@/lib/validation/medication';
import type { ActionResult } from './meals';

export async function createMedication(
  formData: FormData
): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const parsed = createMedicationSchema.safeParse({
    name: formData.get('name'),
    activeSubstance: formData.get('activeSubstance') ?? '',
    form: formData.get('form') ?? 'tablet',
    category: formData.get('category') ?? 'other',
    scheduleKind: formData.get('scheduleKind') ?? 'daily',
    weekday: formData.get('weekday') ?? '',
    intervalDays: formData.get('intervalDays') ?? '',
    anchorDate: formData.get('anchorDate') ?? '',
    timeOfDay: formData.get('timeOfDay') ?? '08:00',
    doseAmount: formData.get('doseAmount') ?? '',
    doseUnit: formData.get('doseUnit') ?? 'mg',
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe unvollständig',
    };
  }
  const input = parsed.data;

  await db.transaction(async (tx) => {
    const [medication] = await tx
      .insert(medications)
      .values({
        userId: user.id,
        name: input.name,
        activeSubstance: input.activeSubstance ?? null,
        form: input.form,
        category: input.category,
        startedOn: todayLogDate(),
        isActive: true,
        note: input.note ?? null,
      })
      .returning({ id: medications.id });

    const [schedule] = await tx
      .insert(medicationSchedules)
      .values({
        medicationId: medication.id,
        kind: input.scheduleKind,
        weekday: input.weekday ?? null,
        intervalDays: input.intervalDays ?? null,
        anchorDate: input.anchorDate ? input.anchorDate : null,
        validFrom: todayLogDate(),
      })
      .returning({ id: medicationSchedules.id });

    await tx.insert(medicationScheduleDoses).values({
      scheduleId: schedule.id,
      timeOfDay: `${input.timeOfDay}:00`,
      doseAmount: input.doseAmount,
      doseUnit: input.doseUnit,
    });
  });

  revalidatePath('/medications');
  revalidatePath('/');
  return { ok: true };
}

/**
 * Idempotent check-off. The row is created here rather than by a cron, which is
 * why the unique index on (schedule_dose_id, planned_log_date) exists.
 */
export async function logIntake(input: {
  scheduleDoseId: string;
  plannedLogDate: string;
  status: 'taken' | 'skipped';
}): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const parsed = logIntakeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Eingabe ungültig' };

  const [dose] = await db
    .select({
      doseId: medicationScheduleDoses.id,
      doseAmount: medicationScheduleDoses.doseAmount,
      doseUnit: medicationScheduleDoses.doseUnit,
      medicationId: medications.id,
    })
    .from(medicationScheduleDoses)
    .innerJoin(
      medicationSchedules,
      eq(medicationSchedules.id, medicationScheduleDoses.scheduleId)
    )
    .innerJoin(
      medications,
      eq(medications.id, medicationSchedules.medicationId)
    )
    .where(
      and(
        eq(medicationScheduleDoses.id, parsed.data.scheduleDoseId),
        eq(medications.userId, user.id)
      )
    )
    .limit(1);
  if (!dose) return { ok: false, error: 'Dosis nicht gefunden' };

  const takenAt = parsed.data.status === 'taken' ? new Date() : null;

  await db
    .insert(medicationIntakes)
    .values({
      userId: user.id,
      medicationId: dose.medicationId,
      scheduleDoseId: dose.doseId,
      plannedLogDate: parsed.data.plannedLogDate,
      takenAt,
      logDate: parsed.data.plannedLogDate,
      status: parsed.data.status,
      doseAmount: dose.doseAmount,
      doseUnit: dose.doseUnit,
    })
    .onConflictDoUpdate({
      target: [
        medicationIntakes.scheduleDoseId,
        medicationIntakes.plannedLogDate,
      ],
      // intake_planned_uq is a PARTIAL unique index; Postgres can only infer it
      // when the statement repeats the index predicate. Without this the insert
      // fails with 42P10 and checking off a dose never works.
      targetWhere: sql`${medicationIntakes.plannedLogDate} is not null`,
      set: {
        status: parsed.data.status,
        takenAt,
        updatedAt: new Date(),
      },
    });

  revalidatePath('/');
  revalidatePath('/medications');
  return { ok: true };
}

/** Undo a check-off: removes the row so the dose is open again. */
export async function clearIntake(input: {
  scheduleDoseId: string;
  plannedLogDate: string;
}): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  await db
    .delete(medicationIntakes)
    .where(
      and(
        eq(medicationIntakes.userId, user.id),
        eq(medicationIntakes.scheduleDoseId, input.scheduleDoseId),
        eq(medicationIntakes.plannedLogDate, input.plannedLogDate)
      )
    );
  revalidatePath('/');
  revalidatePath('/medications');
  return { ok: true };
}

export async function logAsNeeded(input: {
  medicationId: string;
  doseAmount: string;
  doseUnit: string;
  note?: string | null;
}): Promise<ActionResult> {
  const { user, settings } = await requireUserWithSettings();
  const parsed = logAsNeededSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe ungültig',
    };
  }

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

  const takenAt = new Date();
  await db.insert(medicationIntakes).values({
    userId: user.id,
    medicationId: medication.id,
    scheduleDoseId: null,
    plannedLogDate: null,
    takenAt,
    logDate: toLogDate(takenAt, settings.timeZone, settings.dayStartHour),
    status: 'taken',
    doseAmount: parsed.data.doseAmount,
    doseUnit: parsed.data.doseUnit,
    note: parsed.data.note ?? null,
  });

  revalidatePath('/');
  revalidatePath('/medications');
  return { ok: true };
}

/**
 * A dose change closes the current schedule and opens a new one. Never an
 * in-place edit: MTX 15 -> 20 mg and a cortisone taper are facts about a period
 * of time, and the previous dose is a covariate in the analysis.
 */
export async function changeDose(formData: FormData): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const parsed = changeDoseSchema.safeParse({
    medicationId: formData.get('medicationId'),
    effectiveFrom: formData.get('effectiveFrom'),
    timeOfDay: formData.get('timeOfDay') ?? '08:00',
    doseAmount: formData.get('doseAmount') ?? '',
    doseUnit: formData.get('doseUnit') ?? 'mg',
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Eingabe unvollständig',
    };
  }
  const input = parsed.data;

  const [current] = await db
    .select({
      id: medicationSchedules.id,
      kind: medicationSchedules.kind,
      weekday: medicationSchedules.weekday,
      intervalDays: medicationSchedules.intervalDays,
      anchorDate: medicationSchedules.anchorDate,
    })
    .from(medicationSchedules)
    .innerJoin(
      medications,
      eq(medications.id, medicationSchedules.medicationId)
    )
    .where(
      and(
        eq(medicationSchedules.medicationId, input.medicationId),
        eq(medications.userId, user.id),
        sql`${medicationSchedules.validTo} is null`
      )
    )
    .limit(1);
  if (!current) return { ok: false, error: 'Kein aktives Schema gefunden' };

  await db.transaction(async (tx) => {
    await tx
      .update(medicationSchedules)
      .set({ validTo: input.effectiveFrom })
      .where(eq(medicationSchedules.id, current.id));

    const [next] = await tx
      .insert(medicationSchedules)
      .values({
        medicationId: input.medicationId,
        kind: current.kind,
        weekday: current.weekday,
        intervalDays: current.intervalDays,
        anchorDate: current.anchorDate,
        validFrom: input.effectiveFrom,
      })
      .returning({ id: medicationSchedules.id });

    await tx.insert(medicationScheduleDoses).values({
      scheduleId: next.id,
      timeOfDay: `${input.timeOfDay}:00`,
      doseAmount: input.doseAmount,
      doseUnit: input.doseUnit,
    });
  });

  revalidatePath('/medications');
  revalidatePath('/');
  return { ok: true };
}

export async function stopMedication(
  formData: FormData
): Promise<ActionResult> {
  const { user } = await requireUserWithSettings();
  const parsed = stopMedicationSchema.safeParse({
    medicationId: formData.get('medicationId'),
    endedOn: formData.get('endedOn') ?? todayLogDate(),
  });
  if (!parsed.success) return { ok: false, error: 'Eingabe ungültig' };

  const updated = await db
    .update(medications)
    .set({ isActive: false, endedOn: parsed.data.endedOn })
    .where(
      and(
        eq(medications.id, parsed.data.medicationId),
        eq(medications.userId, user.id)
      )
    )
    .returning({ id: medications.id });
  if (updated.length === 0) {
    return { ok: false, error: 'Medikament nicht gefunden' };
  }

  // Close the open schedule too, so the history stays consistent.
  await db
    .update(medicationSchedules)
    .set({ validTo: parsed.data.endedOn })
    .where(
      and(
        eq(medicationSchedules.medicationId, parsed.data.medicationId),
        sql`${medicationSchedules.validTo} is null`
      )
    );

  revalidatePath('/medications');
  revalidatePath('/');
  return { ok: true };
}
