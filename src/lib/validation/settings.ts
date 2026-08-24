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

/** Whether the mascot appears. Cosmetic, and the only flag that is. */
export const updateMascotSchema = z.object({
  showMascot: z.boolean(),
});

/** Whether the figure stands in the corner. Cosmetic in the same way. */
export const updateMascotFigureSchema = z.object({
  showMascotFigure: z.boolean(),
});

/**
 * Which figure stands in the corner. Cosmetic, like the two flags above.
 *
 * The list is restated rather than imported, the way every pgEnum mirror in
 * `nutritionProfile.ts` is — that keeps this directory free of a runtime
 * dependency on `src/components/`. It cannot silently drift either: the insert
 * in `setMascotCharacter` types this against the pgEnum, so a value the .riv
 * cannot draw does not compile.
 */
export const updateMascotCharacterSchema = z.object({
  mascotCharacter: z.enum(['merv', 'orson']),
});
