import { describe, expect, it } from "vitest";

import { hoardLayout } from "./farmScene.js";

/**
 * The yard's one promise: earning never takes anything out of it. The old
 * place-value yard broke this at every power of ten — 999 potatoes filled the
 * screen and 1000 emptied it — so it's worth a test rather than an eyeball.
 */
describe("the yard", () => {
  it("never shrinks as the hoard grows", () => {
    let last = -1;
    // Every 1% step from one potato to the price of the last thing on the list.
    for (let l = 0; l <= 18; l += 0.01) {
      const units = hoardLayout(10 ** l).units;
      expect(units).toBeGreaterThanOrEqual(last);
      last = units;
    }
  });

  it("counts the first ten potatoes one for one", () => {
    for (let a = 0; a <= 10; a++) expect(hoardLayout(a).rows[0]).toBe(a);
  });

  it("keeps every order of magnitude a step up rather than a wipe", () => {
    for (let e = 1; e <= 17; e++) {
      const before = hoardLayout(10 ** e - 1);
      const after = hoardLayout(10 ** e);
      expect(after.units).toBeGreaterThanOrEqual(before.units);
    }
  });

  it("fills each row before starting the next, and fills them all in the end", () => {
    for (const a of [1, 500, 25_000, 4e6, 5e12, 1e18, 1e30]) {
      const { rows, units } = hoardLayout(a);
      const partial = rows.findIndex((n) => n < 10);
      if (partial >= 0) expect(rows.slice(partial + 1).every((n) => n === 0)).toBe(true);
      expect(units).toBe(rows.reduce((s, n) => s + n, 0));
    }
    expect(hoardLayout(1e18).units).toBe(40);
  });
});
