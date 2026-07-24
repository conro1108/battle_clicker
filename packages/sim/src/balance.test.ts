import { describe, expect, it } from "vitest";

import { simulateMatch } from "./balance.js";
import { format, seconds } from "./numbers.js";

const SEEDS = ["s1", "s2", "s3", "s4", "s5"];

function fiveMinuteMatch(seed: string) {
  return simulateMatch({
    seed,
    durationMs: seconds(300),
    players: [
      { id: "p1", name: "P1", profile: "scrappy" },
      { id: "p2", name: "P2", profile: "nasty" },
    ],
  });
}

describe("match pacing", () => {
  it("keeps both farms growing for the whole match", () => {
    for (const seed of SEEDS) {
      const result = fiveMinuteMatch(seed);
      for (const id of ["p1", "p2"]) {
        expect(result.finalScores[id]!).toBeGreaterThan(0);
        expect(Number.isFinite(result.finalScores[id]!)).toBe(true);
      }
      // Nobody should be flatlined at the buzzer — that would be a knockout.
      const last = result.samples.at(-1)!;
      for (const id of ["p1", "p2"]) expect(last.rates[id]!).toBeGreaterThan(0);
    }
  });

  it("is still growing in the last minute rather than decided early", () => {
    const result = fiveMinuteMatch("s1");
    const at120 = result.samples.find((s) => s.atSeconds === 120)!;
    const at270 = result.samples.find((s) => s.atSeconds === 270)!;
    // Late-match rate should still be climbing meaningfully.
    expect(at270.rates.p1! + at270.rates.p2!).toBeGreaterThan(
      2 * (at120.rates.p1! + at120.rates.p2!),
    );
  });

  it("produces contested matches rather than one profile always running away", () => {
    const margins = SEEDS.map((seed) => {
      const r = fiveMinuteMatch(seed);
      const [hi, lo] = [r.finalScores.p1!, r.finalScores.p2!].sort((a, b) => b - a);
      return hi! / Math.max(1, lo!);
    });
    // Loose guard rail: a 20x blowout every single seed would mean the
    // aggression knob is doing something badly wrong.
    expect(Math.min(...margins)).toBeLessThan(20);
  });

  it("actually exercises sabotage and defense", () => {
    const result = fiveMinuteMatch("s2");
    expect(result.attacksLanded + result.attacksBlocked).toBeGreaterThan(0);
    expect(result.defensesBought).toBeGreaterThan(0);
  });

  /**
   * The central question of the whole design: is reaching across the board ever
   * worth the potatoes you didn't spend on yourself? If pure growth wins by a
   * mile, sabotage is decoration and there's no second axis. If sabotage wins by
   * a mile, growth is a tax you pay before the real game starts.
   *
   * Graded on the margin rather than on a win count. A bot playing at skill 1 is
   * deterministic — the only thing the seed still moves is the jitter on how many
   * units an attack knocks out — so "how often does each side win" collapses to
   * 0-10 or 10-0 no matter how close the two lines actually are. The margin is
   * the thing that was always meant by "neither is dominant".
   */
  it("leaves neither pure growth nor sabotage dominant", () => {
    const seeds = Array.from({ length: 10 }, (_, i) => `dom-${i}`);
    const ratios = seeds.map((seed) => {
      const r = simulateMatch({
        seed,
        durationMs: seconds(300),
        players: [
          // `greedy` is `nasty` with the second axis switched off, so this
          // isolates sabotage and nothing else.
          { id: "greedy", name: "Greedy", profile: "greedy" },
          { id: "nasty", name: "Nasty", profile: "nasty" },
        ],
      });
      console.log(
        `  ${seed}: greedy=${format(r.finalScores.greedy!)} nasty=${format(r.finalScores.nasty!)} ` +
          `landed=${r.attacksLanded} blocked=${r.attacksBlocked}`,
      );
      return r.finalScores.nasty! / r.finalScores.greedy!;
    });
    const median = [...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)]!;
    console.log(`growth-vs-sabotage: sabotage line finishes at ${median.toFixed(2)}x the pure-growth line`);
    // An edge to sabotage is fine and expected — it's spending on something the
    // control group can't answer. A rout in either direction is not.
    expect(median).toBeGreaterThan(0.7);
    expect(median).toBeLessThan(1.6);
  });

  /**
   * Difficulty has to be monotonic, and it has not been by default. Both
   * decision cadence and "buy the best thing you can afford right now" made
   * *slower or lazier* bots stronger, because acting less often means a bigger
   * pile and a bigger pile buys better tiers. Scores are noisy enough that this
   * has to be a median over many seeds.
   */
  it("orders the difficulty ladder the way the lobby claims", () => {
    const seeds = Array.from({ length: 21 }, (_, i) => `ladder-${i}`);
    const medianFor = (profile: "chill" | "scrappy" | "nasty") => {
      const scores = seeds
        .map(
          (seed) =>
            simulateMatch({
              seed,
              durationMs: seconds(300),
              players: [
                { id: "bot", name: "Bot", profile },
                { id: "foil", name: "Foil", profile: "chill" },
              ],
            }).finalScores.bot!,
        )
        .sort((a, b) => a - b);
      return scores[Math.floor(scores.length / 2)]!;
    };

    const chill = medianFor("chill");
    const scrappy = medianFor("scrappy");
    const nasty = medianFor("nasty");
    console.log(
      `difficulty ladder: chill=${format(chill)} scrappy=${format(scrappy)} nasty=${format(nasty)}`,
    );
    expect(scrappy).toBeGreaterThan(chill);
    expect(nasty).toBeGreaterThan(scrappy);
  });

  /**
   * When in the match sabotage is worth reaching for.
   *
   * Sabotage is priced against the target's production rate, so a swing costs
   * about what the damage is worth whenever you throw it. What changes over a
   * match is the other side of the trade: potatoes spent in the first minute
   * would have compounded for four more, so early sabotage is buying denial at
   * the moment growth is cheapest. That should make it a wash early and a good
   * buy later — a gradient, not a cliff, and never an outright self-own.
   */
  it("makes sabotage a wash early and a good buy later", () => {
    const seeds = Array.from({ length: 15 }, (_, i) => `window-${i}`);
    const marginFor = (attackWindow: [number, number]) => {
      const ratios = seeds
        .map((seed) => {
          const r = simulateMatch({
            seed,
            durationMs: seconds(300),
            players: [
              { id: "econ", name: "Econ", profile: "greedy" },
              {
                id: "sab",
                name: "Sab",
                profile: "greedy",
                tweak: { aggression: 0.5 },
                attackWindow,
              },
            ],
          });
          return r.finalScores.sab! / r.finalScores.econ!;
        })
        .sort((a, b) => a - b);
      return ratios[Math.floor(ratios.length / 2)]!;
    };

    const early = marginFor([0, 100]);
    const mid = marginFor([100, 200]);
    const late = marginFor([200, 300]);
    console.log(
      `sabotage window: early ${early.toFixed(2)}x  mid ${mid.toFixed(2)}x  late ${late.toFixed(2)}x`,
    );
    // Spending early on a farm with nothing on it yet shouldn't cost you the
    // match — you should roughly get back what you put in.
    expect(early).toBeGreaterThan(0.95);
    // And it should be worth more once there's something there to wreck.
    expect(late).toBeGreaterThan(early);
    expect(mid).toBeGreaterThan(early);
  });

  it("reports the shape of a match", () => {
    const r = fiveMinuteMatch("s1");
    const rows = r.samples
      .filter((s) => s.atSeconds % 60 === 0)
      .map((s) => `${s.atSeconds}s p1=${format(s.scores.p1!)}@${format(s.rates.p1!)}/s p2=${format(s.scores.p2!)}@${format(s.rates.p2!)}/s`);
    console.log(
      [
        ...rows,
        `final p1=${format(r.finalScores.p1!)} p2=${format(r.finalScores.p2!)}`,
        `attacks landed=${r.attacksLanded} blocked=${r.attacksBlocked} defenses=${r.defensesBought}`,
      ].join("\n"),
    );
    expect(r.samples.length).toBeGreaterThan(0);
  });
});
