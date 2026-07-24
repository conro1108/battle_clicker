/**
 * Deterministic PRNG keyed on `matchSeed + eventIndex`, so any roll a match
 * makes can be recomputed from the event log rather than stored. Nothing in
 * the sim may call Math.random().
 */

function hash(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 */
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number;
}

export function rngFor(matchSeed: string, eventIndex: number): Rng {
  const next = mulberry32(hash(`${matchSeed}:${eventIndex}`));
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
  };
}
