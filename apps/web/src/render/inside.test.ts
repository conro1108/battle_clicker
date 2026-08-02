import { describe, expect, it } from "vitest";

import {
  ORDER,
  SCENE_W,
  ZONES,
  bandsFor,
  boreWidth,
  flow,
  hoistCount,
  hoistRun,
  openZones,
  shownCount,
  territory,
  zoneOf,
} from "./insideScene.js";

/**
 * The inside farm as a descent, which is the shape the whole scene rests on: a
 * lid, however many strata you've cut through, and a sump with your pile in it.
 *
 * Nothing here touches a canvas. What's worth pinning is the arithmetic that
 * decides how the buffer gets carved up and how much of the place a count is
 * worth — get that wrong and the scene is either unreadable at ten or maxed out
 * at three, and no typechecker will say a word about it.
 */
describe("the ladder's depth", () => {
  it("puts every rung in exactly one stratum, in order", () => {
    const zones = ORDER.map(zoneOf);
    expect(zones).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    // Which is to say: buying down the shop is buying down the shaft. If these
    // ever disagree, the picture stops explaining the ladder.
    for (let i = 1; i < zones.length; i++) expect(zones[i]!).toBeGreaterThanOrEqual(zones[i - 1]!);
  });

  it("opens a stratum for everything above the deepest thing you own", () => {
    expect(openZones({})).toBe(0);
    expect(openZones({ bruise: 1 })).toBe(1);
    expect(openZones({ bruise: 40, pithand: 12 })).toBe(1);
    expect(openZones({ bruise: 40, quarry: 1 })).toBe(2);
    expect(openZones({ second: 1 })).toBe(ZONES.length);
  });

  it("cuts through the cortex on the way to the core, even on a skipped rung", () => {
    // You can't own a Hollow Heart without having got past everything above it,
    // so a save that somehow holds only the deepest rung still gets the strata
    // it must have come through rather than one band floating over the sump.
    expect(openZones({ heart: 3 })).toBe(4);
  });
});

describe("carving up the buffer", () => {
  const heights = [120, 176, 200, 260, 340];

  it("fills the whole buffer with no gaps and no overlaps, at every depth", () => {
    for (const sh of heights) {
      for (let open = 0; open <= ZONES.length; open++) {
        const bands = bandsFor(sh, open);
        expect(bands[0]!.top).toBe(0);
        expect(bands.at(-1)!.bottom).toBeGreaterThanOrEqual(sh);
        for (let i = 1; i < bands.length; i++) {
          expect(bands[i]!.top).toBe(bands[i - 1]!.bottom);
        }
      }
    }
  });

  it("always has a lid and a sump, and a stratum for each open zone", () => {
    for (let open = 0; open <= ZONES.length; open++) {
      const bands = bandsFor(200, open);
      expect(bands[0]!.zone).toBe(-1);
      expect(bands.at(-1)!.zone).toBe(-2);
      expect(bands.filter((b) => b.zone >= 0)).toHaveLength(open);
    }
  });

  it("keeps every stratum thick enough to stand a machine on", () => {
    // Four bands sharing the shaft is the worst case, and it's the one a finished
    // farm is in permanently. A band that collapses to a few pixels is a rung you
    // own and can't see.
    for (const sh of heights) {
      for (const band of bandsFor(sh, ZONES.length)) {
        if (band.zone >= 0) expect(band.bottom - band.top).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it("never moves the mound when a new stratum opens", () => {
    // The one thing that carries between the two worlds unchanged is the pile
    // you're spending. If the sump's top jumped every time the shaft got deeper,
    // the hoard would hop up the screen three times an endgame.
    const tops = [1, 2, 3, 4].map((n) => bandsFor(200, n).at(-1)!.top);
    for (const top of tops) expect(top).toBe(tops[0]);
  });

  it("gives deeper strata more room than the ones you've cut past", () => {
    const bands = bandsFor(260, ZONES.length).filter((b) => b.zone >= 0);
    const hs = bands.map((b) => b.bottom - b.top);
    for (let i = 1; i < hs.length; i++) expect(hs[i]!).toBeGreaterThanOrEqual(hs[i - 1]!);
  });

  it("eases a stratum in rather than jumping a band", () => {
    // What the reveal animates through. Part-way in, the new band exists and is
    // shorter than it will be; the ones above it are still there.
    const part = bandsFor(200, 1.5).filter((b) => b.zone >= 0);
    const whole = bandsFor(200, 2).filter((b) => b.zone >= 0);
    expect(part).toHaveLength(2);
    const partH = part[1]!.bottom - part[1]!.top;
    const wholeH = whole[1]!.bottom - whole[1]!.top;
    expect(partH).toBeGreaterThan(0);
    expect(partH).toBeLessThan(wholeH);
  });
});

describe("a tier's ground", () => {
  it("gives one of something a visible amount of room, and nothing nothing", () => {
    expect(territory(0, 10, 90)).toBe(0);
    expect(territory(1, 10, 90)).toBe(10);
  });

  it("never takes ground away as you buy more", () => {
    let last = 0;
    for (let n = 0; n <= 400; n++) {
      const t = territory(n, 10, 90);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  it("makes ten, fifty and a hundred of something look different", () => {
    // The same test the outside lot has to pass, for the same reason: ground
    // that reads identically at 10 and at 100 tells you nothing the shop didn't.
    expect(territory(50, 10, 90)).toBeGreaterThan(territory(10, 10, 90) + 4);
    expect(territory(100, 10, 90)).toBeGreaterThan(territory(50, 10, 90) + 4);
  });

  it("stops at the far end rather than running off the buffer", () => {
    for (const n of [128, 200, 1000, 1e6]) {
      expect(territory(n, 10, 90)).toBeLessThanOrEqual(90);
    }
  });
});

describe("the bore", () => {
  it("is always a crack you could drop a potato down", () => {
    const potato = 5;
    for (let n = 1; n <= 2000; n++) expect(boreWidth(n)).toBeGreaterThan(potato);
  });

  it("visibly widens between a first purchase and a finished ladder", () => {
    expect(boreWidth(800)).toBeGreaterThan(boreWidth(1) + 8);
  });

  it("never takes so much of the width that the strata have nowhere to stand", () => {
    // Everything you own stands to the right of the shaft. A bore that ate the
    // buffer would leave the ledges too narrow to spread a tier along.
    for (const n of [1, 50, 5000, 1e6]) expect(boreWidth(n)).toBeLessThan(SCENE_W / 4);
  });
});

/** A full shaft crew, so the lane arithmetic is what's under test and not this. */
const MAX_CREW_FOR_TEST = 9;

describe("the cages", () => {
  it("never hangs more than the bore has lanes for", () => {
    for (let bore = 5; bore <= 40; bore++) {
      const n = hoistCount(bore, MAX_CREW_FOR_TEST);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
      // Nine pixels a cage, and they have to leave the falling crop somewhere
      // to go — a lane that overhangs the far wall of the shaft is a cage drawn
      // on top of the stratum next to it.
      expect((n - 1) * 9 + 9).toBeLessThanOrEqual(bore + 8);
    }
  });

  /**
   * The complaint this replaced a patrol for: with nobody underground, a cage
   * ran the shaft anyway — up and down between nothing and nothing, which is
   * exactly what the first moment after the Ur-Potato looks like.
   */
  it("doesn't hang a cage in a shaft with nobody in it", () => {
    expect(hoistCount(boreWidth(5000), 0)).toBe(0);
    // And doesn't hang three for a crew of two, either.
    expect(hoistCount(boreWidth(5000), 2)).toBe(1);
    expect(hoistCount(boreWidth(5000), 9)).toBe(3);
  });

  /**
   * The regression that made this file worth extending: the cages did not move.
   *
   * The old patrol's stop test asked whether a cage was *near* a bench rather
   * than whether it had *crossed* one, so a cage that had stopped sat exactly on
   * the bench, advanced a third of a pixel, was still inside the threshold,
   * snapped back and rested again. All three moored themselves at the first
   * bench they reached, and nothing caught it — a still of three cages parked at
   * three benches looks exactly like a still of three cages working.
   *
   * So: run one from the top of the shaft to the bottom a frame at a time, and
   * require that it gets there.
   */
  it("gets where it's called, a frame at a time", () => {
    let y = 10;
    let frames = 0;
    // A frame's travel at 60fps, which is the scale the bug lived at: big enough
    // to move, far smaller than any threshold it could get caught by.
    while (frames < 20_000) {
      const step = hoistRun(y, 104, 0.32);
      y = step.y;
      frames++;
      if (step.arrived) break;
    }
    expect(y).toBe(104);
    expect(frames).toBeLessThan(20_000);
  });

  it("lands exactly on the bench, so crew step off onto it and not into the wall", () => {
    expect(hoistRun(46, 47, 3)).toEqual({ y: 47, arrived: true });
    expect(hoistRun(47, 47, 0.32)).toEqual({ y: 47, arrived: true });
    // Called the other way, it goes the other way.
    expect(hoistRun(60, 47, 0.32).y).toBeLessThan(60);
  });

  it("adds cages as the shaft widens, never takes them away", () => {
    let last = 0;
    for (let bore = 5; bore <= 40; bore++) {
      expect(hoistCount(bore, MAX_CREW_FOR_TEST)).toBeGreaterThanOrEqual(last);
      last = hoistCount(bore, MAX_CREW_FOR_TEST);
    }
    expect(hoistCount(boreWidth(1), MAX_CREW_FOR_TEST)).toBeLessThan(
      hoistCount(boreWidth(5000), MAX_CREW_FOR_TEST),
    );
  });
});

describe("what a tier turns up", () => {
  it("climbs with the count you can see", () => {
    expect(flow(4)).toBeGreaterThan(flow(1));
  });

  it("is capped, so eight tiers running can't pack the shaft solid", () => {
    // Everything funnels down one bore now instead of eight separate vessels, so
    // this cap is doing more work than it used to: overfeed it and the shaft is
    // a column of potatoes nose to tail, which reads as a texture rather than as
    // traffic.
    expect(flow(1000) * ORDER.length).toBeLessThan(10);
  });
});

describe("how many of a thing get drawn", () => {
  it("shows the first few one for one, then slows to a doubling each", () => {
    expect(shownCount(0, 6)).toBe(0);
    expect(shownCount(3, 6)).toBe(3);
    expect(shownCount(8, 6)).toBeLessThan(8);
  });

  it("never exceeds what its ledge can hold", () => {
    for (const n of [5, 50, 500, 1e5]) expect(shownCount(n, 4)).toBeLessThanOrEqual(4);
  });
});
