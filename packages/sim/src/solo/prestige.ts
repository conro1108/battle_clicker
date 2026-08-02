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

/**
 * Everything here is priced against `seedsFor`, so the two move together.
 *
 * A dedicated run mints a few hundred seeds and the whole table below the fold
 * costs about 1,700 cumulative — ten-odd hand-downs to finish it, which is the
 * length the meta-game wants. The growth rate is what sets that: at 1.7 the
 * twentieth level of anything costs 40,000x the first, so the top half of every
 * row was decoration nobody was ever going to buy. Shorter rows at 1.4 are the
 * same total spend with every level of it reachable.
 */
export const PERKS: readonly Perk[] = [
  {
    id: "green_thumb",
    name: "Green Thumb",
    blurb: "+15% output per level, forever.",
    baseCost: 3,
    growth: 1.4,
    maxLevel: 12,
  },
  {
    id: "head_start",
    name: "Head Start",
    blurb: "Begin each generation with a bigger stake.",
    baseCost: 2,
    growth: 1.4,
    maxLevel: 12,
  },
  {
    id: "deep_roots",
    name: "Deep Roots",
    blurb: "The land holds together better. Weather takes 8% less per level.",
    baseCost: 4,
    growth: 1.4,
    maxLevel: 12,
  },
  {
    id: "strong_back",
    name: "Strong Back",
    blurb: "Digs are worth 10% more per level.",
    baseCost: 2,
    growth: 1.4,
    // Multiplies the click-from-rate upgrades, so this is the second half of
    // the same feedback loop. Kept to a bit over 2x at full stack.
    maxLevel: 8,
  },
  {
    id: "salvage",
    name: "Salvage Yard",
    blurb: "Repairs cost 10% less per level.",
    baseCost: 4,
    growth: 1.4,
    maxLevel: 8,
  },
  {
    id: "night_shift",
    name: "Night Shift",
    blurb: "+20% production per level while you're away.",
    baseCost: 4,
    growth: 1.4,
    maxLevel: 10,
  },

  // --- Above the fold ------------------------------------------------------
  //
  // A converged run still mints several times what an unconverged one does, and
  // these are what that scale is for: about 9,000 seeds for the row, thirty-odd
  // converged hand-downs, and the only reason to keep giving the farm up once
  // you've folded it. Held to a few times the table above rather than the
  // thousandfold they were first priced at — that pricing assumed the cube root,
  // and fell with it.
  {
    id: "flesh_tithe",
    name: "Flesh Tithe",
    blurb: "The tuber pays rent. +40% output per level, forever.",
    baseCost: 40,
    growth: 1.4,
    maxLevel: 12,
    afterFold: true,
  },
  {
    id: "dormancy",
    name: "Induced Dormancy",
    blurb: "It stirs 10% less often per level.",
    baseCost: 60,
    growth: 1.4,
    maxLevel: 8,
    afterFold: true,
  },
  {
    id: "ur_yield",
    name: "Ur-Yield",
    blurb: "Everything above the fold produces +100% per level.",
    baseCost: 120,
    growth: 1.8,
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
 * Seeds a run is worth. Fourth root, not cube root, and that exponent is the
 * whole tuning.
 *
 * The ladder didn't grow evenly when the fold was added: harvest above the fold
 * runs about a million times a pre-fold run's, so a cube root turned a converged
 * week into 55,000 seeds — a x1,100 output multiplier from the unspent pile
 * alone, handed to a farm that starts again at four potato plots. The second
 * generation wasn't a run, it was a victory lap. A fourth root damps the same
 * span to a few hundred, and damps the run-to-run feedback with it: a generation
 * that harvests 10x more than the last mints only 1.8x the seeds, so the meta
 * layer converges instead of running away.
 *
 * The divisor sets when the first hand-down becomes worth it. 4e14 puts the
 * first seed around day 3 of a multi-day run — close enough to the Convergence
 * that reaching for prestige early costs you one seed, which is what lets the
 * Seeds tab be shown before the fold instead of held until after it.
 */
const SEED_DIVISOR = 4e14;
const SEED_EXPONENT = 1 / 4;

/**
 * `vigor` is a damper, if it's ever used at all. It is deliberately not wired
 * to the Convergence — a converged run already mints several times what an
 * unconverged one does, and paying it a bonus on top would make the perk table
 * it's meant to fund even shorter.
 */
export function seedsFor(lifetimeRunHarvest: Potatoes, vigor = 1): number {
  if (lifetimeRunHarvest <= 0) return 0;
  return Math.floor(Math.pow(lifetimeRunHarvest / SEED_DIVISOR, SEED_EXPONENT) * vigor);
}

/** Potatoes you start a generation with, from Head Start. */
export function headStartPotatoes(level: number): Potatoes {
  if (level <= 0) return P.zero;
  // Roughly "the first few minutes, skipped" — grows fast enough to stay
  // relevant but never enough to buy a tier you haven't earned.
  return P.of(Math.ceil(500 * Math.pow(4, level)));
}
