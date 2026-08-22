import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  medicationIntakes,
  medicationScheduleDoses,
  medicationSchedules,
  medications,
} from '../schema';
import type { Schedule } from '@/services/medication/schedule';
import type { LogDate } from '@/lib/time';

/** Active schedules with their doses, shaped for expandDueDoses(). */
export async function activeSchedules(
  userId: string,
  logDate: LogDate
): Promise<{
  schedules: Schedule[];
  medicationNames: Map<
    string,
    { name: string; activeSubstance: string | null }
  >;
}> {
  const rows = await db
    .select({
      scheduleId: medicationSchedules.id,
      medicationId: medications.id,
      medicationName: medications.name,
      activeSubstance: medications.activeSubstance,
      kind: medicationSchedules.kind,
      weekday: medicationSchedules.weekday,
      intervalDays: medicationSchedules.intervalDays,
      anchorDate: medicationSchedules.anchorDate,
      validFrom: medicationSchedules.validFrom,
      validTo: medicationSchedules.validTo,
      doseId: medicationScheduleDoses.id,
      timeOfDay: medicationScheduleDoses.timeOfDay,
      doseAmount: medicationScheduleDoses.doseAmount,
      doseUnit: medicationScheduleDoses.doseUnit,
      sortOrder: medicationScheduleDoses.sortOrder,
    })
    .from(medicationSchedules)
    .innerJoin(
      medications,
      eq(medications.id, medicationSchedules.medicationId)
    )
    .innerJoin(
      medicationScheduleDoses,
      eq(medicationScheduleDoses.scheduleId, medicationSchedules.id)
    )
    .where(
      and(
        eq(medications.userId, userId),
        eq(medications.isActive, true),
        sql`${medicationSchedules.validFrom} <= ${logDate}`,
        or(
          isNull(medicationSchedules.validTo),
          sql`${medicationSchedules.validTo} >= ${logDate}`
        )
      )
    )
    .orderBy(asc(medicationScheduleDoses.timeOfDay));

  const byId = new Map<string, Schedule>();
  const names = new Map<
    string,
    { name: string; activeSubstance: string | null }
  >();

  for (const row of rows) {
    names.set(row.medicationId, {
      name: row.medicationName,
      activeSubstance: row.activeSubstance,
    });
    let schedule = byId.get(row.scheduleId);
    if (!schedule) {
      schedule = {
        id: row.scheduleId,
        medicationId: row.medicationId,
        kind: row.kind,
        weekday: row.weekday,
        intervalDays: row.intervalDays,
        anchorDate: row.anchorDate,
        validFrom: row.validFrom,
        validTo: row.validTo,
        doses: [],
      };
      byId.set(row.scheduleId, schedule);
    }
    schedule.doses.push({
      id: row.doseId,
      timeOfDay: row.timeOfDay,
      doseAmount: row.doseAmount,
      doseUnit: row.doseUnit,
      sortOrder: row.sortOrder,
    });
  }

  return { schedules: [...byId.values()], medicationNames: names };
}

export async function intakesForDay(userId: string, logDate: LogDate) {
  return db
    .select({
      id: medicationIntakes.id,
      medicationId: medicationIntakes.medicationId,
      medicationName: medications.name,
      scheduleDoseId: medicationIntakes.scheduleDoseId,
      plannedLogDate: medicationIntakes.plannedLogDate,
      takenAt: medicationIntakes.takenAt,
      status: medicationIntakes.status,
      doseAmount: medicationIntakes.doseAmount,
      doseUnit: medicationIntakes.doseUnit,
      note: medicationIntakes.note,
    })
    .from(medicationIntakes)
    .innerJoin(medications, eq(medications.id, medicationIntakes.medicationId))
    .where(
      and(
        eq(medicationIntakes.userId, userId),
        eq(medicationIntakes.logDate, logDate)
      )
    );
}

/** Medications taken as needed, listed separately — never "due". */
export async function asNeededMedications(userId: string) {
  return db
    .selectDistinctOn([medications.id], {
      id: medications.id,
      name: medications.name,
      activeSubstance: medications.activeSubstance,
      doseAmount: medicationScheduleDoses.doseAmount,
      doseUnit: medicationScheduleDoses.doseUnit,
    })
    .from(medications)
    .innerJoin(
      medicationSchedules,
      eq(medicationSchedules.medicationId, medications.id)
    )
    .innerJoin(
      medicationScheduleDoses,
      eq(medicationScheduleDoses.scheduleId, medicationSchedules.id)
    )
    .where(
      and(
        eq(medications.userId, userId),
        eq(medications.isActive, true),
        eq(medicationSchedules.kind, 'as_needed')
      )
    )
    .orderBy(asc(medications.id));
}

export async function listMedications(userId: string) {
  const rows = await db
    .select({
      id: medications.id,
      name: medications.name,
      activeSubstance: medications.activeSubstance,
      form: medications.form,
      category: medications.category,
      isActive: medications.isActive,
      endedOn: medications.endedOn,
      scheduleId: medicationSchedules.id,
      kind: medicationSchedules.kind,
      weekday: medicationSchedules.weekday,
      intervalDays: medicationSchedules.intervalDays,
      validFrom: medicationSchedules.validFrom,
      validTo: medicationSchedules.validTo,
      doseAmount: medicationScheduleDoses.doseAmount,
      doseUnit: medicationScheduleDoses.doseUnit,
      timeOfDay: medicationScheduleDoses.timeOfDay,
    })
    .from(medications)
    .leftJoin(
      medicationSchedules,
      and(
        eq(medicationSchedules.medicationId, medications.id),
        isNull(medicationSchedules.validTo)
      )
    )
    .leftJoin(
      medicationScheduleDoses,
      eq(medicationScheduleDoses.scheduleId, medicationSchedules.id)
    )
    .where(eq(medications.userId, userId))
    .orderBy(asc(medications.name));

  return rows;
}
