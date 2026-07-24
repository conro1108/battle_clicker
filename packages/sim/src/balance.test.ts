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
   * worth the potatoes you didn't spend on yourself? If pure growth wins every
   * seed, sabotage is decoration and there's no second axis.
   */
  it("leaves neither pure growth nor sabotage dominant", () => {
    const seeds = Array.from({ length: 10 }, (_, i) => `dom-${i}`);
    const wins = seeds.map((seed) => {
      const r = simulateMatch({
        seed,
        durationMs: seconds(300),
        players: [
          { id: "greedy", name: "Greedy", profile: "greedy" },
          { id: "nasty", name: "Nasty", profile: "nasty" },
        ],
      });
      console.log(
        `  ${seed}: greedy=${format(r.finalScores.greedy!)} nasty=${format(r.finalScores.nasty!)} ` +
          `landed=${r.attacksLanded} blocked=${r.attacksBlocked}`,
      );
      return r.finalScores.greedy! > r.finalScores.nasty! ? "greedy" : "nasty";
    });
    const greedyWins = wins.filter((w) => w === "greedy").length;
    console.log(`growth-vs-sabotage over ${wins.length} seeds: greedy ${greedyWins}-${wins.length - greedyWins} nasty`);
    // Not a claim that it's balanced for humans — these are crude bots. It's a
    // guard against either axis becoming strictly dominant, which is the one
    // outcome that would collapse the game back into a solo idle clicker.
    expect(greedyWins).toBeGreaterThan(0);
    expect(wins.length - greedyWins).toBeGreaterThan(0);
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
