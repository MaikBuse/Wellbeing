/**
 * A seeded PRNG, because `Math.random` cannot be seeded and a stored analysis
 * run has to be reproducible from `analysis_run.params.seed`.
 *
 * sfc32 with a cyrb128 string->state step: 128 bits of state, ~30 lines, no
 * dependency. mulberry32 was the obvious smaller choice and was rejected — its
 * 32-bit state gives a period of 2^32, and a full analysis run draws on the
 * order of 10^7-10^8 numbers, which is uncomfortably close to wrapping.
 */

/** Hash a string into four 32-bit words. */
export function seedFromString(seed: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  return [
    (h3 ^ (h1 >>> 18)) >>> 0,
    (h4 ^ (h2 >>> 22)) >>> 0,
    (h1 ^ (h3 >>> 17)) >>> 0,
    (h2 ^ (h4 >>> 19)) >>> 0,
  ];
}

export type Rng = () => number;

/** Uniform in [0, 1). */
export function sfc32(seed: string): Rng {
  let [a, b, c, d] = seedFromString(seed);
  return function next(): number {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Uniform integer in [0, maxExclusive). */
export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

/**
 * A geometric draw with the given expected value, at least 1.
 *
 * This is what makes the block bootstrap *stationary*: with fixed-length
 * blocks the resample distribution depends on where the block boundaries
 * happen to fall, which is an artefact of the algorithm rather than of the
 * data.
 */
export function geometricLength(rng: Rng, expected: number): number {
  if (expected <= 1) return 1;
  const p = 1 / expected;
  const u = Math.max(rng(), Number.MIN_VALUE);
  return Math.max(1, Math.ceil(Math.log(u) / Math.log(1 - p)));
}
