/**
 * Run the analysis for one user from the command line.
 *
 * For development and for eyeballing a real result without clicking through the
 * app. Needs DATABASE_URL:
 *
 *   npx tsx src/db/scripts/run-analysis.ts --sub <zitadel-sub>
 *   npx tsx src/db/scripts/run-analysis.ts --sub <sub> --from 2026-01-01 --to 2026-06-30
 *
 * By default it prints only counts. Factor labels are diagnosis-adjacent
 * statements about a real person, so they need `--print-findings` and that flag
 * is for a local machine only — the same posture as `dev-session.ts`, which is
 * not a bypass and stays that way.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { appUsers } from '@/db/schema';
import { runAnalysisForUser } from '@/services/analysis/loader';
import type { LogDate } from '@/lib/time';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const sub = arg('sub');
const from = arg('from') as LogDate | undefined;
const to = arg('to') as LogDate | undefined;
const printFindings = process.argv.includes('--print-findings');

if (!sub) {
  console.error('Usage: run-analysis.ts --sub <zitadel-sub> [--from …] [--to …]');
  process.exit(1);
}

const [user] = await db
  .select({ id: appUsers.id })
  .from(appUsers)
  .where(eq(appUsers.zitadelSub, sub))
  .limit(1);

if (!user) {
  console.error('No such user.');
  process.exit(1);
}

const { runId, params, findings, durationMs } = await runAnalysisForUser(user.id, {
  from,
  to,
});

const tested = findings.filter((f) => f.status === 'tested');
const clear = findings.filter((f) => f.label === 'clear');
const possible = findings.filter((f) => f.label === 'possible');

console.log({
  runId,
  range: params.range,
  durationMs,
  blockLength: params.bootstrap.expectedBlockLength,
  counts: params.counts,
  findings: findings.length,
  tested: tested.length,
  clear: clear.length,
  possible: possible.length,
});

if (printFindings) {
  for (const finding of [...tested].sort((a, b) => b.sortScore - a.sortScore)) {
    console.log(
      [
        finding.label.padEnd(10),
        finding.key.padEnd(24),
        finding.model === 'meal_reaction' ? 'Mahlzeit' : 'Folgetag',
        finding.effect
          ? `${finding.effect.point.toFixed(2)} [${finding.effect.ciLow.toFixed(2)}, ${finding.effect.ciHigh.toFixed(2)}]`
          : '-',
        `q=${finding.qValue?.toFixed(3) ?? '-'}`,
        `n=${finding.exposed.n}/${finding.unexposed.n}`,
      ].join('  ')
    );
  }
}

process.exit(0);
