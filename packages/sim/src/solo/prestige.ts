/**
 * Handing the farm down.
 *
 * A run eventually stalls: every tier costs 1.15^n and the top of the ladder is
 * finite. Prestige is what makes the game endless — you give the farm up, keep
 * an Heirloom Seed for every order of magnitude you managed, and start again
 * permanently better.
 *
 * Seeds do double duty on purpose. Unspent, they multiply your output; spent,
 * they buy perks. So the meta-layer has the same shape as the moment-to-moment
 * game: one pool, competing uses.
 */

import { P, type Potatoes } from "../numbers.js";

export type PerkId =
  | "green_thumb"
  | "head_start"
  | "deep_roots"
  | "strong_back"
  | "salvage"
  | "night_shift"
  | "flesh_tithe"
  | "dormancy"
  | "ur_yield";

export interface Perk {
  id: PerkId;
  name: string;
  blurb: string;
  /** Seeds for the first level; each level after costs growth^level. */
  baseCost: number;
  growth: number;
  maxLevel: number;
  /** Only makes sense inside the potato, and priced at inside-the-potato prices. */
  afterFold?: boolean;
}

export const PERKS: readonly Perk[] = [
  {
    id: "green_thumb",
    name: "Green Thumb",
    blurb: "+15% output per level, forever.",
    baseCost: 3,
    growth: 1.7,
    maxLevel: 20,
  },
  {
    id: "head_start",
    name: "Head Start",
    blurb: "Begin each generation with a bigger stake.",
    baseCost: 2,
    growth: 1.6,
    maxLevel: 20,
  },
  {
    id: "deep_roots",
    name: "Deep Roots",
    blurb: "The land holds together better. Weather takes 8% less per level.",
    baseCost: 5,
    growth: 1.8,
    maxLevel: 12,
  },
  {
    id: "strong_back",
    name: "Strong Back",
    blurb: "Digs are worth 10% more per level.",
    baseCost: 2,
    growth: 1.5,
    // Multiplies the click-from-rate upgrades, so this is the second half of
    // the same feedback loop. Kept to a bit over 2x at full stack.
    maxLevel: 8,
  },
  {
    id: "salvage",
    name: "Salvage Yard",
    blurb: "Repairs cost 10% less per level.",
    baseCost: 4,
    growth: 1.7,
    maxLevel: 8,
  },
  {
    id: "night_shift",
    name: "Night Shift",
    blurb: "+20% production per level while you're away.",
    baseCost: 4,
    growth: 1.7,
    maxLevel: 10,
  },

  // --- Above the fold ------------------------------------------------------
  //
  // A converged run mints roughly 37x the seeds of an unconverged one, because
  // harvest goes up ~52,000x and the cube root of that is 37. Against the table
  // above, that turns a hundred-run perk meta-game into about three. The fix is
  // not to hand out fewer seeds — `seedsFor`'s unused `vigor` parameter was
  // going to be a *reward* for converging, which would have made it worse — but
  // to give the new scale something to buy. These are priced against what an
  // inside-the-potato run actually earns, and they're the only reason to keep
  // handing the farm down once you've folded it.
  {
    id: "flesh_tithe",
    name: "Flesh Tithe",
    blurb: "The tuber pays rent. +40% output per level, forever.",
    baseCost: 4_000,
    growth: 1.7,
    maxLevel: 12,
    afterFold: true,
  },
  {
    id: "dormancy",
    name: "Induced Dormancy",
    blurb: "It stirs 10% less often per level.",
    baseCost: 6_000,
    growth: 1.8,
    maxLevel: 8,
    afterFold: true,
  },
  {
    id: "ur_yield",
    name: "Ur-Yield",
    blurb: "Everything above the fold produces +100% per level.",
    baseCost: 12_000,
    growth: 2.2,
    maxLevel: 4,
    afterFold: true,
  },
];

export const PERK_BY_ID: Record<PerkId, Perk> = Object.fromEntries(
  PERKS.map((p) => [p.id, p]),
) as Record<PerkId, Perk>;

export function perkCost(perk: Perk, level: number): number {
  return Math.ceil(perk.baseCost * Math.pow(perk.growth, level));
}

/** Output multiplier from every seed you chose not to spend. */
export const MULT_PER_UNSPENT_SEED = 0.02;

/**
 * Seeds a run is worth. Cube root, so each seed costs ~3x the harvest of the
 * one before it — the standard idle-game shape, and the reason a prestige is
 * always eventually worth doing but never worth doing immediately.
 *
 * The divisor sets when the first hand-down becomes worth it. Calibrated for
 * the slower economy: a 24-hour run accumulates roughly billions, so 1e10 puts
 * the first seed at around that mark and leaves the first prestige landing
 * naturally in day 1-2 of a multi-day run.
 *
 * That's a day or two *before* the world would have folded, which is why the
 * Seeds tab is held until the Convergence rather than revealed the moment this
 * pays out. Nothing here gates the fold, and nothing should: the first run is
 * for the fold, and seeds are for the runs after it.
 */
const SEED_DIVISOR = 1e10;

/**
 * `vigor` is a damper, if it's ever used at all. It is deliberately not wired
 * to the Convergence — a converged run already mints ~37x, and paying it a
 * bonus on top would make the perk table it's meant to fund even shorter.
 */
export function seedsFor(lifetimeRunHarvest: Potatoes, vigor = 1): number {
  if (lifetimeRunHarvest <= 0) return 0;
  return Math.floor(Math.cbrt(lifetimeRunHarvest / SEED_DIVISOR) * vigor);
}

/** Potatoes you start a generation with, from Head Start. */
export function headStartPotatoes(level: number): Potatoes {
  if (level <= 0) return P.zero;
  // Roughly "the first few minutes, skipped" — grows fast enough to stay
  // relevant but never enough to buy a tier you haven't earned.
  return P.of(Math.ceil(500 * Math.pow(4, level)));
}
