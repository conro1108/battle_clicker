import { describe, expect, it } from "vitest";

import { format, ms, seconds } from "../numbers.js";
import {
  MAX_MITIGATION,
  MIN_SOIL,
  REPAIR_SECONDS,
  SOLO_PRODUCERS,
  SOLO_REPAIR_COST_FRACTION,
  SOLO_UPGRADES,
  SOLO_UPGRADE_BY_ID,
} from "./content.js";
import {
  currentRate,
  mitigation,
  producerCost,
  producerMultiplier,
  producerRateEach,
  soilLossRate,
  soilRestoreCost,
  totalRepairCost,
} from "./economy.js";
import {
  CONVERGENCE_UPGRADE,
  advance,
  applyFarmCommand,
  convergencePending,
  createFarm,
  pendingSeeds,
} from "./farm.js";
import { parseFarm, resumeFarm, serializeFarm } from "./persist.js";
import { MULT_PER_UNSPENT_SEED, PERKS, seedsFor } from "./prestige.js";
import { FARMER_STYLES, farmerTurn, simulateCadence, simulateFarm } from "./sim.js";
import type { FarmState } from "./state.js";
import { WEATHER_IDS } from "./weather.js";

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
    // There used to be an upper bound here too — the top rung's *base* payback
    // capped at 40,000s, so the top of the tree couldn't be purely decorative.
    // At sixteen rungs the Second Potato's base payback is a hundred hours and
    // it trips, but the proxy is what's broken rather than the ladder: base
    // payback stops predicting affordability once accumulated multipliers reach
    // several hundred. The test below measures the thing that assertion meant.
  });

  /**
   * What the base-payback cap was really asking: can a run that goes the
   * distance actually get to the top of the tree, and is the top of the tree
   * worth having when it does?
   *
   * Measured rather than derived, because the answer depends on every global
   * multiplier bought along the way — by the end of this run the Second Potato
   * is the best value on the board by a wide margin despite a base payback of a
   * hundred hours.
   */
  it("puts the top rung within reach of a long run, and makes it the best buy there", () => {
    const { farm, convergedAt } = simulateCadence({
      seed: "probe",
      days: 8,
      cadence: "heavy",
      style: "keen",
    });
    const top = SOLO_PRODUCERS.at(-1)!;
    const value = (id: (typeof SOLO_PRODUCERS)[number]["id"]) =>
      producerRateEach(farm, id) / producerCost(farm, id, 1);

    console.log(
      `8d heavy: converged=${convergedAt === null ? "never" : (convergedAt / HOUR).toFixed(1) + "h"} ` +
        `owned=${SOLO_PRODUCERS.map((p) => farm.producers[p.id] ?? 0).join("/")} ` +
        `top value=${value(top.id).toExponential(2)}`,
    );

    expect(farm.producers[top.id] ?? 0).toBeGreaterThan(0);
    for (const prod of SOLO_PRODUCERS) {
      if (prod.id === top.id) continue;
      expect(value(top.id)).toBeGreaterThan(value(prod.id));
    }
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

  it("charges real money for the upgrades that lift the whole farm", () => {
    // A permanent multiplier on everything you own should cost something you
    // feel. Priced off the fleet that unlocks it, they drifted into costing
    // twenty seconds of production — you bought Fertilizer, forever, with the
    // change in your pocket. Measured in seconds of current output, which is
    // the only scale on which an early upgrade and a late one are comparable.
    const style = FARMER_STYLES.keen!;
    let farm = createFarm({ seed: "prices", startedAt: ms(0) });
    const paid: { id: string; seconds: number }[] = [];
    let nextDecision = 0;
    for (let t = 0; t < 24 * HOUR; t += 1_000) {
      const dig = applyFarmCommand(farm, { type: "dig", count: style.digsPerSecond }, ms(t));
      if (dig.ok) farm = dig.farm;
      if (t >= nextDecision) {
        nextDecision = t + style.decisionMs;
        for (const cmd of farmerTurn(farm, style)) {
          const rate = currentRate(farm);
          const before = farm.upgrades.length;
          const res = applyFarmCommand(farm, cmd, ms(t));
          if (res.ok) farm = res.farm;
          const id = farm.upgrades.at(-1);
          if (farm.upgrades.length > before && id) {
            const u = SOLO_UPGRADES.find((x) => x.id === id)!;
            if (u.effect.kind === "global_mult") paid.push({ id, seconds: u.cost / rate });
          }
        }
      }
      farm = advance(farm, ms(t + 1_000)).farm;
    }

    expect(paid.length).toBeGreaterThan(0);
    console.log(`globals: ${paid.map((u) => `${u.id}=${u.seconds.toFixed(0)}s`).join(" ")}`);
    for (const { seconds: s } of paid) expect(s).toBeGreaterThan(60);
  });

  /**
   * The same question, asked of the globals the 24-hour bot above never gets
   * near. Those are the ones that had drifted: priced at a flat share of the
   * fleet that unlocks them, the late ones came out at two or three hundred
   * seconds each — so the upgrade that permanently lifts every rung of the
   * ladder at once cost a fraction of the rung you were standing on, and
   * "should I save for this or keep climbing?" had one obvious answer.
   *
   * Measured two ways, because one number can't say it. What each one costs
   * depends on how far along the rest of the farm happens to be when its gate
   * opens, and that swings by a factor of four between seeds — so the *median*
   * is what carries the intent ("a global is half an hour of production"), and
   * the floor is only there to catch one of them falling back into the couple-
   * of-hundred-seconds range the whole set used to sit in.
   *
   * No ceiling on purpose: the Ur-Potato and the Third Potato are deliberately
   * dearer still, and the Convergence test below holds their end of it.
   */
  it("makes every cross-farm multiplier something you stop and save for", () => {
    const style = FARMER_STYLES.keen!;
    let farm = createFarm({ seed: "globals", startedAt: ms(0) });
    const paid: { id: string; seconds: number }[] = [];
    const cadence = { sessionsPerDay: 4, sessionMs: seconds(1_800) };
    const gap = DAY / cadence.sessionsPerDay;

    for (let d = 0; d < 10; d++) {
      for (let s = 0; s < cadence.sessionsPerDay; s++) {
        const start = Math.round(d * DAY + s * gap);
        farm = advance(farm, ms(start), true).farm;
        let nextDecision = start;
        for (let t = start; t < start + cadence.sessionMs; t += 1_000) {
          const dig = applyFarmCommand(farm, { type: "dig", count: style.digsPerSecond }, ms(t));
          if (dig.ok) farm = dig.farm;
          if (t >= nextDecision) {
            nextDecision = t + style.decisionMs;
            for (const cmd of farmerTurn(farm, style)) {
              const rate = currentRate(farm);
              const before = farm.upgrades.length;
              const res = applyFarmCommand(farm, cmd, ms(t));
              if (res.ok) farm = res.farm;
              const id = farm.upgrades.at(-1);
              if (farm.upgrades.length > before && id) {
                const u = SOLO_UPGRADE_BY_ID[id]!;
                if (u.effect.kind === "global_mult") paid.push({ id, seconds: u.cost / rate });
              }
            }
          }
          farm = advance(farm, ms(t + 1_000)).farm;
        }
      }
    }

    console.log(`globals (10d heavy): ${paid.map((u) => `${u.id}=${u.seconds.toFixed(0)}s`).join(" ")}`);
    // The run has to actually get far enough to buy the late ones, or this
    // passes by never measuring them.
    const globals = SOLO_UPGRADES.filter((u) => u.effect.kind === "global_mult");
    expect(paid.length).toBeGreaterThanOrEqual(globals.length - 1);

    const sorted = paid.map((u) => u.seconds).sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeGreaterThan(2_000);
    for (const { id, seconds: s } of paid) expect(s, id).toBeGreaterThan(700);
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

describe("the Convergence", () => {
  /**
   * The binding constraint on the whole endgame: **the fold has to be reachable
   * in a single dedicated run**, on a first save, with no prestige and no seeds.
   * Not something you find out about three generations deep.
   *
   * Measured at a modest check-in cadence with the clock jumped between
   * sessions, so the farm runs unattended and nobody repairs anything in the
   * gaps — which is the only thing separating this from the always-on bot. A
   * week is the outer bound; the design target is day four.
   *
   * Without this guard the next retune quietly breaks the thing the endgame is
   * most specific about, and it would break silently: every other test in this
   * file still passes with the fold three days further away.
   */
  it("is reachable in one playthrough at a modest check-in cadence", () => {
    for (const seed of ["one", "two"]) {
      const run = simulateCadence({ seed, days: 7, cadence: "normal", style: "keen" });
      // What the Ur-Potato actually costs at the moment it's affordable, in the
      // only unit an early upgrade and a late one are comparable in. The other
      // late globals are in the hundreds-to-thousands range; this has to stay
      // there or moving its gate to ten turned it into a giveaway.
      const price = SOLO_UPGRADE_BY_ID.ur_potato!.cost / (run.convergedRate ?? Infinity);
      console.log(
        `${seed}: 3x15min/day converged at ` +
          `${run.convergedAt === null ? "never" : `day ${(run.convergedAt / DAY).toFixed(1)}`} ` +
          `for ${price.toFixed(0)}s of production`,
      );
      expect(run.convergedAt).not.toBeNull();
      expect(run.convergedAt!).toBeLessThan(7 * DAY);
      expect(price).toBeGreaterThan(60);
      // And on a first save: no prestige, no seeds, nothing handed down.
      expect(run.farm.generation).toBe(1);
      expect(run.farm.seeds).toBe(0);
    }
  });

  it("keeps the tiers above the fold out of an unfolded world", () => {
    const farm = developedFarm("gate");
    expect(farm.converged).toBe(false);
    for (const prod of SOLO_PRODUCERS.filter((p) => p.afterFold)) {
      const rich: FarmState = { ...farm, potatoes: 1e30 as never };
      expect(applyFarmCommand(rich, { type: "buy_producer", producer: prod.id, qty: 1 }, rich.checkpointAt).ok)
        .toBe(false);
      expect(applyFarmCommand(
        { ...rich, converged: true },
        { type: "buy_producer", producer: prod.id, qty: 1 },
        rich.checkpointAt,
      ).ok).toBe(true);
    }
  });

  /**
   * What the shop hangs its one piece of tunnel vision on. The window opens on
   * the tenth Tuber Singularity and shuts on the purchase, and nowhere else —
   * a farm that's already folded must not get an empty shop for the rest of
   * the run.
   */
  it("empties the shop only between the gate opening and the purchase", () => {
    const gate = SOLO_UPGRADE_BY_ID[CONVERGENCE_UPGRADE]!.requires!;
    const base = developedFarm("pending");
    const short: FarmState = { ...base, producers: { [gate.producer]: gate.count - 1 } };
    const ready: FarmState = { ...base, producers: { [gate.producer]: gate.count } };

    expect(convergencePending(short)).toBe(false);
    expect(convergencePending(ready)).toBe(true);
    // Bought, and the shop comes back.
    expect(convergencePending({ ...ready, upgrades: [CONVERGENCE_UPGRADE] })).toBe(false);
    expect(convergencePending({ ...ready, converged: true })).toBe(false);
  });

  it("happens to you once, and outlives the farm it happened to", () => {
    const base = developedFarm("fold", 24 * HOUR);
    const folded: FarmState = { ...base, converged: true };
    const res = applyFarmCommand(folded, { type: "prestige" }, folded.checkpointAt);
    expect(res.ok).toBe(true);
    const next = (res as { farm: FarmState }).farm;
    // The run is gone; the world it happened in isn't.
    expect(next.producers).toEqual({});
    expect(next.converged).toBe(true);
  });

  /**
   * ...unless you hand the farm down and ask for the sky. The one door out, and
   * the only thing in the game that puts a permanent flag back.
   */
  it("hands the sky down too, if that's what you asked for", () => {
    const base = developedFarm("sky", 24 * HOUR);
    const folded: FarmState = { ...base, converged: true };
    const res = applyFarmCommand(folded, { type: "prestige", outside: true }, folded.checkpointAt);
    expect(res.ok).toBe(true);
    const next = (res as { farm: FarmState }).farm;
    expect(next.converged).toBe(false);
    // And the world above the fold goes with it: the tiers that farm the inside
    // of the potato are unbuyable again, whatever you can afford.
    const rich: FarmState = { ...next, potatoes: 1e30 as never };
    for (const prod of SOLO_PRODUCERS.filter((p) => p.afterFold)) {
      expect(
        applyFarmCommand(rich, { type: "buy_producer", producer: prod.id, qty: 1 }, rich.checkpointAt).ok,
      ).toBe(false);
    }
    // Which means it's there to climb to again.
    expect(convergencePending({ ...next, producers: { singularity: 10 } })).toBe(true);
  });

  it("has no sky to offer a farm that never folded", () => {
    const base = developedFarm("nofold", 24 * HOUR);
    expect(base.converged).toBe(false);
    const res = applyFarmCommand(base, { type: "prestige", outside: true }, base.checkpointAt);
    expect(res.ok).toBe(true);
    expect((res as { farm: FarmState }).farm.converged).toBe(false);
  });

  it("swaps the weather for the tuber's immune response", () => {
    const base = developedFarm("immune", 2 * HOUR);
    const seen = (f: FarmState) =>
      new Set(advance(f, ms(f.checkpointAt + 6 * HOUR)).events.map((e) => e.id));

    const sky = seen(base);
    const flesh = seen({ ...base, converged: true });
    console.log(`sky=${[...sky].join(",")} flesh=${[...flesh].join(",")}`);

    expect(sky.size).toBeGreaterThan(0);
    expect(flesh.size).toBeGreaterThan(0);
    for (const id of sky) expect(WEATHER_IDS.sky).toContain(id);
    // No hail and no frost inside a potato. There's no sky for them to come
    // out of, which is the point of the swap.
    for (const id of flesh) expect(WEATHER_IDS.flesh).toContain(id);
  });

  /**
   * The Inversion Furrow is the only thing at the top of the ladder that feeds
   * back into the land half, and the reason that half currently stops mattering
   * at four buildings. It has to stack the way a building does — diminishing,
   * under the clamp — or two hundred of them turn the weather off.
   */
  it("lets the ceiling calm the weather without ever stopping it", () => {
    const base: FarmState = { ...developedFarm("calm"), converged: true };
    const few: FarmState = { ...base, producers: { ...base.producers, furrow: 10 } };
    const many: FarmState = { ...base, producers: { ...base.producers, furrow: 400 } };
    expect(mitigation(few, "frequency")).toBeGreaterThan(mitigation(base, "frequency"));
    expect(mitigation(many, "frequency")).toBeGreaterThan(mitigation(few, "frequency"));
    expect(mitigation(many, "frequency")).toBeLessThanOrEqual(MAX_MITIGATION);
  });

  /**
   * The Mantle Tap's wrinkle: its rate scales *with* soil as well as being
   * multiplied by it, so letting the dirt go costs it twice and restoring the
   * dirt is a live decision at the top instead of a rounding error.
   */
  it("makes the Mantle Tap care about the soil twice over", () => {
    const base: FarmState = {
      ...developedFarm("mantle"),
      converged: true,
      producers: { mantle: 10 },
      broken: {},
    };
    const half: FarmState = { ...base, soil: 0.5 };
    const whole = currentRate({ ...base, soil: 1 });
    // A quarter, not a half: once for the farm-wide soil factor and once for
    // the tap's own.
    expect(currentRate(half) / whole).toBeCloseTo(0.25, 6);
    // And the row that sells you the fix has to quote what the fix gives back,
    // which is three quarters here and not the one quarter that `rate * (1 -
    // soil)` would report.
    expect(soilLossRate(half)).toBeCloseTo(whole - currentRate(half), 6);
  });

  it("holds the perks that only make sense inside the potato until it happens", () => {
    const base = developedFarm("perks");
    const rich: FarmState = { ...base, seeds: 1_000_000 };
    for (const perk of PERKS.filter((p) => p.afterFold)) {
      expect(applyFarmCommand(rich, { type: "buy_perk", perk: perk.id }, rich.checkpointAt).ok).toBe(false);
      expect(applyFarmCommand(
        { ...rich, converged: true },
        { type: "buy_perk", perk: perk.id },
        rich.checkpointAt,
      ).ok).toBe(true);
    }
  });
});

describe("dev grant", () => {
  it("pays out where a capped dig can't, and says so in the log", () => {
    const farm = developedFarm("grant");
    const digs = 10_000;
    const res = applyFarmCommand(farm, { type: "dev_grant", digs }, farm.checkpointAt);
    expect(res.ok).toBe(true);
    const next = (res as { farm: FarmState }).farm;

    // A `dig` of the same size is clamped to a flush's worth; this isn't.
    const dug = applyFarmCommand(farm, { type: "dig", count: digs }, farm.checkpointAt);
    expect((dug as { farm: FarmState }).farm.potatoes).toBeLessThan(next.potatoes);

    const entries = (res as { entries: { text: string }[] }).entries;
    expect(entries.some((e) => e.text.startsWith("dev:"))).toBe(true);
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
