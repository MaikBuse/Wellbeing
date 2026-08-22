import { NextResponse } from 'next/server';
import { requireUser } from '@/auth.helpers';
import { latestRun } from '@/db/queries/analysis';
import { loadDaySeries } from '@/services/analysis/loader';
import { ANALYSIS_KIND_SUSPICION } from '@/services/analysis/types';
import { formatGermanNumber } from '@/lib/nutrition';

/**
 * Data export.
 *
 * The content IS health data — that is the point of an export, and the hygiene
 * rule bans logs and committed traces, not a download the user asked for. What
 * this route does owe her:
 *
 *   - `requireUser()` first, like every other read;
 *   - `Cache-Control: no-store`, so no proxy keeps a copy;
 *   - a filename with no diagnosis in it, only a date range.
 *
 * The service worker already caches nothing but immutable public assets, so it
 * will not hold on to this either.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const format = url.searchParams.get('format') ?? 'csv';

  if (format === 'json') {
    const run = await latestRun(user.id, ANALYSIS_KIND_SUSPICION);
    if (!run) {
      return NextResponse.json(
        { error: 'Noch keine Auswertung berechnet.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    // The whole run, including params and the PRNG seed: that is what makes it
    // reproducible rather than merely readable.
    const body = JSON.stringify(
      {
        kind: run.kind,
        rangeFrom: run.rangeFrom,
        rangeTo: run.rangeTo,
        computedAt: run.computedAt,
        durationMs: run.durationMs,
        params: run.params,
        results: run.results,
      },
      null,
      2
    );
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="analyse-${run.rangeFrom}-${run.rangeTo}.json"`,
      },
    });
  }

  const days = url.searchParams.get('days');
  const { range, facts } = await loadDaySeries(user.id, {
    days: days ? Number(days) : undefined,
  });

  const header = [
    'log_date',
    'ra_index',
    'deviation',
    'joint_pain',
    'fatigue',
    'stiffness_score',
    'tender_score',
    'complaints',
    'is_flare',
    'sleep_minutes',
    'sleep_quality',
    'stress',
    'activity_minutes',
    'steroid_mg_pred_eq',
    'cycle_day',
    'cycle_phase',
    'dmard_adherence_7d',
    'tracked',
    'in_protocol',
  ];

  const rows = facts.days.map((day) =>
    [
      day.logDate,
      csvNumber(day.raIndex),
      csvNumber(day.deviation),
      csvNumber(day.raComponents.jointPain ?? null),
      csvNumber(day.raComponents.fatigue ?? null),
      csvNumber(day.raComponents.stiffness ?? null),
      csvNumber(day.raComponents.tenderJoints ?? null),
      csvNumber(day.raComponents.complaints ?? null),
      day.isFlare ? '1' : '0',
      csvNumber(day.sleepMinutes),
      csvNumber(day.sleepQuality),
      csvNumber(day.stress),
      csvNumber(day.activityMinutes),
      csvNumber(day.steroidMgPredEq),
      csvNumber(day.cycleDay),
      day.cyclePhase,
      csvNumber(day.dmardAdherence7d),
      day.isTracked ? '1' : '0',
      day.inProtocol ? '1' : '0',
    ].join(';')
  );

  // Semicolons and a BOM: German Excel opens a comma-separated file as one
  // column, and without the BOM it mangles the umlauts.
  const body = `﻿${[header.join(';'), ...rows].join('\r\n')}\r\n`;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="tagesreihe-${range.from}-${range.to}.csv"`,
    },
  });
}

/** German decimal comma, so the file opens correctly in a German locale. */
function csvNumber(value: number | null): string {
  if (value === null) return '';
  return formatGermanNumber(Math.round(value * 1000) / 1000);
}
