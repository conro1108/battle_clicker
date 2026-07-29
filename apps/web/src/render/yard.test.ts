import { describe, expect, it } from "vitest";

import { buildHidden, HEAP_CAP, SCENE_W, YARD, yardLayout } from "./farmScene.js";

/** Sprite width straight off the char grid, since there's no canvas out here. */
function artWidth(rows: readonly string[]): number {
  return rows.reduce((m, r) => Math.max(m, r.length), 0);
}

/**
 * The yard's promises: earning only ever builds, spending visibly unbuilds, and
 * the hand-placed props don't stand on each other. The first one is the whole
 * reason this stopped being a counter — place value emptied the yard at every
 * power of ten, and a row of units turned it into a bar chart.
 */
describe("the yard", () => {
  it("never takes anything down while the hoard grows", () => {
    let last = -1;
    for (let l = 0; l <= 15; l += 0.005) {
      const { stage } = yardLayout(10 ** l);
      expect(stage).toBeGreaterThanOrEqual(last);
      last = stage;
    }
  });

  it("costs you a building or two when you clear out your bank", () => {
    // Anywhere past the early stages, spending nine tenths of what you have
    // should be something you can watch happen, not a rounding difference.
    for (let l = 3; l <= 13; l += 0.25) {
      const before = yardLayout(10 ** l).stage;
      const after = yardLayout(10 ** l / 10).stage;
      expect(before - after).toBeGreaterThanOrEqual(1);
    }
  });

  it("counts the first few potatoes one for one, then keeps the heap in bounds", () => {
    expect(yardLayout(0).heap).toBe(0);
    expect(yardLayout(1).heap).toBe(1);
    expect(yardLayout(2).heap).toBe(2);
    for (let l = 0; l <= 15; l += 0.01) {
      const { stage, heap } = yardLayout(10 ** l);
      expect(heap).toBeGreaterThanOrEqual(0);
      expect(heap).toBeLessThanOrEqual(Math.min(HEAP_CAP, YARD[stage]!.heap));
    }
  });

  it("has a build-out that climbs and fits on the canvas", () => {
    for (let i = 1; i < YARD.length; i++) {
      expect(YARD[i]!.at).toBeGreaterThan(YARD[i - 1]!.at);
    }
    for (const { add } of YARD) {
      if (!add) continue;
      expect(add.x).toBeGreaterThanOrEqual(0);
      expect(add.x + artWidth(add.art.rows)).toBeLessThanOrEqual(SCENE_W);
    }
  });

  it("walks a building all the way out of the ground and all the way back in", () => {
    const h = 20;
    // The canvas side of this is a clip rect and a blit, but the arithmetic
    // that decides how much is showing is worth pinning: off by one at either
    // end and a building either pops in whole or never finishes arriving.
    expect(buildHidden(0, true, h)).toBe(h);
    expect(buildHidden(999_999, true, h)).toBe(0);
    expect(buildHidden(0, false, h)).toBe(0);
    expect(buildHidden(999_999, false, h)).toBe(h);
    for (const up of [true, false]) {
      let last = up ? h + 1 : -1;
      for (let age = 0; age <= 600; age += 10) {
        const hidden = buildHidden(age, up, h);
        expect(hidden).toBeGreaterThanOrEqual(0);
        expect(hidden).toBeLessThanOrEqual(h);
        expect(up ? hidden <= last : hidden >= last).toBe(true);
        last = hidden;
      }
    }
  });

  it("stands nothing on top of anything else in the same row", () => {
    const props = YARD.flatMap((s) => (s.add ? [s.add] : []));
    for (const a of props) {
      for (const b of props) {
        if (a === b || a.row !== b.row) continue;
        const clear = a.x + artWidth(a.art.rows) <= b.x || b.x + artWidth(b.art.rows) <= a.x;
        expect(clear, `row ${a.row}: ${a.x} and ${b.x} overlap`).toBe(true);
      }
    }
  });
});
