import { describe, expect, it } from "vitest";

import { flow, pathLength, pointAlong, runnerWidth, territory } from "./insideScene.js";

/**
 * The inside farm's promises, which are the outside farm's promises answered in
 * a place with no sky: owning more of a thing takes up more of the room, the
 * vessel feeding your hoard visibly thickens, and a farm running everything at
 * once doesn't drown in its own traffic.
 *
 * Nothing here touches a canvas. What's worth pinning is the arithmetic that
 * decides how much of the place a count is worth — get that wrong and the scene
 * is either unreadable at ten or maxed out at three.
 */
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

describe("the vessel a tier feeds the hoard through", () => {
  it("is always at least a thread, and never wider than the trunk", () => {
    for (let n = 1; n <= 500; n++) {
      expect(runnerWidth(n)).toBeGreaterThanOrEqual(1);
      // The trunk is drawn at the widest branch plus one and capped at four, so
      // a branch that reaches four is a branch as wide as the main it joins.
      expect(runnerWidth(n)).toBeLessThanOrEqual(3);
    }
  });

  it("visibly thickens between a handful and a hundred", () => {
    expect(runnerWidth(100)).toBeGreaterThan(runnerWidth(3));
  });
});

describe("what a tier turns up", () => {
  it("climbs with the count you can see", () => {
    expect(flow(4)).toBeGreaterThan(flow(1));
  });

  it("is capped, so eight tiers running can't bury the plain", () => {
    // Seven tiers is the whole network. At the cap that's about nine potatoes a
    // second entering it, against a couple of dozen slots in the air, on the
    // floor and in the vessels at once — busy, but not a solid chain.
    expect(flow(1000) * 7).toBeLessThan(10);
  });
});

describe("a path through the plumbing", () => {
  const path = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
  ];

  it("measures the whole run, not the distance between the ends", () => {
    expect(pathLength(path)).toBe(15);
  });

  it("walks it corner to corner", () => {
    expect(pointAlong(path, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(path, 5)).toEqual({ x: 5, y: 0 });
    expect(pointAlong(path, 10)).toEqual({ x: 10, y: 0 });
    expect(pointAlong(path, 12.5)).toEqual({ x: 10, y: 2.5 });
  });

  it("holds at the mouth rather than carrying on past it", () => {
    // A potato whose distance overshoots the end is one the delivery code hasn't
    // caught yet. It should sit in the mouth, not fly off the bottom corner.
    expect(pointAlong(path, 15)).toEqual({ x: 10, y: 5 });
    expect(pointAlong(path, 900)).toEqual({ x: 10, y: 5 });
    expect(pointAlong(path, -3)).toEqual({ x: 0, y: 0 });
  });
});
