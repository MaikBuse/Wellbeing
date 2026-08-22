import { Card } from '@/components/ui/card';
import { GLOBAL_GATES, reliability, gate } from '@/services/analysis/gates';
import { DATA_BASIS_NOTICE, formatDataBasis } from '@/services/analysis/labels';
import { ReliabilityMeter } from './reliability-meter';

/**
 * The overall data basis, above everything it qualifies.
 *
 * This is the part that answers "communicate the situation": she sees how much
 * history the numbers rest on before reading a single row, rather than
 * discovering it factor by factor.
 *
 * Derived from the counts that are already stored plus the `GLOBAL_GATES`
 * constant, so it needs no addition to the run schema.
 */
export function DataBasisBanner({
  trackedDays,
  daysWithRaIndex,
}: {
  trackedDays: number;
  daysWithRaIndex: number;
}) {
  const gates = [
    gate('trackedDays', trackedDays, GLOBAL_GATES.trackedDays),
    gate('daysWithRaIndex', daysWithRaIndex, GLOBAL_GATES.daysWithRaIndex),
  ];
  const { level } = reliability(gates);

  return (
    <Card variant="sunken" className="space-y-1.5">
      <p className="text-sm font-medium text-fg">
        {formatDataBasis(trackedDays, GLOBAL_GATES.trackedDays)}
      </p>
      <ReliabilityMeter level={level} />
      <p className="text-xs text-muted">{DATA_BASIS_NOTICE}</p>
    </Card>
  );
}
