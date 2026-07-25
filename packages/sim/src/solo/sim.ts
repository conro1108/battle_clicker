/**
 * A headless farmer, for tuning.
 *
 * Same job `balance.ts` does for versus: play a whole run with nobody watching
 * so a cost curve can be changed and the consequences read off, instead of
 * guessed at. This player is competent, not optimal — it buys the best value it
 * can see and keeps the place standing, which is roughly what an engaged player
 * does without a spreadsheet.
 */

import { P, ms, type Millis, type Potatoes, type Rate } from "../numbers.js";
import { LANDS, SOLO_PRODUCERS, SOLO_UPGRADES, type SoloProducerId } from "./content.js";
import {
  brokenCount,
  currentRate,
  isUnlocked,
  landCost,
  landLevel,
  producerCost,
  producerMultiplier,
  repairCost,
  soilRestoreCost,
} from "./economy.js";
import { advance, applyFarmCommand, createFarm } from "./farm.js";
import type { FarmCommand, FarmState } from "./state.js";

export interface FarmerStyle {
  /** Digs per second while playing. */
  digsPerSecond: number;
  /** How often the farmer looks at the shop. */
  decisionMs: number;
  /** Share of the pile it will put into repairs in one go. */
  repairBudget: number;
  /** Share of the pile it will put into soil restoration in one go. */
  soilBudget: number;
  /** Share of the pile it will put into mitigation buildings in one go. */
  landBudget: number;
  /** Below this soil health, restoring becomes a priority. */
  soilFloor: number;
}

export const FARMER_STYLES: Record<string, FarmerStyle> = {
  /** Buys growth, patches damage, ignores the land until it bites. */
  keen: {
    digsPerSecond: 2,
    decisionMs: 2_000,
    repairBudget: 0.35,
    soilBudget: 0.35,
    landBudget: 0.15,
    soilFloor: 0.9,
  },
  /** Never builds mitigation. A control group for anything land-related. */
  reckless: {
    digsPerSecond: 2,
    decisionMs: 2_000,
    repairBudget: 0.35,
    soilBudget: 0.35,
    landBudget: 0,
    soilFloor: 0.9,
  },
  /** Doesn't click, checks in rarely. The idle-player shape. */
  absent: {
    digsPerSecond: 0,
    decisionMs: 60_000,
    repairBudget: 0.4,
    soilBudget: 0.4,
    landBudget: 0.2,
    soilFloor: 0.85,
  },
};

/** Production per potato spent — the only ranking that matters when buying. */
function valueOf(f: FarmState, id: SoloProducerId): number {
  const prod = SOLO_PRODUCERS.find((p) => p.id === id)!;
  return (prod.baseRate * producerMultiplier(f, id)) / producerCost(f, id, 1);
}

/** What the farmer would do right now, in priority order. */
export function farmerTurn(f: FarmState, style: FarmerStyle): FarmCommand[] {
  const cmds: FarmCommand[] = [];
  const pile = f.potatoes;

  // Broken kit first: it's the only spend that pays back instantly and in full.
  let best: { id: SoloProducerId; value: number } | null = null;
  for (const prod of SOLO_PRODUCERS) {
    const broken = brokenCount(f, prod.id);
    if (broken <= 0) continue;
    const cost = repairCost(f, prod.id);
    if (cost > pile * style.repairBudget) continue;
    const restored = broken * prod.baseRate * producerMultiplier(f, prod.id);
    const value = restored / cost;
    if (!best || value > best.value) best = { id: prod.id, value };
  }
  if (best) return [{ type: "repair", producer: best.id }];

  const soilBill = soilRestoreCost(f);
  if (f.soil < style.soilFloor && soilBill > 0 && soilBill <= pile * style.soilBudget) {
    return [{ type: "restore_soil" }];
  }

  // Upgrades are flat-priced doublings — always the best buy on the board when
  // they're affordable at all.
  for (const u of SOLO_UPGRADES) {
    if (f.upgrades.includes(u.id) || !isUnlocked(f, u)) continue;
    if (P.gte(pile, u.cost)) return [{ type: "buy_upgrade", upgrade: u.id }];
  }

  if (style.landBudget > 0) {
    for (const land of LANDS) {
      const cost = landCost(f, land.id);
      // Keeps the buildings roughly in step rather than pouring everything into
      // whichever one happens to be cheapest.
      if (landLevel(f, land.id) > 8) continue;
      if (cost <= pile * style.landBudget) return [{ type: "buy_land", land: land.id }];
    }
  }

  let pick: { id: SoloProducerId; value: number } | null = null;
  for (const prod of SOLO_PRODUCERS) {
    if (!P.gte(pile, producerCost(f, prod.id, 1))) continue;
    const value = valueOf(f, prod.id);
    if (!pick || value > pick.value) pick = { id: prod.id, value };
  }
  if (pick) cmds.push({ type: "buy_producer", producer: pick.id, qty: 1 });

  return cmds;
}

export interface FarmSample {
  atSeconds: number;
  rate: Rate;
  harvested: Potatoes;
  soil: number;
  broken: number;
}

export interface FarmRunResult {
  farm: FarmState;
  samples: FarmSample[];
  weatherEvents: number;
  brokeTotal: number;
  soilLost: number;
}

/**
 * Play a farm for `durationMs`.
 *
 * `weather: false` suppresses the schedule entirely, which is how the tests get
 * a control group to measure the weather's cost against.
 */
export function simulateFarm(opts: {
  seed: string;
  durationMs: number;
  style?: keyof typeof FARMER_STYLES | FarmerStyle;
  stepMs?: number;
  sampleEverySeconds?: number;
  weather?: boolean;
}): FarmRunResult {
  const step = opts.stepMs ?? 1_000;
  const sampleEvery = opts.sampleEverySeconds ?? 600;
  const style =
    typeof opts.style === "string"
      ? (FARMER_STYLES[opts.style] ?? FARMER_STYLES.keen!)
      : (opts.style ?? FARMER_STYLES.keen!);

  const startedAt = ms(0);
  let farm = createFarm({ seed: opts.seed, startedAt });
  if (opts.weather === false) farm = { ...farm, nextWeatherAt: ms(Number.POSITIVE_INFINITY) };

  const samples: FarmSample[] = [];
  let weatherEvents = 0;
  let brokeTotal = 0;
  let soilLost = 0;
  let digCarry = 0;
  let nextDecision = 0;

  const apply = (cmd: FarmCommand, t: Millis) => {
    const res = applyFarmCommand(farm, cmd, t);
    if (res.ok) farm = res.farm;
  };

  for (let t = startedAt; t < startedAt + opts.durationMs; t = ms(t + step)) {
    digCarry += (style.digsPerSecond * step) / 1000;
    const digs = Math.floor(digCarry);
    if (digs > 0) {
      digCarry -= digs;
      apply({ type: "dig", count: digs }, t);
    }

    if (t >= nextDecision) {
      nextDecision = t + style.decisionMs;
      for (const cmd of farmerTurn(farm, style)) apply(cmd, t);
    }

    // Nothing bought this step still has to move time forward, or the weather
    // never lands on an idle farm.
    const stepped = advance(farm, ms(t + step));
    farm = stepped.farm;
    weatherEvents += stepped.events.length;
    for (const e of stepped.events) {
      brokeTotal += e.brokeTotal;
      soilLost += e.soilLost;
    }

    const elapsed = (t + step - startedAt) / 1000;
    if (elapsed % sampleEvery === 0) {
      let broken = 0;
      for (const prod of SOLO_PRODUCERS) broken += brokenCount(farm, prod.id);
      samples.push({
        atSeconds: elapsed,
        rate: currentRate(farm),
        harvested: farm.harvested,
        soil: farm.soil,
        broken,
      });
    }
  }

  return { farm, samples, weatherEvents, brokeTotal, soilLost };
}
