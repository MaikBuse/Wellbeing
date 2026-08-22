import { z } from 'zod';

/**
 * Only the flags that have a UI. `trackCycle` and `countTraceExposure` exist on
 * user_setting but are not surfaced anywhere yet, so they are deliberately not
 * writable from here.
 */
export const updateSettingsSchema = z.object({
  trackWeight: z.boolean(),
});
