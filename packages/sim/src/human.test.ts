import { describe, expect, it } from "vitest";

import { simulateMatch } from "./balance.js";
import { format, seconds } from "./numbers.js";

const SEEDS = Array.from({ length: 15 }, (_, i) => `hb-${i}`);

/**
 * Grades the difficulty ladder against a stand-in for an actual person rather
 * than against more bots. Bot-vs-bot runs can only tell you the economy isn't
 * degenerate — they can't tell you whether the lobby's three rungs feel like
 * three rungs, which is the only thing the setting is for.
 */
function ladder(style: "builder" | "scrapper" | "masher", profile: string) {
  const results = SEEDS.map((seed) => {
    const r = simulateMatch({
      seed,
      durationMs: seconds(300),
      players: [
        { id: "you", name: "You", human: style },
        { id: "bot", name: "Bot", profile },
      ],
    });
    return { you: r.finalScores.you!, bot: r.finalScores.bot! };
  });
  const wins = results.filter((r) => r.you > r.bot).length;
  const ratios = results.map((r) => r.you / Math.max(1, r.bot)).sort((a, b) => a - b);
  return { wins, of: SEEDS.length, median: ratios[Math.floor(ratios.length / 2)]! };
}

describe("the ladder, played by a person", () => {
  it("gives a builder a comfortable win over chill", () => {
    const r = ladder("builder", "chill");
    console.log(`builder vs chill: ${r.wins}/${r.of}, median ${r.median.toFixed(2)}x`);
    expect(r.wins).toBeGreaterThanOrEqual(13);
  });

  it("makes scrappy a real fight", () => {
    const r = ladder("builder", "scrappy");
    console.log(`builder vs scrappy: ${r.wins}/${r.of}, median ${r.median.toFixed(2)}x`);
    // Winnable, but not a formality either way.
    expect(r.median).toBeGreaterThan(0.6);
    expect(r.median).toBeLessThan(1.7);
  });

  it("makes nasty something you have to actually beat", () => {
    const r = ladder("builder", "nasty");
    console.log(`builder vs nasty: ${r.wins}/${r.of}, median ${r.median.toFixed(2)}x`);
    // Should usually lose to it, but stay in sight — a 3x wall isn't a
    // difficulty setting, it's a brick.
    expect(r.wins).toBeLessThanOrEqual(6);
    expect(r.median).toBeGreaterThan(0.45);
  });

  it("pays a player for engaging with the other two tabs", () => {
    const builder = ladder("builder", "scrappy");
    const scrapper = ladder("scrapper", "scrappy");
    console.log(
      `vs scrappy: builder ${builder.median.toFixed(2)}x, scrapper ${scrapper.median.toFixed(2)}x`,
    );
    // The whole pitch is that reaching across the board is a live option. If
    // ignoring sabotage entirely is just as good, there's only one axis.
    //
    // Graded against `scrappy` on purpose. It doesn't pay against `nasty`,
    // which keeps a shield up and eats the swings — that's the mechanic working,
    // not a bug. Sabotage should beat a farm that ignores defense, and waste
    // your potatoes against one that doesn't.
    expect(scrapper.median).toBeGreaterThan(builder.median * 1.1);
  });

  it("reports the whole grid", () => {
    for (const style of ["builder", "scrapper", "masher"] as const) {
      const row = ["chill", "scrappy", "nasty"].map((p) => {
        const r = ladder(style, p);
        return `${p} ${r.wins}/${r.of} (${r.median.toFixed(2)}x)`;
      });
      console.log(`${style.padEnd(9)} ${row.join("  ")}`);
    }
    expect(SEEDS.length).toBeGreaterThan(0);
  });
});

it("shows how much a match still turns on wrist speed", () => {
  // Not an assertion, a watchpoint. Digging is meant to be an opener; if the
  // masher's margin over the builder ever balloons, the click ladder has
  // quietly become the whole game and the shop is decoration.
  for (const p of ["chill", "scrappy", "nasty"]) {
    const b = ladder("builder", p);
    const m = ladder("masher", p);
    console.log(
      `${p}: builder ${b.median.toFixed(2)}x vs masher ${m.median.toFixed(2)}x ` +
        `(mashing is worth ${(m.median / b.median).toFixed(2)}x)`,
    );
  }
  expect(true).toBe(true);
});

it("reports the shape of a match against a person", () => {
  const r = simulateMatch({
    seed: "shape",
    durationMs: seconds(300),
    players: [
      { id: "you", name: "You", human: "builder" },
      { id: "bot", name: "Bot", profile: "scrappy" },
    ],
  });
  console.log(
    r.samples
      .filter((s) => s.atSeconds % 60 === 0)
      .map(
        (s) =>
          `${s.atSeconds}s you=${format(s.scores.you!)}@${format(s.rates.you!)}/s ` +
          `bot=${format(s.scores.bot!)}@${format(s.rates.bot!)}/s`,
      )
      .join("\n"),
  );
  console.log(`final you=${format(r.finalScores.you!)} bot=${format(r.finalScores.bot!)}`);
  expect(r.samples.length).toBeGreaterThan(0);
});
