import { describe, expect, it } from "vitest";

import { shieldPool } from "./combat.js";
import {
  ATTACK_BY_ID,
  DEFENSE_BY_ID,
  MAX_STEAL_PCT,
  MIN_RATE_MULTIPLIER,
} from "./content.js";
import { checkpoint, harvestedAt, potatoesAt, producerCost, rateAt, slowMultiplier } from "./economy.js";
import { P, ms, seconds, type Millis } from "./numbers.js";
import { applyCommand, createMatch, mustApply, opponentView, standings } from "./match.js";
import type { ActiveEffect, Command, MatchState, PlayerState } from "./state.js";

const T0 = ms(1_000_000);

function newMatch(scoring: "total_harvested" | "on_hand" = "total_harvested"): MatchState {
  return createMatch({
    config: { seed: "test-seed", durationMs: seconds(300), scoring },
    startedAt: T0,
    players: [
      { id: "a", name: "Ada" },
      { id: "b", name: "Bo", isBot: true },
    ],
  });
}

/** Hand a player an economy without making them earn it. */
function withFarm(state: MatchState, id: string, producers: PlayerState["producers"]): MatchState {
  return {
    ...state,
    players: { ...state.players, [id]: { ...state.players[id]!, producers } },
  };
}

function at(offsetSeconds: number): Millis {
  return ms(T0 + seconds(offsetSeconds));
}

describe("production integration", () => {
  it("accrues at a constant rate when nothing is happening", () => {
    const s = withFarm(newMatch(), "a", { hand: 10 });
    const p = s.players.a!;
    // 10 farmhands * 1.5/s = 15/s
    expect(rateAt(p, T0)).toBe(15);
    expect(potatoesAt(p, at(60))).toBeCloseTo(900, 6);
  });

  it("integrates piecewise across an effect expiry rather than through it", () => {
    const base = withFarm(newMatch(), "a", { hand: 10 });
    const slow: ActiveEffect = {
      kind: "slow",
      id: "e1",
      source: "b",
      label: "Blight",
      multiplier: 0.5,
      startedAt: T0,
      expiresAt: at(30),
    };
    const p = { ...base.players.a!, effects: [slow] };

    // 30s at 7.5/s, then 30s at 15/s.
    expect(potatoesAt(p, at(60))).toBeCloseTo(225 + 450, 6);
    // Mid-effect the slow is still fully applied.
    expect(potatoesAt(p, at(10))).toBeCloseTo(75, 6);
  });

  it("is unchanged by checkpointing partway through", () => {
    const base = withFarm(newMatch(), "a", { hand: 10, plot: 25 });
    const slow: ActiveEffect = {
      kind: "slow",
      id: "e1",
      source: "b",
      label: "Blight",
      multiplier: 0.4,
      startedAt: T0,
      expiresAt: at(37),
    };
    const p: PlayerState = { ...base.players.a!, effects: [slow] };

    const direct = potatoesAt(p, at(120));
    const viaCheckpoints = [12, 37, 38, 90].reduce<PlayerState>(
      (acc, s) => checkpoint(acc, at(s)),
      p,
    );
    expect(potatoesAt(viaCheckpoints, at(120))).toBeCloseTo(direct, 6);
  });

  it("drops a disabled producer's contribution only while the effect is live", () => {
    const base = withFarm(newMatch(), "a", { hand: 10, tractor: 2 });
    const disable: ActiveEffect = {
      kind: "disable",
      id: "e1",
      source: "b",
      label: "Ruined Soil",
      producer: "tractor",
      startedAt: T0,
      expiresAt: at(20),
    };
    const p: PlayerState = { ...base.players.a!, effects: [disable] };
    expect(rateAt(p, at(10))).toBe(15);
    expect(rateAt(p, at(25))).toBe(15 + 110);
  });
});

describe("costs", () => {
  it("charges the same for a bulk buy as for the same units one at a time", () => {
    const bulk = producerCost("plot", 0, 10);
    let piecemeal = 0;
    for (let i = 0; i < 10; i++) piecemeal += producerCost("plot", i, 1);
    // Bulk rounds once, piecemeal rounds ten times — allow the rounding drift.
    expect(Math.abs(bulk - piecemeal)).toBeLessThanOrEqual(10);
  });

  it("makes repeated sabotage progressively more expensive", () => {
    const s = withFarm(newMatch(), "a", { hand: 10 });
    let state: MatchState = {
      ...s,
      players: { ...s.players, a: { ...s.players.a!, potatoes: P.of(1e9) } },
    };
    const before = state.players.a!.potatoes;
    state = mustApply(state, { type: "attack", player: "a", target: "b", attack: "moles" }, T0);
    const firstCost = before - state.players.a!.potatoes;
    const mid = state.players.a!.potatoes;
    state = mustApply(state, { type: "attack", player: "a", target: "b", attack: "moles" }, T0);
    const secondCost = mid - state.players.a!.potatoes;
    expect(secondCost).toBeGreaterThan(firstCost);
  });
});

describe("attack vs defense", () => {
  function attacker(state: MatchState): MatchState {
    return {
      ...state,
      players: { ...state.players, a: { ...state.players.a!, potatoes: P.of(1e12) } },
    };
  }

  it("fully blocks when the shield pool covers the attack's power", () => {
    let state = attacker(withFarm(newMatch(), "b", { hand: 20 }));
    // Fence absorbs 200; Blight has power 110.
    state = { ...state, players: { ...state.players, b: { ...state.players.b!, potatoes: P.of(1e6) } } };
    state = mustApply(state, { type: "defend", player: "b", defense: "fence" }, T0);
    const res = applyCommand(state, { type: "attack", player: "a", target: "b", attack: "blight" }, T0);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.entries[0]!.text).toContain("fully blocked");
    expect(res.state.players.b!.effects.some((e) => e.kind === "slow")).toBe(false);
  });

  it("scales the effect down instead of negating it when the shield is too small", () => {
    let state = attacker(withFarm(newMatch(), "b", { hand: 20 }));
    state = { ...state, players: { ...state.players, b: { ...state.players.b!, potatoes: P.of(1e6) } } };
    // Scarecrow absorbs 60 vs Drought's power 260 -> ~23% mitigated.
    state = mustApply(state, { type: "defend", player: "b", defense: "scarecrow" }, T0);
    state = mustApply(state, { type: "attack", player: "a", target: "b", attack: "drought" }, T0);

    const slow = state.players.b!.effects.find((e) => e.kind === "slow");
    expect(slow).toBeDefined();
    if (slow?.kind !== "slow") return;
    const droughtEffect = ATTACK_BY_ID.drought.effect;
    if (droughtEffect.kind !== "slow") throw new Error("drought should be a slow");
    const potency = 1 - 60 / 260;
    expect(slow.multiplier).toBeCloseTo(1 - droughtEffect.cut * potency, 6);
  });

  it("spends shield power on what it absorbs, so it can be worn down", () => {
    let state = attacker(withFarm(newMatch(), "b", { hand: 20 }));
    state = { ...state, players: { ...state.players, b: { ...state.players.b!, potatoes: P.of(1e6) } } };
    state = mustApply(state, { type: "defend", player: "b", defense: "fence" }, T0);
    expect(shieldPool(state.players.b!, T0)).toBe(DEFENSE_BY_ID.fence.power);

    state = mustApply(state, { type: "attack", player: "a", target: "b", attack: "blight" }, T0);
    expect(shieldPool(state.players.b!, T0)).toBe(
      DEFENSE_BY_ID.fence.power - ATTACK_BY_ID.blight.power,
    );

    // Second Blight now outmatches what's left, so it gets through.
    state = mustApply(state, { type: "attack", player: "a", target: "b", attack: "blight" }, at(1));
    expect(state.players.b!.effects.some((e) => e.kind === "slow")).toBe(true);
  });

  it("shortens a disable instead of scaling it, since it has no magnitude", () => {
    let state = attacker(withFarm(newMatch(), "b", { hand: 20, tractor: 3 }));
    state = { ...state, players: { ...state.players, b: { ...state.players.b!, potatoes: P.of(1e6) } } };
    state = mustApply(state, { type: "defend", player: "b", defense: "greenhouse" }, T0);
    // Greenhouse 550 vs Ruined Soil 420 would fully block, so chip it down first.
    state = mustApply(state, { type: "attack", player: "a", target: "b", attack: "drought" }, T0);
    state = mustApply(state, { type: "attack", player: "a", target: "b", attack: "soil_rot" }, T0);

    const disable = state.players.b!.effects.find((e) => e.kind === "disable");
    expect(disable).toBeDefined();
    if (disable?.kind !== "disable") return;
    expect(disable.producer).toBe("tractor"); // its biggest earner
    expect(disable.expiresAt - disable.startedAt).toBeLessThan(seconds(40));
    expect(disable.expiresAt).toBeGreaterThan(disable.startedAt);
  });
});

describe("no knockouts", () => {
  it("floors the combined slow multiplier however much sabotage stacks", () => {
    const base = withFarm(newMatch(), "a", { hand: 10 });
    const slows: ActiveEffect[] = Array.from({ length: 12 }, (_, i) => ({
      kind: "slow",
      id: `e${i}`,
      source: "b",
      label: "Blight",
      multiplier: 0.25,
      startedAt: T0,
      expiresAt: at(600),
    }));
    const p = { ...base.players.a!, effects: slows };
    expect(slowMultiplier(p, T0)).toBe(MIN_RATE_MULTIPLIER);
    expect(rateAt(p, T0)).toBeCloseTo(15 * MIN_RATE_MULTIPLIER, 6);
  });

  it("caps a single steal and never claws back lifetime harvested", () => {
    let state = withFarm(newMatch(), "b", { hand: 10 });
    state = {
      ...state,
      players: {
        ...state.players,
        a: { ...state.players.a!, potatoes: P.of(1e9) },
        b: { ...state.players.b!, potatoes: P.of(100_000), harvested: P.of(100_000) },
      },
    };
    const harvestedBefore = harvestedAt(state.players.b!, T0);
    state = mustApply(state, { type: "attack", player: "a", target: "b", attack: "moles" }, T0);

    const b = state.players.b!;
    expect(b.potatoes).toBeGreaterThanOrEqual(100_000 * (1 - MAX_STEAL_PCT));
    expect(b.potatoes).toBeLessThan(100_000);
    expect(harvestedAt(b, T0)).toBeCloseTo(harvestedBefore, 6);
  });
});

describe("commands", () => {
  it("rejects buys you can't afford", () => {
    const res = applyCommand(newMatch(), { type: "buy_producer", player: "a", producer: "plot", qty: 1 }, T0);
    expect(res).toEqual({ ok: false, reason: "Not enough potatoes." });
  });

  it("rejects sabotaging yourself", () => {
    const res = applyCommand(newMatch(), { type: "attack", player: "a", target: "a", attack: "moles" }, T0);
    expect(res.ok).toBe(false);
  });

  it("rejects everything once the clock hits zero", () => {
    const res = applyCommand(newMatch(), { type: "click", player: "a", count: 1 }, at(300));
    expect(res).toEqual({ ok: false, reason: "Match is over." });
  });

  it("clamps a batched click flush", () => {
    const res = applyCommand(newMatch(), { type: "click", player: "a", count: 10_000 }, T0);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.players.a!.potatoes).toBe(25);
  });

  it("gates upgrades behind their producer requirement", () => {
    let state = newMatch();
    state = { ...state, players: { ...state.players, a: { ...state.players.a!, potatoes: P.of(1e9) } } };
    expect(applyCommand(state, { type: "buy_upgrade", player: "a", upgrade: "raised_beds" }, T0).ok).toBe(false);

    state = withFarm(state, "a", { plot: 10 });
    expect(applyCommand(state, { type: "buy_upgrade", player: "a", upgrade: "raised_beds" }, T0).ok).toBe(true);
  });
});

describe("determinism", () => {
  it("replays to identical state from the same seed and command sequence", () => {
    const script: [Command, number][] = [
      [{ type: "click", player: "a", count: 25 }, 0],
      [{ type: "buy_producer", player: "a", producer: "plot", qty: 1 }, 1],
      [{ type: "click", player: "a", count: 25 }, 2],
      [{ type: "attack", player: "a", target: "b", attack: "moles" }, 40],
      [{ type: "defend", player: "a", defense: "scarecrow" }, 41],
    ];
    const run = () => {
      let state = { ...newMatch() };
      state = { ...state, players: { ...state.players, a: { ...state.players.a!, potatoes: P.of(5_000) } } };
      for (const [cmd, offset] of script) state = mustApply(state, cmd, at(offset));
      return state;
    };
    expect(JSON.stringify(run())).toEqual(JSON.stringify(run()));
  });
});

describe("visibility", () => {
  it("exposes only an opponent's count and rate", () => {
    let state = withFarm(newMatch(), "b", { hand: 4 });
    state = mustApply(state, { type: "click", player: "b", count: 5 }, T0);
    const view = opponentView(state, "b", at(10));
    expect(Object.keys(view).sort()).toEqual(["count", "id", "name", "rate"]);
  });

  it("ranks standings by the configured scoring rule", () => {
    let state = withFarm(newMatch("on_hand"), "a", { hand: 10 });
    state = {
      ...state,
      players: { ...state.players, b: { ...state.players.b!, potatoes: P.of(10_000) } },
    };
    expect(standings(state, at(10))[0]!.player.id).toBe("b");
  });

  it("stops the clock at match end", () => {
    const state = withFarm(newMatch(), "a", { hand: 10 });
    const final = standings(state, at(10_000))[0]!.score;
    expect(final).toBeCloseTo(15 * 300, 6);
  });
});
