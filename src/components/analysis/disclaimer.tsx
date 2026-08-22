import { Info } from 'lucide-react';
import {
  CORRELATION_NOTICE,
  NOT_A_DIAGNOSIS,
} from '@/services/analysis/labels';

/**
 * The standing notice. Present on every analysis screen, never softened.
 *
 * The README is explicit that this app shows statistical association and makes
 * no diagnosis, and the whole point of the wording rules is that a reader should
 * not be able to come away thinking otherwise.
 */
export function AnalysisDisclaimer() {
  return (
    <p className="flex gap-2 px-1 text-xs text-muted">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        <strong className="font-semibold text-fg">{CORRELATION_NOTICE}</strong>{' '}
        {NOT_A_DIAGNOSIS}
      </span>
    </p>
  );
}
