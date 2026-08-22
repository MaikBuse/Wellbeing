/**
 * Benjamini-Hochberg step-up.
 *
 * Controls the false-discovery rate: of the findings we call notable, roughly
 * `alpha` of them are expected to be chance. That is the honest framing for a
 * screen whose consequence is "try eliminating this for three weeks", and it is
 * what the reported q-value means.
 *
 * `m` must be the number of hypotheses ACTUALLY TESTED. Counting tags that
 * failed a case-count gate would inflate the correction with hypotheses that
 * could not possibly have produced a discovery, and would quietly bury the real
 * ones. This is the detail people get wrong in both directions, so it is
 * asserted by a test.
 */
export type FdrResult = {
  qValues: number[];
  rejected: boolean[];
  m: number;
};

export function benjaminiHochberg(
  pValues: readonly number[],
  alpha: number
): FdrResult {
  const m = pValues.length;
  if (m === 0) return { qValues: [], rejected: [], m: 0 };

  const order = pValues
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p - b.p);

  // Step-up with monotonicity enforced: q_i = min over j >= i of (m * p_j / j).
  const qSorted = new Array<number>(m);
  let running = Number.POSITIVE_INFINITY;
  for (let k = m - 1; k >= 0; k--) {
    const raw = (m * order[k].p) / (k + 1);
    running = Math.min(running, raw);
    qSorted[k] = Math.min(1, running);
  }

  const qValues = new Array<number>(m);
  const rejected = new Array<boolean>(m);
  for (let k = 0; k < m; k++) {
    qValues[order[k].i] = qSorted[k];
    rejected[order[k].i] = qSorted[k] <= alpha;
  }

  return { qValues, rejected, m };
}
