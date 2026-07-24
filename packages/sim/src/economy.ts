import {
  BASE_CLICK,
  MIN_RATE_MULTIPLIER,
  REPAIR_COST_FRACTION,
  PRODUCERS,
  PRODUCER_BY_ID,
  UPGRADE_BY_ID,
  type ProducerId,
  type Upgrade,
} from "./content.js";
import { P, ms, rate as asRate, type Millis, type Potatoes, type Rate } from "./numbers.js";
import type { ActiveEffect, PlayerState } from "./state.js";

export function isActive(e: ActiveEffect, t: Millis): boolean {
  return e.startedAt <= t && t < e.expiresAt;
}

function ownedUpgrades(p: PlayerState): Upgrade[] {
  return p.upgrades.map((id) => UPGRADE_BY_ID[id]);
}

/** Multiplier on a single producer type from owned upgrades. */
export function producerMultiplier(p: PlayerState, id: ProducerId): number {
  let m = 1;
  for (const u of ownedUpgrades(p)) {
    if (u.effect.kind === "global_mult") m *= u.effect.factor;
    else if (u.effect.kind === "producer_mult" && u.effect.producer === id) m *= u.effect.factor;
  }
  return m;
}

export function clickYield(p: PlayerState): Potatoes {
  let m = 1;
  for (const u of ownedUpgrades(p)) {
    if (u.effect.kind === "click_mult") m *= u.effect.factor;
  }
  return P.mul(BASE_CLICK, m);
}

/** Units of `id` that are actually turning out potatoes. */
export function workingCount(p: PlayerState, id: ProducerId): number {
  return Math.max(0, (p.producers[id] ?? 0) - (p.broken[id] ?? 0));
}

/** Per-producer contribution, after upgrades and breakage but before slows. */
export function producerRate(p: PlayerState, id: ProducerId): Rate {
  return asRate(workingCount(p, id) * PRODUCER_BY_ID[id].baseRate * producerMultiplier(p, id));
}

/** Rate with no sabotage applied at all — what repairing would get you back to. */
export function cleanRate(p: PlayerState): Rate {
  let total = 0;
  for (const prod of PRODUCERS) {
    total += (p.producers[prod.id] ?? 0) * prod.baseRate * producerMultiplier(p, prod.id);
  }
  return asRate(total);
}

/** Production lost to unrepaired damage, per second. */
export function brokenRate(p: PlayerState): Rate {
  let total = 0;
  for (const prod of PRODUCERS) {
    total +=
      Math.min(p.broken[prod.id] ?? 0, p.producers[prod.id] ?? 0) *
      prod.baseRate *
      producerMultiplier(p, prod.id);
  }
  return asRate(total);
}

/**
 * Combined slow multiplier at `t`, floored so stacked sabotage can never zero
 * a farm out (VISION.md: no knockouts).
 */
export function slowMultiplier(p: PlayerState, t: Millis): number {
  let m = 1;
  for (const e of p.effects) {
    if (e.kind === "slow" && isActive(e, t)) m *= e.multiplier;
  }
  return Math.max(MIN_RATE_MULTIPLIER, m);
}

/** Actual production rate at `t`, everything applied. */
export function rateAt(p: PlayerState, t: Millis): Rate {
  let total = 0;
  for (const prod of PRODUCERS) total += producerRate(p, prod.id);
  return asRate(total * slowMultiplier(p, t));
}

/**
 * Instants between `from` and `to` where this player's rate changes. Only
 * effect expiries can do that — purchases always re-checkpoint — which is
 * exactly why production integrates in closed form.
 */
function rateBoundaries(p: PlayerState, from: Millis, to: Millis): Millis[] {
  const out = new Set<number>();
  for (const e of p.effects) {
    if (e.expiresAt > from && e.expiresAt < to) out.add(e.expiresAt);
  }
  return [...out].sort((a, b) => a - b).map(ms);
}

/** Potatoes produced by this player over [from, to]. */
function produced(p: PlayerState, from: Millis, to: Millis): Potatoes {
  if (to <= from) return P.zero;
  let acc = P.zero;
  let cursor = from;
  for (const boundary of [...rateBoundaries(p, from, to), to]) {
    acc = P.add(acc, P.overTime(rateAt(p, cursor), boundary - cursor));
    cursor = boundary;
  }
  return acc;
}

export function potatoesAt(p: PlayerState, t: Millis): Potatoes {
  return P.add(p.potatoes, produced(p, p.checkpointAt, t));
}

export function harvestedAt(p: PlayerState, t: Millis): Potatoes {
  return P.add(p.harvested, produced(p, p.checkpointAt, t));
}

/**
 * Roll the player forward to `t` and drop anything that's expired. Every
 * mutation goes through this first, so state is always integrated up to the
 * instant of the change.
 */
export function checkpoint(p: PlayerState, t: Millis): PlayerState {
  return {
    ...p,
    potatoes: potatoesAt(p, t),
    harvested: harvestedAt(p, t),
    checkpointAt: t,
    effects: p.effects.filter((e) => isActive(e, t) && (e.kind !== "shield" || e.power > 0)),
  };
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

/** Cost of the next `qty` units when `owned` are already owned. */
export function producerCost(id: ProducerId, owned: number, qty = 1): Potatoes {
  const { baseCost, growth } = PRODUCER_BY_ID[id];
  const geometric = (Math.pow(growth, qty) - 1) / (growth - 1);
  return P.of(Math.ceil(baseCost * Math.pow(growth, owned) * geometric));
}

/** Repeatable actions (sabotage, defense) get pricier each time you use them. */
export function repeatCost(baseCost: Potatoes, growth: number, timesUsed: number): Potatoes {
  return P.of(Math.ceil(baseCost * Math.pow(growth, timesUsed)));
}

/**
 * What it costs to bring every broken unit of `id` back online. Priced off the
 * units you'd be re-buying at your current count, discounted — repairing beats
 * rebuilding, but it's still potatoes that didn't go into growth.
 */
export function repairCost(p: PlayerState, id: ProducerId): Potatoes {
  const broken = Math.min(p.broken[id] ?? 0, p.producers[id] ?? 0);
  if (broken <= 0) return P.zero;
  const gross = producerCost(id, workingCount(p, id), broken);
  return P.of(Math.ceil(gross * REPAIR_COST_FRACTION));
}

/** Total outstanding repair bill across every producer type. */
export function totalRepairCost(p: PlayerState): Potatoes {
  let total = 0;
  for (const prod of PRODUCERS) total += repairCost(p, prod.id);
  return P.of(total);
}

/** How many of `id` the player can afford right now. */
export function affordableCount(p: PlayerState, id: ProducerId, budget: Potatoes): number {
  const owned = p.producers[id] ?? 0;
  let qty = 0;
  while (qty < 1000 && P.gte(budget, producerCost(id, owned, qty + 1))) qty++;
  return qty;
}
