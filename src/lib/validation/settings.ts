import { z } from 'zod';

/**
 * Only the flags that have a UI.
 *
 * `trackCycle` still has none and is deliberately not writable here; the cycle
 * section is shown whenever it is true, which is the default.
 */
export const updateSettingsSchema = z.object({
  trackWeight: z.boolean(),
});

/**
 * Whether 'trace' tag assignments count as exposure.
 *
 * This one is not cosmetic: it goes into `analysis_run.params`, so flipping it
 * makes the stored run answer a different question. Two runs with different
 * values are not comparable, and the UI has to say so.
 */
export const updateTraceExposureSchema = z.object({
  countTraceExposure: z.boolean(),
});
