import { describe, expect, it } from "vitest";

import { format, ms, seconds } from "../numbers.js";
import {
  MIN_SOIL,
  REPAIR_SECONDS,
  SOLO_PRODUCERS,
  SOLO_REPAIR_COST_FRACTION,
} from "./content.js";
import {
  currentRate,
  producerCost,
  producerMultiplier,
  soilLossRate,
  soilRestoreCost,
  totalRepairCost,
} from "./economy.js";
import { advance, applyFarmCommand, pendingSeeds } from "./farm.js";
import { parseFarm, resumeFarm, serializeFarm } from "./persist.js";
import { MULT_PER_UNSPENT_SEED, seedsFor } from "./prestige.js";
import { simulateFarm } from "./sim.js";
import type { FarmState } from "./state.js";

const HOUR = seconds(3_600);
const DAY = HOUR * 24;

/** A farm that's been played long enough to have something worth wrecking. */
function developedFarm(seed = "dev", forMs = HOUR): FarmState {
  return simulateFarm({ seed, durationMs: forMs, style: "keen" }).farm;
}

describe("the ladder", () => {
  it("gets more expensive per potato of output as you climb", () => {
    const paybacks = SOLO_PRODUCERS.map((p) => p.baseCost / p.baseRate);
    for (let i = 1; i < paybacks.length; i++) {
      expect(paybacks[i]!).toBeGreaterThan(paybacks[i - 1]!);
    }
    // The gap between rungs is the pace control for the whole run, so it's
    // worth being specific: the bottom rung pays for itself in seconds, the top
    // one in many hours. Flatten that and the ladder gets cleared
    // in a single sitting.
    expect(paybacks[0]!).toBeLessThan(30);
    expect(paybacks.at(-1)!).toBeGreaterThan(3_000);
    // And never so expensive that the top of the tree is purely decorative.
    expect(paybacks.at(-1)!).toBeLessThan(40_000);
  });

  it("climbs into the upper tiers over a long session", () => {
    const { farm, samples } = simulateFarm({ seed: "climb", durationMs: 8 * HOUR, style: "keen" });
    const reached = SOLO_PRODUCERS.filter((p) => (farm.producers[p.id] ?? 0) > 0).length;
    console.log(
      `8h keen: tiers=${reached}/12 rate=${format(currentRate(farm))}/s ` +
        `harvested=${format(farm.harvested)} soil=${farm.soil.toFixed(2)} ` +
        `seeds worth=${pendingSeeds(farm)}`,
    );
    // With the slower economy, 8 hours of active play should still unlock
    // mid-game tiers, but a full clear now requires multiple days.
    expect(reached).toBeGreaterThanOrEqual(5);
    // Still growing at the end, not parked on a plateau.
    const [last, prior] = [samples.at(-1)!, samples.at(-2)!];
    expect(last.rate).toBeGreaterThan(prior.rate);
  });
});

describe("offline resolution", () => {
  /**
   * The whole architecture rests on this. Weather lands at instants the state
   * already knows, so resolving six hours in one call and resolving it in six
   * hours of one-second steps have to agree — otherwise "come back tomorrow" is
   * a different game from "leave the tab open", and the save file is a lie.
   */
  it("resolves a long gap identically to ticking through it", () => {
    const base = developedFarm("gap");
    const to = ms(base.checkpointAt + 6 * HOUR);

    const oneShot = advance(base, to);

    let ticked = base;
    let tickedEvents = 0;
    for (let t = base.checkpointAt; t < to; t = ms(t + 1_000)) {
      const stepped = advance(ticked, ms(Math.min(t + 1_000, to)));
      ticked = stepped.farm;
      tickedEvents += stepped.events.length;
    }

    expect(tickedEvents).toBe(oneShot.events.length);
    expect(ticked.weatherIndex).toBe(oneShot.farm.weatherIndex);
    expect(ticked.soil).toBeCloseTo(oneShot.farm.soil, 10);
    for (const prod of SOLO_PRODUCERS) {
      expect(ticked.broken[prod.id] ?? 0).toBe(oneShot.farm.broken[prod.id] ?? 0);
    }
    // Potatoes accumulate over 21,600 additions in one case and a handful in
    // the other, so this is float drift, not a modelling difference.
    expect(ticked.potatoes / oneShot.farm.potatoes).toBeCloseTo(1, 6);
  });

  it("survives a week away without being unrecoverable", () => {
    for (const seed of ["a", "b", "c"]) {
      const base = developedFarm(seed);
      const { farm, report } = resumeFarm(base, ms(base.checkpointAt + 7 * DAY));
      expect(report).not.toBeNull();

      // No knockouts, same as versus: the land floors out and the farm keeps
      // turning over however long it's left.
      expect(farm.soil).toBeGreaterThanOrEqual(MIN_SOIL - 1e-9);
      expect(currentRate(farm)).toBeGreaterThan(0);

      // And you can afford to put it right when you get back. A week that
      // leaves you unable to pay your own repair bill is a week that ends the
      // save, which is exactly what "a setback, not a wipe" has to rule out.
      const bill = totalRepairCost(farm) + soilRestoreCost(farm);
      console.log(
        `week away (${seed}): pile=${format(farm.potatoes)} bill=${format(bill)} ` +
          `soil=${farm.soil.toFixed(2)} broke=${report!.brokeTotal}`,
      );
      expect(farm.potatoes).toBeGreaterThan(bill);
    }
  });

  it("reports what happened while you were out", () => {
    const base = developedFarm("report");
    const { report } = resumeFarm(base, ms(base.checkpointAt + 12 * HOUR));
    expect(report!.awayMs).toBe(12 * HOUR);
    expect(report!.earned).toBeGreaterThan(0);
    expect(report!.events.length).toBeGreaterThan(0);
  });

  it("treats a clock that jumped backwards as no time passing", () => {
    const base = developedFarm("clock");
    const { farm, report } = resumeFarm(base, ms(base.checkpointAt - HOUR));
    expect(report).toBeNull();
    expect(farm.potatoes).toBe(base.potatoes);
  });
});

describe("weather", () => {
  it("is a running cost, not a wipe", () => {
    const ratios = ["w1", "w2", "w3"].map((seed) => {
      const withWeather = simulateFarm({ seed, durationMs: 4 * HOUR, style: "keen" });
      const control = simulateFarm({ seed, durationMs: 4 * HOUR, style: "keen", weather: false });
      console.log(
        `${seed}: weathered=${format(withWeather.farm.harvested)} ` +
          `clear=${format(control.farm.harvested)} ` +
          `events=${withWeather.weatherEvents} broke=${withWeather.brokeTotal}`,
      );
      return withWeather.farm.harvested / control.farm.harvested;
    });
    const median = [...ratios].sort((a, b) => a - b)[1]!;
    // It has to actually cost you something, or the land is decoration...
    expect(median).toBeLessThan(0.97);
    // ...and it can't be the dominant term, or growing is beside the point.
    expect(median).toBeGreaterThan(0.35);
  });

  /**
   * Measured on an absence, because that's the only place mitigation can pay.
   * A farmer sitting at the shop repairs everything the moment it breaks, and
   * potatoes spent barely move the harvest curve — spend a third of your income
   * on repairs all session and you finish about a percent behind. So online,
   * land and no land come out the same. Away, nobody is fixing anything, and
   * what you built is the only thing standing between the farm and the floor.
   */
  it("makes building the land worth the potatoes it costs", () => {
    const ratios = ["l1", "l2", "l3"].map((seed) => {
      const base = developedFarm(seed, 2 * HOUR);
      const bare: FarmState = { ...base, land: {} };
      const built: FarmState = {
        ...base,
        land: { windbreak: 6, drainage: 6, pest_control: 4 },
      };
      const away = ms(base.checkpointAt + 2 * HOUR);
      const after = (f: FarmState) => advance(f, away, true).farm;
      const [left, kept] = [after(bare), after(built)];
      console.log(
        `${seed}: bare=${format(currentRate(left))}/s soil=${left.soil.toFixed(2)} ` +
          `built=${format(currentRate(kept))}/s soil=${kept.soil.toFixed(2)}`,
      );
      return currentRate(kept) / currentRate(left);
    });
    const median = [...ratios].sort((a, b) => a - b)[1]!;
    expect(median).toBeGreaterThan(1.5);
  });

  /**
   * Broken kit and tired soil are the same injury billed two ways, so their
   * prices have to stay in the same league. They drifted an order of magnitude
   * apart once — repairs paid for themselves in minutes while the soil bill
   * took two hours, which made restoring soil a button nobody should ever press.
   */
  it("prices fixing the land in the same league as fixing the kit", () => {
    const farm = developedFarm("prices", 2 * HOUR);
    const hurt: FarmState = { ...farm, soil: farm.soil - 0.1 };
    const payback = soilRestoreCost(hurt) / soilLossRate(hurt);
    const repairPayback = REPAIR_SECONDS * SOLO_REPAIR_COST_FRACTION;
    console.log(`soil payback=${Math.round(payback)}s, repair payback=${repairPayback}s`);
    expect(payback).toBeLessThan(2 * repairPayback);
    // And not so cheap that letting the soil go is free.
    expect(payback).toBeGreaterThan(0.5 * repairPayback);
  });

  /**
   * The other half of that: both bills also have to compete with the ladder,
   * because that's what the potatoes would otherwise be spent on. Priced at
   * twenty minutes of payback, restoring soil lost to every producer on the
   * board and the weather's soil half was a tax with no move attached.
   */
  it("prices fixing the land against what else you could buy", () => {
    const farm = developedFarm("versus_ladder", 2 * HOUR);
    const hurt: FarmState = { ...farm, soil: farm.soil - 0.15 };
    const soilPayback = soilRestoreCost(hurt) / soilLossRate(hurt);

    let bestRung = Infinity;
    for (const prod of SOLO_PRODUCERS) {
      const gain = prod.baseRate * producerMultiplier(hurt, prod.id) * hurt.soil;
      bestRung = Math.min(bestRung, producerCost(hurt, prod.id, 1) / gain);
    }
    console.log(`soil payback=${Math.round(soilPayback)}s, best rung=${Math.round(bestRung)}s`);
    expect(soilPayback).toBeLessThan(3 * bestRung);
  });

  it("leaves an idle farm alone until it has something worth wrecking", () => {
    // Ten minutes of a brand-new farm should not be spent watching your four
    // potato plots break.
    const early = simulateFarm({ seed: "grace", durationMs: seconds(600), style: "keen" });
    expect(early.brokeTotal).toBe(0);
  });
});

describe("prestige", () => {
  it("pays more for a bigger run, with sharply diminishing returns", () => {
    expect(seedsFor(1e10 as never)).toBe(1);
    expect(seedsFor(1e13 as never)).toBe(10);
    expect(seedsFor(1e16 as never)).toBe(100);
    // Ten seeds costs a thousand times the harvest of one.
    expect(seedsFor(1e13 as never)).toBeGreaterThan(seedsFor(1e12 as never));
  });

  it("wipes the run, keeps the inheritance, and starts you stronger", () => {
    // With the slower economy, prestige requires more than a few hours of play.
    // 24 hours is a good milestone: the farm should be well into mid-game by
    // then and have accumulated enough to earn a seed.
    const base = developedFarm("prestige", 24 * HOUR);
    const earned = pendingSeeds(base);
    expect(earned).toBeGreaterThan(0);

    const rateBefore = currentRate(base);
    const res = applyFarmCommand(base, { type: "prestige" }, base.checkpointAt);
    expect(res.ok).toBe(true);
    const next = (res as { farm: FarmState }).farm;

    expect(next.seeds).toBe(base.seeds + earned);
    expect(next.generation).toBe(base.generation + 1);
    expect(next.harvested).toBe(0);
    expect(next.soil).toBe(1);
    expect(Object.values(next.producers).reduce((a, b) => a + b, 0)).toBe(0);
    // Lifetime is the one number that never goes backwards.
    expect(next.lifetimeHarvested).toBeGreaterThanOrEqual(base.lifetimeHarvested);
    // And the seeds are worth something on the way back up.
    expect(1 + MULT_PER_UNSPENT_SEED * next.seeds).toBeGreaterThan(1);
    expect(currentRate(next)).toBeLessThan(rateBefore);
  });

  it("refuses a prestige that would pay nothing", () => {
    const fresh = simulateFarm({ seed: "tiny", durationMs: seconds(30), style: "keen" }).farm;
    const res = applyFarmCommand(fresh, { type: "prestige" }, fresh.checkpointAt);
    expect(res.ok).toBe(false);
  });
});

describe("saving", () => {
  it("round-trips a farm exactly", () => {
    const farm = developedFarm("save");
    const restored = parseFarm(serializeFarm(farm, farm.checkpointAt));
    expect(restored).toEqual(farm);
  });

  it("refuses junk rather than throwing", () => {
    expect(parseFarm("not json")).toBeNull();
    expect(parseFarm("{}")).toBeNull();
    expect(parseFarm(JSON.stringify({ version: 999, farm: {} }))).toBeNull();
  });
});
