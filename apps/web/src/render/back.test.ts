import { describe, expect, it } from "vitest";

import { LAB, REACTOR, REFINERY, shrunk, TOWER } from "./art.js";
import { catchOrbit, lotDepth } from "./farmScene.js";

/** Sprite width straight off the char grid, since there's no canvas out here. */
function artWidth(rows: readonly string[]): number {
  return rows.reduce((m, r) => Math.max(m, r.length), 0);
}

/**
 * The back edge's promises. The old one showed you the last four things you
 * bought and demolished everything older, so: nothing you own ever stops being
 * on the screen, and how much of it you own is something you can see.
 */
describe("a tier's lot", () => {
  it("stands the tier out front from the first one you buy", () => {
    expect(lotDepth(0)).toBe(0);
    expect(lotDepth(1)).toBe(1);
  });

  it("never takes anything down as you buy more", () => {
    let last = 0;
    for (let n = 0; n <= 400; n++) {
      const depth = lotDepth(n);
      expect(depth).toBeGreaterThanOrEqual(last);
      last = depth;
    }
  });

  it("makes ten, fifty and a hundred of something look different", () => {
    // The whole ask. A lot that reads the same at 10 and at 100 is a lot that
    // isn't telling you anything you couldn't read off the shop.
    expect(lotDepth(50)).toBeGreaterThan(lotDepth(10));
    expect(lotDepth(100)).toBeGreaterThan(lotDepth(50));
    expect(lotDepth(10)).toBeGreaterThan(lotDepth(2));
  });

  it("saves the hillside for the counts you only reach on a long run", () => {
    // Slots 7 and up are on the ridges. A farm with a dozen of something is a
    // farm on the flat; the hills are what a hundred of it looks like.
    expect(lotDepth(12)).toBeLessThan(8);
    expect(lotDepth(120)).toBeGreaterThanOrEqual(9);
  });

  it("keeps the deepest lot on the property however many you buy", () => {
    expect(lotDepth(1e6)).toBe(lotDepth(400));
    expect(lotDepth(400)).toBeLessThanOrEqual(11);
  });
});

describe("a building at distance", () => {
  it("comes out half the size, rounded up so nothing vanishes", () => {
    for (const art of [LAB, REFINERY, TOWER, REACTOR]) {
      const small = shrunk(art);
      expect(small.rows.length).toBe(Math.ceil(art.rows.length / 2));
      expect(artWidth(small.rows)).toBe(Math.ceil(artWidth(art.rows) / 2));
    }
  });

  it("keeps its outline instead of losing whichever edge lands on an odd column", () => {
    // This is what nearest-neighbour got wrong. Every row that had ink in it
    // still has ink in it.
    for (const art of [LAB, REFINERY, TOWER, REACTOR]) {
      const small = shrunk(art);
      const inked = (rows: readonly string[], y: number) =>
        [...(rows[y] ?? "")].some((c) => c !== "." && art.palette[c]);
      for (let y = 0; y < art.rows.length; y += 2) {
        if (!inked(art.rows, y) && !inked(art.rows, y + 1)) continue;
        expect(inked(small.rows, y / 2), `${art.rows[y]}`).toBe(true);
      }
    }
  });

  it("is the same art object every time, so the sprite cache holds", () => {
    expect(shrunk(LAB)).toBe(shrunk(LAB));
  });
});

/**
 * What a singularity takes with it. The promise is only that a thing it's got
 * hold of always ends up inside it, reasonably soon and turning faster the
 * closer it gets — an orbit that stalls leaves a potato circling forever.
 */
describe("a caught potato", () => {
  it("goes in, from the furthest a hole can reach", () => {
    let r = 62;
    let turn = 0;
    let s = 0;
    for (; s < 600 && r > 3; s++) {
      const step = catchOrbit(r, 1 / 60);
      r = step.r;
      turn += step.turn;
    }
    expect(r).toBeLessThanOrEqual(3);
    // Inside four seconds, and having gone round at least once on the way.
    expect(s / 60).toBeLessThan(5);
    expect(turn).toBeGreaterThan(Math.PI * 2);
  });

  it("whips as it closes", () => {
    const wide = catchOrbit(40, 1 / 60).turn;
    const tight = catchOrbit(8, 1 / 60).turn;
    expect(tight).toBeGreaterThan(wide * 2);
  });
});
