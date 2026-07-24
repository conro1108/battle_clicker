/**
 * The resource is wrapped in a branded type so that swapping f64 for a bignum
 * later touches this file and nothing else. Arithmetic must go through these
 * helpers — that's the whole point of the brand.
 */

export type Potatoes = number & { readonly __brand: "Potatoes" };

/** Milliseconds since epoch, always server time. Never `Date.now()` in sim code. */
export type Millis = number & { readonly __brand: "Millis" };

/** Potatoes per second. */
export type Rate = number & { readonly __brand: "Rate" };

export const P = {
  of: (n: number): Potatoes => n as Potatoes,
  zero: 0 as Potatoes,
  add: (a: Potatoes, b: Potatoes): Potatoes => (a + b) as Potatoes,
  sub: (a: Potatoes, b: Potatoes): Potatoes => (a - b) as Potatoes,
  mul: (a: Potatoes, k: number): Potatoes => (a * k) as Potatoes,
  gte: (a: Potatoes, b: Potatoes): boolean => a >= b,
  max: (a: Potatoes, b: Potatoes): Potatoes => (a > b ? a : b),
  min: (a: Potatoes, b: Potatoes): Potatoes => (a < b ? a : b),
  /** Potatoes produced by running at `rate` for `ms` milliseconds. */
  overTime: (rate: Rate, ms: number): Potatoes => ((rate * ms) / 1000) as Potatoes,
} as const;

export const ms = (n: number): Millis => n as Millis;
export const seconds = (n: number): number => n * 1000;
export const rate = (n: number): Rate => n as Rate;

const SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

/** Idle-game number formatting: 1234567 -> "1.23M". */
export function format(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs < 1000) {
    // Small numbers read better with decimals only when they're fractional.
    return sign + (abs < 10 && abs % 1 !== 0 ? abs.toFixed(1) : Math.floor(abs).toString());
  }
  const tier = Math.min(Math.floor(Math.log10(abs) / 3), SUFFIXES.length - 1);
  const scaled = abs / Math.pow(1000, tier);
  return `${sign}${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${SUFFIXES[tier]}`;
}

export function formatDuration(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
