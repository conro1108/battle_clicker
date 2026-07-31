/**
 * Rates and prices for the homestead. Pure functions of a `FarmState` — nothing
 * here integrates time or mutates anything (see `farm.ts` for that).
 */

import { P, rate as asRate, type Potatoes, type Rate } from "../numbers.js";
import {
  LAND_BY_ID,
  LANDS,
  MAX_MITIGATION,
  MIN_SOIL,
  REPAIR_SECONDS,
  SOIL_RESTORE_SECONDS,
  SOLO_BASE_CLICK,
  SOLO_PRODUCERS,
  SOLO_PRODUCER_BY_ID,
  SOLO_REPAIR_COST_FRACTION,
  SOLO_UPGRADE_BY_ID,
  type LandId,
  type LandRole,
  type SoloProducerId,
  type SoloUpgrade,
} from "./content.js";
import { MULT_PER_UNSPENT_SEED, PERK_BY_ID } from "./prestige.js";
import type { FarmState } from "./state.js";

function ownedUpgrades(f: FarmState): SoloUpgrade[] {
  return f.upgrades.map((id) => SOLO_UPGRADE_BY_ID[id]).filter((u): u is SoloUpgrade => !!u);
}

export function perkLevel(f: FarmState, id: keyof typeof PERK_BY_ID): number {
  return f.perks[id] ?? 0;
}

export function landLevel(f: FarmState, id: LandId): number {
  return f.land[id] ?? 0;
}

/** Everything that scales the whole farm at once: upgrades, seeds, perks, soil. */
export function globalMultiplier(f: FarmState): number {
  let m = 1;
  for (const u of ownedUpgrades(f)) {
    if (u.effect.kind === "global_mult") m *= u.effect.factor;
  }
  m *= 1 + MULT_PER_UNSPENT_SEED * f.seeds;
  m *= 1 + 0.15 * perkLevel(f, "green_thumb");
  m *= 1 + 0.4 * perkLevel(f, "flesh_tithe");
  return m;
}

/** Multiplier on one producer type, before soil. */
export function producerMultiplier(f: FarmState, id: SoloProducerId): number {
  const prod = SOLO_PRODUCER_BY_ID[id];
  let m = globalMultiplier(f);
  for (const u of ownedUpgrades(f)) {
    if (u.effect.kind === "producer_mult" && u.effect.producer === id) m *= u.effect.factor;
  }
  // The Chorus is every farm you ever handed down, still working. Nothing else
  // in the game makes the meta-layer visible in the picture.
  if (prod.generationScaled) m *= f.generation;
  if (prod.afterFold) m *= 1 + perkLevel(f, "ur_yield");
  return m;
}

/**
 * The extra factor of soil the Mantle Tap gets, and that nothing else does.
 *
 * Kept out of `producerMultiplier` on purpose: that function is what
 * `cleanRate` and `repairCost` are quoted against, and both of them mean "with
 * the soil at full health". This is the live-condition half.
 */
function soilScale(f: FarmState, id: SoloProducerId): number {
  return SOLO_PRODUCER_BY_ID[id].soilScaled ? f.soil : 1;
}

/** What one more of `id` would add to the farm's rate, as it stands right now. */
export function producerRateEach(f: FarmState, id: SoloProducerId): number {
  return SOLO_PRODUCER_BY_ID[id].baseRate * producerMultiplier(f, id) * soilScale(f, id) * f.soil;
}

export function workingCount(f: FarmState, id: SoloProducerId): number {
  return Math.max(0, (f.producers[id] ?? 0) - (f.broken[id] ?? 0));
}

export function brokenCount(f: FarmState, id: SoloProducerId): number {
  return Math.min(f.broken[id] ?? 0, f.producers[id] ?? 0);
}

export function producerRate(f: FarmState, id: SoloProducerId): Rate {
  return asRate(
    workingCount(f, id) *
      SOLO_PRODUCER_BY_ID[id].baseRate *
      producerMultiplier(f, id) *
      soilScale(f, id),
  );
}

/**
 * What the farm makes right now. Constant until the next weather event or the
 * next thing you buy — there are no timers in solo, which is the whole reason
 * an arbitrarily long absence resolves exactly.
 */
export function currentRate(f: FarmState): Rate {
  let total = 0;
  for (const prod of SOLO_PRODUCERS) total += producerRate(f, prod.id);
  return asRate(total * f.soil);
}

/** What the farm would make with nothing broken and the soil at full health. */
export function cleanRate(f: FarmState): Rate {
  let total = 0;
  for (const prod of SOLO_PRODUCERS) {
    total += (f.producers[prod.id] ?? 0) * SOLO_PRODUCER_BY_ID[prod.id].baseRate *
      producerMultiplier(f, prod.id);
  }
  return asRate(total);
}

/** Production currently lost to broken kit, per second. */
export function brokenRate(f: FarmState): Rate {
  let total = 0;
  for (const prod of SOLO_PRODUCERS) {
    total += brokenCount(f, prod.id) * prod.baseRate * producerMultiplier(f, prod.id) *
      soilScale(f, prod.id);
  }
  return asRate(total * f.soil);
}

/** Production currently lost to tired soil, per second. */
export function soilLossRate(f: FarmState): Rate {
  let working = 0;
  for (const prod of SOLO_PRODUCERS) working += producerRate(f, prod.id);
  return asRate(working * (1 - f.soil));
}

export function clickYield(f: FarmState): Potatoes {
  let flat = SOLO_BASE_CLICK as number;
  let seconds = 0;
  for (const u of ownedUpgrades(f)) {
    if (u.effect.kind === "click_mult") flat *= u.effect.factor;
    else if (u.effect.kind === "click_from_rate") seconds += u.effect.seconds;
  }
  const back = 1 + 0.1 * perkLevel(f, "strong_back");
  return P.of((flat + seconds * currentRate(f)) * back);
}

// ---------------------------------------------------------------------------
// Weather mitigation
// ---------------------------------------------------------------------------

/**
 * How much of a given kind of weather your land shrugs off, in 0..MAX_MITIGATION.
 * Levels compound with diminishing returns, so the tenth windbreak matters less
 * than the first and no amount of building makes the weather stop.
 */
export function mitigation(f: FarmState, role: LandRole): number {
  let through = 1;
  for (const land of LANDS) {
    if (land.role !== role) continue;
    through *= Math.pow(1 - land.perLevel, landLevel(f, land.id));
  }
  // Deep Roots is a prestige perk, so it stacks on top of whatever you built
  // this generation rather than replacing it.
  if (role === "soil" || role === "breakage") {
    through *= Math.pow(1 - 0.08, perkLevel(f, "deep_roots"));
  }
  if (role === "frequency") {
    // Inversion Furrows, on the same diminishing shape as a building and under
    // the same clamp — two hundred of them must not zero the weather.
    for (const prod of SOLO_PRODUCERS) {
      if (!prod.calmPerUnit) continue;
      through *= Math.pow(1 - prod.calmPerUnit, f.producers[prod.id] ?? 0);
    }
    through *= Math.pow(1 - 0.1, perkLevel(f, "dormancy"));
  }
  return Math.min(MAX_MITIGATION, 1 - through);
}

// ---------------------------------------------------------------------------
// What a farm is allowed to own
// ---------------------------------------------------------------------------
//
// The tiers, buildings and perks above the fold don't exist until the world has
// folded. That's enforced here rather than only in the shop, because the sim is
// the authority on what a farm can be — a hand-edited save shouldn't be able to
// buy a Mantle Tap into a farm with a sky.

export function isProducerAvailable(f: FarmState, id: SoloProducerId): boolean {
  return f.converged || !SOLO_PRODUCER_BY_ID[id].afterFold;
}

export function isLandAvailable(f: FarmState, id: LandId): boolean {
  return f.converged || !LAND_BY_ID[id].afterFold;
}

export function isPerkAvailable(f: FarmState, id: keyof typeof PERK_BY_ID): boolean {
  return f.converged || !PERK_BY_ID[id].afterFold;
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export function producerCost(f: FarmState, id: SoloProducerId, qty = 1): Potatoes {
  const { baseCost, growth } = SOLO_PRODUCER_BY_ID[id];
  const owned = f.producers[id] ?? 0;
  const geometric = (Math.pow(growth, qty) - 1) / (growth - 1);
  return P.of(Math.ceil(baseCost * Math.pow(growth, owned) * geometric));
}

export function landCost(f: FarmState, id: LandId): Potatoes {
  const land = LAND_BY_ID[id];
  return P.of(Math.ceil(land.baseCost * Math.pow(land.growth, landLevel(f, id))));
}

/**
 * What it costs to bring every broken unit of `id` back online.
 *
 * Priced against the production it gives back, not against the cost curve —
 * both ends of that curve give nonsense answers. Priced from the *working*
 * count, a half-wrecked farm buys its capacity back at the rates it paid tiers
 * ago, so getting hit becomes the cheapest production in the game. Priced from
 * the *owned* count, 1.15^200 means putting a fleet back together costs orders
 * of magnitude more than the fleet will ever produce.
 *
 * Charging for the output restored is scale-free and says something legible:
 * damage costs you ten minutes of whatever it took away, at any scale.
 */
export function repairCost(f: FarmState, id: SoloProducerId): Potatoes {
  const broken = brokenCount(f, id);
  if (broken <= 0) return P.zero;
  const restored = broken * SOLO_PRODUCER_BY_ID[id].baseRate * producerMultiplier(f, id);
  const discount = SOLO_REPAIR_COST_FRACTION * Math.pow(0.9, perkLevel(f, "salvage"));
  return P.of(Math.ceil(restored * REPAIR_SECONDS * discount));
}

export function totalRepairCost(f: FarmState): Potatoes {
  let total = 0;
  for (const prod of SOLO_PRODUCERS) total += repairCost(f, prod.id);
  return P.of(total);
}

/**
 * What it costs to put the soil back to full.
 *
 * Priced as "the production those lost points are worth over a fixed window",
 * so it tracks the size of the farm instead of falling behind it. Ignore the
 * land long enough and the bill grows with you — which is the point.
 */
export function soilRestoreCost(f: FarmState): Potatoes {
  const missing = Math.max(0, 1 - f.soil);
  if (missing <= 1e-9) return P.zero;
  return P.of(Math.ceil(cleanRate(f) * missing * SOIL_RESTORE_SECONDS));
}

/** How many of `id` you could buy with `budget`. */
export function affordableCount(f: FarmState, id: SoloProducerId, budget: Potatoes): number {
  let qty = 0;
  while (qty < 5000 && P.gte(budget, producerCost(f, id, qty + 1))) qty++;
  return qty;
}

export function isUnlocked(f: FarmState, u: SoloUpgrade): boolean {
  if (!u.requires) return true;
  return (f.producers[u.requires.producer] ?? 0) >= u.requires.count;
}

export { MIN_SOIL };
