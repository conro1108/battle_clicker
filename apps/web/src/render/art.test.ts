import { describe, expect, it } from "vitest";

import * as art from "./art.js";
import type { Art } from "./pixel.js";

function isArt(v: unknown): v is Art {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as Art).rows) &&
    typeof (v as Art).palette === "object"
  );
}

/** Every piece of art in the file, named, including the ones inside `PRODUCER_MARKS`. */
function everything(): [string, Art][] {
  const out: [string, Art][] = [];
  for (const [name, value] of Object.entries(art)) {
    if (isArt(value)) out.push([name, value]);
  }
  for (const [id, marks] of Object.entries(art.PRODUCER_MARKS)) {
    marks.forEach((mark, i) => out.push([`${id}[${i}]`, mark]));
  }
  for (const [name, icon] of Object.entries(art.ICONS)) {
    out.push([`ICONS.${name}`, icon]);
  }
  return out;
}

/**
 * `paint` pads short rows out to the longest, so a miscounted row doesn't throw
 * — it silently loses whatever should have been on the right-hand end. Every
 * grid in here is hand-typed, and this is the only thing that catches a dropped
 * character before it ships as a building with one wall missing.
 */
describe("the art", () => {
  it("is rectangular, everywhere", () => {
    for (const [name, a] of everything()) {
      const widths = new Set(a.rows.map((r) => r.length));
      expect(widths.size, `${name} has ragged rows: ${[...widths].join("/")}`).toBe(1);
    }
  });

  it("only uses keys its palette knows about", () => {
    for (const [name, a] of everything()) {
      for (const row of a.rows) {
        for (const ch of row) {
          if (ch === ".") continue;
          expect(a.palette[ch], `${name} uses "${ch}" with no colour for it`).toBeTruthy();
        }
      }
    }
  });

  /**
   * The fourth mark is the reward for owning a hundred of something, so it has
   * to be a different *picture* and not a different palette — that's the whole
   * pitch of the upgrade, and a repaint that slipped in here would be invisible
   * on the tiers drawn two fields away.
   */
  it("gives every tier a fourth mark that is actually redrawn", () => {
    for (const [id, marks] of Object.entries(art.PRODUCER_MARKS)) {
      expect(marks.length, id).toBe(4);
      const [base, , , last] = marks;
      expect(last.rows.join("|"), `${id}'s fourth mark is a repaint`).not.toBe(base.rows.join("|"));
    }
  });
});
