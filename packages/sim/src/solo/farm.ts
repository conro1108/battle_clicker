/**
 * The homestead's single authority for time and mutation.
 *
 * `advance` is the only thing that moves a farm forward, and every command runs
 * it first. Because solo has no timed effects, the only thing that can change a
 * rate mid-interval is a weather event — and those land at instants the state
 * already knows. So advancing across ten seconds and advancing across ten days
 * are the same code path, and both are exact.
 */

import { P, ms, type Millis, type Potatoes } from "../numbers.js";
import {
  LAND_BY_ID,
  MAX_SOIL,
  SOLO_PRODUCERS,
  SOLO_PRODUCER_BY_ID,
  SOLO_UPGRADE_BY_ID,
  type SoloProducerId,
} from "./content.js";
import {
  brokenCount,
  clickYield,
  currentRate,
  isUnlocked,
  landCost,
  perkLevel,
  producerCost,
  repairCost,
  soilRestoreCost,
} from "./economy.js";
import { PERK_BY_ID, headStartPotatoes, perkCost, seedsFor } from "./prestige.js";
import type { FarmCommand, FarmLogEntry, FarmResult, FarmState } from "./state.js";
import { fireWeather, scheduleNext, type WeatherEvent } from "./weather.js";

/** Clamp on batched digs, matching the versus mode's flush window. */
export const MAX_DIGS_PER_FLUSH = 25;

/**
 * Ceiling on how many weather events one `advance` will resolve. A year-long
 * absence shouldn't spin for a hundred thousand iterations; past this the
 * remaining schedule is skipped and the farm just keeps producing. Generous
 * enough that no realistic absence hits it.
 */
const MAX_EVENTS_PER_ADVANCE = 20_000;

export function createFarm(opts: { seed: string; startedAt: Millis }): FarmState {
  const farm: FarmState = {
    seed: opts.seed,
    startedAt: opts.startedAt,
    potatoes: P.zero,
    harvested: P.zero,
    checkpointAt: opts.startedAt,
    producers: {},
    broken: {},
    upgrades: [],
    land: {},
    soil: MAX_SOIL,
    weatherIndex: 0,
    nextWeatherAt: opts.startedAt,
    seeds: 0,
    perks: {},
    lifetimeHarvested: P.zero,
    generation: 1,
    runStartedAt: opts.startedAt,
    log: [],
  };
  return { ...farm, nextWeatherAt: scheduleNext(farm, opts.startedAt) };
}

/** Roll the farm forward with no weather in between. */
function integrate(f: FarmState, to: Millis, offline: boolean): FarmState {
  if (to <= f.checkpointAt) return { ...f, checkpointAt: ms(Math.max(f.checkpointAt, to)) };
  // Night Shift is the only thing that distinguishes an hour away from an hour
  // watching, and it only ever pays *more* — being away is never punished for
  // its own sake, only for the weather you weren't there to fix.
  const bonus = offline ? 1 + 0.2 * perkLevel(f, "night_shift") : 1;
  const made = P.of(P.overTime(currentRate(f), to - f.checkpointAt) * bonus);
  return {
    ...f,
    potatoes: P.add(f.potatoes, made),
    harvested: P.add(f.harvested, made),
    lifetimeHarvested: P.add(f.lifetimeHarvested, made),
    checkpointAt: to,
  };
}

export interface AdvanceResult {
  farm: FarmState;
  /** Weather that landed in the interval, oldest first. */
  events: WeatherEvent[];
}

/**
 * Bring a farm up to `to`, resolving every weather event that falls in between.
 *
 * `offline` only affects the Night Shift bonus — the weather does not care
 * whether anyone was watching, which is the point of the mode.
 */
export function advance(f: FarmState, to: Millis, offline = false): AdvanceResult {
  const events: WeatherEvent[] = [];
  let farm = f;
  let guard = 0;

  while (farm.nextWeatherAt <= to && guard++ < MAX_EVENTS_PER_ADVANCE) {
    const at = ms(Math.max(farm.nextWeatherAt, farm.checkpointAt));
    farm = integrate(farm, at, offline);
    const fired = fireWeather(farm, at);
    farm = fired.farm;
    if (fired.event) events.push(fired.event);
  }

  if (farm.nextWeatherAt <= to) {
    // Bailed out on the guard. Push the schedule past `to` so the farm doesn't
    // spend the rest of its life stuck resolving the same backlog.
    farm = { ...farm, nextWeatherAt: scheduleNext(farm, to) };
  }

  farm = integrate(farm, to, offline);
  if (events.length > 0) farm = { ...farm, log: appendLog(farm, events) };
  return { farm, events };
}

/**
 * Monotonic, and deliberately not `log.length` — the feed is trimmed, so a
 * length-based index starts repeating itself the moment it fills up.
 */
function nextLogIndex(f: FarmState): number {
  return (f.log[f.log.length - 1]?.index ?? -1) + 1;
}

function appendLog(f: FarmState, events: WeatherEvent[]): FarmLogEntry[] {
  const base = nextLogIndex(f);
  const entries = events.map((e, i) => ({
    index: base + i,
    at: e.at,
    text: e.text,
    tone: e.tone,
  }));
  // The feed is a ticker, not an archive — a long absence shouldn't leave a
  // thousand entries to scroll past.
  return [...f.log, ...entries].slice(-60);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function fail(reason: string): FarmResult {
  return { ok: false, reason };
}

/**
 * Pure: the same (farm, command, time) always gives the same result. Same
 * contract as the versus `applyCommand`, so this can move behind a server later
 * without touching any game logic.
 */
export function applyFarmCommand(f0: FarmState, cmd: FarmCommand, now: Millis): FarmResult {
  if (now < f0.checkpointAt) return fail("Time moved backwards.");

  const advanced = advance(f0, now);
  let farm = advanced.farm;
  const entries: FarmLogEntry[] = [];
  const at = farm.checkpointAt;

  const note = (text: string, tone: FarmLogEntry["tone"]) => {
    entries.push({ index: nextLogIndex(farm) + entries.length, at, text, tone });
  };

  const spend = (cost: Potatoes): boolean => {
    if (!P.gte(farm.potatoes, cost)) return false;
    farm = { ...farm, potatoes: P.sub(farm.potatoes, cost) };
    return true;
  };

  switch (cmd.type) {
    case "dig": {
      const count = Math.max(0, Math.min(MAX_DIGS_PER_FLUSH, Math.floor(cmd.count)));
      if (count === 0) return fail("Nothing to flush.");
      const gained = P.mul(clickYield(farm), count);
      farm = {
        ...farm,
        potatoes: P.add(farm.potatoes, gained),
        harvested: P.add(farm.harvested, gained),
        lifetimeHarvested: P.add(farm.lifetimeHarvested, gained),
      };
      break;
    }

    case "dev_grant": {
      const digs = Math.max(0, Math.floor(cmd.digs));
      if (digs === 0) return fail("Nothing to grant.");
      const gained = P.mul(clickYield(farm), digs);
      farm = {
        ...farm,
        potatoes: P.add(farm.potatoes, gained),
        harvested: P.add(farm.harvested, gained),
        lifetimeHarvested: P.add(farm.lifetimeHarvested, gained),
      };
      note(`dev: granted ${digs} digs' worth.`, "neutral");
      break;
    }

    case "buy_producer": {
      const producer = SOLO_PRODUCER_BY_ID[cmd.producer];
      if (!producer) return fail("No such producer.");
      const qty = Math.max(1, Math.floor(cmd.qty));
      const cost = producerCost(farm, producer.id, qty);
      if (!spend(cost)) return fail("Not enough potatoes.");
      farm = {
        ...farm,
        producers: { ...farm.producers, [producer.id]: (farm.producers[producer.id] ?? 0) + qty },
      };
      break;
    }

    case "buy_upgrade": {
      const upgrade = SOLO_UPGRADE_BY_ID[cmd.upgrade];
      if (!upgrade) return fail("No such upgrade.");
      if (farm.upgrades.includes(upgrade.id)) return fail("Already owned.");
      if (!isUnlocked(farm, upgrade)) return fail("Not unlocked yet.");
      if (!spend(upgrade.cost)) return fail("Not enough potatoes.");
      farm = { ...farm, upgrades: [...farm.upgrades, upgrade.id] };
      note(`bought ${upgrade.name}.`, "neutral");
      break;
    }

    case "buy_land": {
      const land = LAND_BY_ID[cmd.land];
      if (!land) return fail("No such building.");
      const cost = landCost(farm, land.id);
      if (!spend(cost)) return fail("Not enough potatoes.");
      const level = (farm.land[land.id] ?? 0) + 1;
      farm = { ...farm, land: { ...farm.land, [land.id]: level } };
      note(`built ${land.name} ${romanish(level)}.`, "good");
      break;
    }

    case "repair": {
      const producer = SOLO_PRODUCER_BY_ID[cmd.producer];
      if (!producer) return fail("No such producer.");
      const broken = brokenCount(farm, producer.id);
      if (broken <= 0) return fail("Nothing broken there.");
      const cost = repairCost(farm, producer.id);
      if (!spend(cost)) return fail("Not enough potatoes.");
      farm = { ...farm, broken: { ...farm.broken, [producer.id]: 0 } };
      note(`repaired ${broken}x ${producer.name}.`, "good");
      break;
    }

    case "restore_soil": {
      const cost = soilRestoreCost(farm);
      if (cost <= 0) return fail("The soil is already fine.");
      if (!spend(cost)) return fail("Not enough potatoes.");
      farm = { ...farm, soil: MAX_SOIL };
      note("put the soil right.", "good");
      break;
    }

    case "buy_perk": {
      const perk = PERK_BY_ID[cmd.perk];
      if (!perk) return fail("No such perk.");
      const level = farm.perks[perk.id] ?? 0;
      if (level >= perk.maxLevel) return fail("Already fully grown.");
      const cost = perkCost(perk, level);
      // Seeds spent stop counting toward the output multiplier. That's the
      // whole trade, so it has to come out of the same number.
      if (farm.seeds < cost) return fail("Not enough Heirloom Seed.");
      farm = {
        ...farm,
        seeds: farm.seeds - cost,
        perks: { ...farm.perks, [perk.id]: level + 1 },
      };
      note(`grew ${perk.name} to ${romanish(level + 1)}.`, "good");
      break;
    }

    case "prestige": {
      const earned = seedsFor(farm.harvested);
      if (earned <= 0) return fail("Nothing worth handing down yet.");
      farm = resetForNextGeneration(farm, earned, at);
      note(`handed the farm down. +${earned} Heirloom Seed.`, "good");
      break;
    }
  }

  return { ok: true, farm: { ...farm, log: [...farm.log, ...entries].slice(-60) }, entries };
}

/**
 * Everything a generation earns is wiped except the seeds and what they bought.
 * `lifetimeHarvested` deliberately survives — it's the only number in the game
 * that never goes backwards.
 */
function resetForNextGeneration(f: FarmState, earned: number, at: Millis): FarmState {
  const seeds = f.seeds + earned;
  const next: FarmState = {
    ...f,
    potatoes: P.zero,
    harvested: P.zero,
    checkpointAt: at,
    producers: {},
    broken: {},
    upgrades: [],
    land: {},
    soil: MAX_SOIL,
    weatherIndex: f.weatherIndex,
    seeds,
    generation: f.generation + 1,
    runStartedAt: at,
  };
  const stake = headStartPotatoes(perkLevel(next, "head_start"));
  return {
    ...next,
    potatoes: stake,
    nextWeatherAt: scheduleNext(next, at),
  };
}

/** Level badges, without pretending to be real Roman numerals past a point. */
function romanish(n: number): string {
  const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return numerals[n - 1] ?? String(n);
}

/**
 * The pile at `now`, without advancing anything.
 *
 * For display between ticks only. It extrapolates at the current rate, so it's
 * exact right up until the next weather event and slightly optimistic after —
 * which is why the app still ticks `advance` on a short interval and treats
 * this as a smoothing layer, not as truth.
 */
export function projectedPotatoes(f: FarmState, now: Millis): Potatoes {
  return P.add(f.potatoes, P.overTime(currentRate(f), Math.max(0, now - f.checkpointAt)));
}

export function projectedHarvested(f: FarmState, now: Millis): Potatoes {
  return P.add(f.harvested, P.overTime(currentRate(f), Math.max(0, now - f.checkpointAt)));
}

/** Convenience for tests: apply a command, throw if it was rejected. */
export function mustApplyFarm(f: FarmState, cmd: FarmCommand, now: Millis): FarmState {
  const res = applyFarmCommand(f, cmd, now);
  if (!res.ok) throw new Error(`command rejected: ${res.reason}`);
  return res.farm;
}

/** What a prestige right now would pay. Zero means it isn't worth doing yet. */
export function pendingSeeds(f: FarmState): number {
  return seedsFor(f.harvested);
}

export { SOLO_PRODUCERS, type SoloProducerId };
