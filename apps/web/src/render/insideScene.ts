/**
 * The inside of the potato, drawn.
 *
 * A second scene, not a variant of the first. `farmScene.ts` is a homestead:
 * sky, hills, a field of crop, a fence, a yard. None of that survives the
 * Convergence except the yard, and reskinning a field of potato plants in ochre
 * would have said "the same farm, at sunset" — which is the one thing the fold
 * must not read as. So this is its own picture with its own bands, its own
 * light and its own ladder standing in it.
 *
 * The two scenes share the buffer conventions and nothing else. Same width,
 * same rule: every blit is integer-aligned and unscaled, animation is
 * translation only. At this size a fractional transform resamples the art off
 * the pixel grid and 1px outlines double or vanish.
 *
 * What the place is: a hollow in the flesh. Ceiling overhead being ploughed
 * upside down, a far wall with doors cut in it, a pale starch plain underfoot,
 * and your hoard at the front where it has always been. No sun, so the only
 * light in here is the light you built — which is why the prime glow matters
 * more down here than it ever did outside.
 *
 * ---
 *
 * What it also has to be is a *farm*, and for a while it wasn't. The outside
 * has crop in rows, machines driving them, hands walking a potato down to the
 * yard and a pipeline visibly stuffed with the stuff — you can watch the number
 * at the top of the screen being made. The first inside was eight sprites
 * standing on an empty floor in the dark, and it read as the afterlife.
 *
 * So the inside now runs on the same three promises the outside does, answered
 * in its own idiom:
 *
 *  - **Everything you own does something that makes a potato.** Furrows shake
 *    them out of the ceiling, veins bead one at the clamp, gates push them
 *    through from the other side, seams cut them off the face, eyes drop one
 *    when they've swelled, taps pump one up the shaft, the Second Potato
 *    fruits. See `emit`.
 *  - **You can watch it get to the hoard.** No steel: the flesh grows plumbing.
 *    A trunk vessel runs out of the mound along the front of the plain, one
 *    branch per tier joins it, and potatoes ride down inside as peristaltic
 *    boluses. Loose ones on the floor roll to the nearest intake, or a member
 *    of the Chorus picks one up and carries it. See `RUNNER`.
 *  - **Owning more of a thing visibly makes more room for it.** Every tier has
 *    a territory that widens with the count — the ploughed scars in the roof,
 *    the quarry face at the back of the plain, the sprout patch, the vascular
 *    tree the veins hang off — and its branch of the vessel thickens and runs
 *    faster. See `territory` and `runnerWidth`.
 */

import type { solo } from "@battle/sim";

import { POTATO_SPRITE, PRODUCER_MARKS } from "./art.js";
import {
  EMPTY_VIEW,
  SCENE_W,
  clamp,
  fract,
  hashSeed,
  mix,
  mulberry32,
  rgba,
  yardLayout,
  type FarmView,
} from "./farmScene.js";
import { artCanvas, artTinted, type Art } from "./pixel.js";

export { SCENE_W };

// ---------------------------------------------------------------------------
// The place
// ---------------------------------------------------------------------------

/**
 * Where the bands break, as shares of the buffer's height.
 *
 * The plain gets the most of it, which is the opposite of how the first draft
 * split it. A cavity wants to feel big, so the obvious move is to give the empty
 * air in the middle a third of the screen — and what that actually produces is a
 * black stripe with nothing in it, because most of what you own stands on the
 * ground. The hollow reads as tall enough from the *ceiling*: give the roof less
 * and the floor more, and the room is the same shape with the space spent on the
 * half that has things in it.
 *
 * The plain took another slice off the hollow when the vessels went in, because
 * the plain is now where the logistics live and a vessel network needs run-up.
 */
const ROOF_SHARE = 0.17;
const HOLLOW_SHARE = 0.25;
const FLOOR_SHARE = 0.36;
// The rest is the yard, at the front, which is the one thing that came in with
// you and the one thing that reads the same in both worlds.

/** The flesh, at its two extremes. Shared with `farmScene`'s ceiling. */
const FLESH_LIT = "#ecd9a6";
const FLESH_MID = "#c9a05c";
const FLESH_DEEP = "#7d5330";

/** The air in the hollow. Warm dark: it's a cavity, not a night. */
const HOLLOW_TOP = "#4a3320";
const HOLLOW_BOTTOM = "#2c1d14";

/** The plain underfoot, at full health and at the floor of it. */
const STARCH = "#d9c48f";
const STARCH_TIRED = "#8e7a54";
const STARCH_DARK = "#a88c5c";

/** Live tissue: the vessels, the cords across the hollow, the intakes. */
// Close enough to the starch that a vessel reads as the floor swollen up rather
// than as something laid on it. Pushed further apart and the network becomes the
// loudest thing in the picture, which it is emphatically not meant to be — what
// you're supposed to notice is the potatoes going down it.
const VESSEL = "#c99b78";
const VESSEL_LIT = "#e8c39c";
const VESSEL_DEEP = "#8a5236";
const SAP = "#e0a8dc";
const SPROUT = "#7fc45a";

const INK = "#402e3a";

/**
 * How dark it is down here before anything of yours is lit.
 *
 * There's no time of day inside a potato — the wall clock has nothing to say
 * about a place with no sky — so this is a constant rather than a phase table.
 * It sits where dusk sat outside: enough that a lit machine reads as the only
 * light source in the picture, not so much that an unlit farm is a black
 * rectangle.
 */
const GLOOM = 0.3;

// ---------------------------------------------------------------------------
// The tiers, and where each one lives
// ---------------------------------------------------------------------------

type InsideId = Extract<
  solo.SoloProducerId,
  "furrow" | "eyes" | "starch" | "mantle" | "vein" | "chorus" | "skin" | "second"
>;

/**
 * Five places to stand, front to back, and every rung gets exactly one.
 *
 * The outside farm's bands are about *distance* — a thing is far away or it
 * isn't. In here they're about which surface of the tuber the thing is working,
 * because that's what the ladder is: you buy your way from the ceiling, through
 * the air, down the wall and into the floor. So a new rung arriving is a new
 * part of the place waking up rather than another silhouette in the same field.
 */
type Band = "roof" | "wall" | "hang" | "far" | "floor" | "near";

interface Placement {
  band: Band;
  /** How many ever appear, however many you own. */
  cap: number;
  /** How fast the drawn count climbs with the owned count. */
  spread?: number;
  /** Travels rather than standing. Buffer pixels a second. */
  speed?: number;
}

const PLACEMENT: Record<InsideId, Placement> = {
  // Slow. It's ploughing a roof.
  furrow: { band: "roof", cap: 5, spread: 1.3, speed: 4 },
  // Hanging out of the ceiling on their own plumbing.
  vein: { band: "hang", cap: 6, spread: 1.6 },
  // Doors cut in the far wall, lit from whatever is on the other side.
  skin: { band: "wall", cap: 5, spread: 1.4 },
  second: { band: "hang", cap: 3, spread: 1 },
  // Quarried out of the back of the plain.
  starch: { band: "far", cap: 5, spread: 1.3 },
  eyes: { band: "floor", cap: 10, spread: 2.2 },
  chorus: { band: "floor", cap: 9, spread: 1.8 },
  // At the front with their shafts running off the bottom of the world.
  mantle: { band: "near", cap: 4, spread: 1.1 },
};

/** What a hundred-owned tier throws light in. Same rule the outside farm uses. */
const PRIME_GLOW: Record<InsideId, string> = {
  furrow: "#ffd166",
  eyes: "#a8f07a",
  starch: "#fff4e0",
  mantle: "#ff9a3c",
  vein: "#e0a8dc",
  chorus: "#fff4c0",
  skin: "#ffe8b0",
  second: "#f7e08a",
};

/** Ladder order, which is also the order a lot of things are laid out in. */
const ORDER: InsideId[] = [
  "furrow",
  "eyes",
  "starch",
  "mantle",
  "vein",
  "chorus",
  "skin",
  "second",
];

/**
 * How many of a tier to actually draw. Counts run to hundreds and the hollow
 * holds a couple of dozen things before it's soup, so the mapping is
 * logarithmic: the first few are one-for-one and after that it takes a doubling
 * to add another silhouette. Same curve the outside farm reads its field with,
 * for the same reason.
 */
/**
 * How often a tier with `n` units drawn turns something up, per second.
 *
 * Not tied to the actual rate. The real one crosses twenty orders of magnitude
 * over a run and any honest mapping of it is either nothing at all or a solid
 * wall of potatoes; this is tied to the count you can *see*, so more of a thing
 * visibly makes more of them, which is the promise that matters.
 *
 * Sub-linear and capped. Linear in the drawn count meant a late farm with seven
 * tiers running put fifteen potatoes a second on the floor, and every vessel on
 * the plain was packed nose to tail — which reads as one long beaded chain
 * rather than as traffic.
 */
export function flow(n: number): number {
  return Math.min(1.3, 0.28 + n * 0.11);
}

function shownCount(owned: number, cap: number, spread = 2.4): number {
  if (owned <= 0) return 0;
  if (owned <= 4) return Math.min(owned, cap);
  return Math.min(cap, 4 + Math.floor(Math.log2(owned / 4) * spread));
}

/**
 * How big a tier's *ground* is, given how many of it you own.
 *
 * The outside farm answers "how much of this do I have" by building the lot
 * further back up the hill. There's no hill in here and no distance to build
 * into, so the inside answers it by how much of the place the tier has taken
 * over: how wide the ploughed scars run across the ceiling, how far the quarry
 * face is cut into the back of the plain, how far the sprout patch has spread,
 * how thick the vessel feeding your hoard has grown.
 *
 * Log, like everything else that has to survive counts running into the
 * hundreds, and pinned at both ends: one of something is always visibly *some*
 * ground, and a hundred and twenty-eight of it is all the ground there is.
 */
export function territory(owned: number, min: number, max: number): number {
  if (owned <= 0) return 0;
  const k = Math.min(1, Math.log2(owned) / Math.log2(128));
  return min + (max - min) * k;
}

/**
 * How fat the vessel carrying a tier's crop to the hoard is.
 *
 * The whole promise of the number in the shop, in the one place it can't be
 * missed: buy more of something and the line it feeds your pile through visibly
 * thickens. Whole pixels — a fractional tube width on a 176-wide buffer is a
 * tube that shimmers.
 *
 * One to three, which is much thinner than the first go at it. A branch is a
 * vein in a floor, and the first draft drew it at six pixels with a two pixel
 * outline: eight tiers of that is not a farm's plumbing, it's scaffolding
 * standing in front of the farm. The trunk is the only thing in the network
 * allowed to look like a main.
 */
export function runnerWidth(owned: number): number {
  return Math.round(territory(owned, 1, 3));
}

// ---------------------------------------------------------------------------
// Loose things
// ---------------------------------------------------------------------------

/** Starch dust, drifting. The ambient motion in a room with no weather. */
interface Mote {
  x: number;
  y: number;
  /** Upward drift, buffer pixels a second. It falls up in here. */
  rise: number;
  sway: number;
  phase: number;
  bright: boolean;
}

const MOTES = 34;

/** A potato you turned up yourself, sitting in the open before it's carted off. */
interface Dug {
  x: number;
  y: number;
  born: number;
}

const DUG_MS = 850;

/** A breath of starch off something that just moved. */
interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
}

const MAX_PUFFS = 40;

/**
 * A potato on its way down through the air: shaken out of the ceiling, dropped
 * off a vein, pushed through a gate, fruited off the Second Potato.
 *
 * The hollow is the emptiest band in the picture and it's the one every ceiling
 * tier's crop has to cross, so this is where most of the scene's motion comes
 * from once the roof is working.
 */
interface Fall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where it stops falling. Picked at the drop, so the crop lands in depth. */
  land: number;
  spin: number;
}

const MAX_FALLING = 16;
/** Buffer pixels a second squared. Gentler than real gravity: it's a big room. */
const FALL_G = 150;

/** A potato on the plain, going nowhere until something moves it. */
interface Loose {
  id: number;
  x: number;
  y: number;
  /** Which tier's intake it's rolling for, or null while a porter has it. */
  to: InsideId | null;
  /** Sits still for a moment where it landed before it starts rolling. */
  wait: number;
  held: boolean;
}

const MAX_LOOSE = 20;
/** Buffer pixels a second. A potato rolling itself along the floor is unhurried. */
const ROLL_SPEED = 17;

/** A potato inside a vessel, being squeezed along it. */
interface Ride {
  id: InsideId;
  /** Distance travelled along that tier's path to the mound. */
  d: number;
}

const MAX_RIDES = 44;
/** Buffer pixels a second. The peristalsis waves run at the same pace. */
const RUN_SPEED = 26;

/** One of the Chorus, carrying. */
interface Porter {
  x: number;
  y: number;
  home: { x: number; y: number };
  loiter: { x: number; y: number };
  state: "idle" | "fetch" | "carry" | "back";
  /** The loose potato it's been sent for, or -1. */
  load: number;
  until: number;
}

const PORTER_SPEED = 20;

/** How long a vessel takes to grow out to something you've just installed. */
const RUNNER_GROW_S = 2.6;

/**
 * The hoard, as a mound.
 *
 * Deliberately the same pile in the same corner as the outside yard's, because
 * it is the same potatoes — the fold doesn't take your money off you, and the
 * one thing that should carry between the two pictures unchanged is the number
 * you're spending. The build-out around it doesn't carry: sheds and silos are
 * things you put up on a farm, and there's nothing to build them out of down
 * here. What the inside gets instead is the flesh growing storage for you.
 */
const HEAP_BASE = 11;
const HEAP_COURSES = 10;
const HEAP_X = -14;
const HEAP_STEP = 5;
const HEAP_CLIMB = 1.15;

/**
 * How many potatoes the slot table above can hold — derived here rather than
 * imported from the outside scene, which has its own copy of these constants.
 * Importing its cap while keeping our own courses is how the two silently
 * disagree the first time either mound is retuned.
 */
const HEAP_CAP = ((HEAP_BASE + (HEAP_BASE - HEAP_COURSES + 1)) * HEAP_COURSES) / 2;

let heapCache: { x: number; y: number }[] | null = null;

function heapSlots(): { x: number; y: number }[] {
  if (!heapCache) {
    const h = artCanvas(POTATO_SPRITE).h;
    const slots: { x: number; y: number; key: number }[] = [];
    for (let course = 0; course < HEAP_COURSES; course++) {
      const n = HEAP_BASE - course;
      for (let i = 0; i < n; i++) {
        slots.push({
          x: HEAP_X + Math.round(course * (HEAP_STEP / 2)) + i * HEAP_STEP,
          y: -h - course * 3 - (i % 2),
          key: Math.abs(i - (n - 1) / 2) + course * HEAP_CLIMB,
        });
      }
    }
    slots.sort((a, b) => a.key - b.key);
    heapCache = slots.map(({ x, y }) => ({ x, y }));
  }
  return heapCache;
}

/** How wide the mound gets, for anything that has to stand clear of it. */
const HEAP_W = HEAP_X + (HEAP_BASE - 1) * HEAP_STEP + 7;

/** Where the top of the pile is, which is what the vessel has to spit onto. */
const HEAP_CROWN_X = HEAP_X + Math.round((HEAP_COURSES - 1) * (HEAP_STEP / 2)) + 3;

/**
 * A cyst: a pale swelling in the flesh that the tuber grows around what you're
 * holding, and the inside's answer to the outside yard's sheds and silos.
 *
 * One arrives per stage of the same build-out curve the outside yard is read
 * with — so the two yards fill at the same pace and mean the same thing —
 * except that here they're all the same organ getting bigger, which is what a
 * potato would do about storage.
 */
const CYST_SLOTS: { x: number; row: number; w: number }[] = [
  { x: 158, row: 0, w: 9 },
  { x: 140, row: 1, w: 11 },
  { x: 122, row: 0, w: 9 },
  { x: 152, row: 2, w: 13 },
  { x: 104, row: 1, w: 11 },
  { x: 128, row: 3, w: 15 },
  { x: 86, row: 0, w: 9 },
  { x: 106, row: 3, w: 15 },
  { x: 82, row: 2, w: 13 },
  { x: 62, row: 3, w: 15 },
];

/** How many stages of the yard curve go by before another cyst swells up. */
const CYST_EVERY = 3;

// ---------------------------------------------------------------------------
// The vessels
// ---------------------------------------------------------------------------

/**
 * Where each tier taps into the network.
 *
 * `intake` is the mouth its crop is swallowed by, as a fraction of the plain's
 * width and depth — fractions rather than pixels, because the buffer's height
 * follows the element and a mouth pinned at a pixel depth ends up in the yard on
 * a short screen. `junction` is where its branch meets the trunk, in buffer
 * pixels along the trunk's run.
 *
 * Ordered so the branches fan rather than cross: a tier whose ground is further
 * back joins the trunk further along it.
 */
const RUNNER: Record<InsideId, { intake: { x: number; deep: number }; junction: number } | null> = {
  // At the foot of the gates, catching whatever comes through them.
  skin: { intake: { x: 0.17, deep: 0.05 }, junction: 24 },
  // Under the ploughed roof, where the shaken-loose crop comes down.
  furrow: { intake: { x: 0.35, deep: 0.14 }, junction: 52 },
  // Under the veins, which drip.
  vein: { intake: { x: 0.55, deep: 0.2 }, junction: 96 },
  // Under the Second Potato, off on its own at the right.
  second: { intake: { x: 0.86, deep: 0.1 }, junction: 142 },
  // At the quarry face.
  starch: { intake: { x: 0.71, deep: 0.36 }, junction: 118 },
  // In the sprout patch.
  eyes: { intake: { x: 0.26, deep: 0.54 }, junction: 38 },
  // Down in the yard by the wellheads, which is the one intake below the seam.
  mantle: { intake: { x: 0.49, deep: 1.22 }, junction: 70 },
  // The Chorus carry theirs by hand. That's the whole rung.
  chorus: null,
};

/** Order the branches are drawn in: back to front, so the near ones overlap. */
const RUNNER_ORDER: InsideId[] = ["second", "vein", "starch", "furrow", "skin", "eyes", "mantle"];

export type Pt = { x: number; y: number };

export function pathLength(pts: Pt[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  return total;
}

/** Where you are `d` pixels along a polyline. Clamped at both ends. */
export function pointAlong(pts: Pt[], d: number): Pt {
  if (d <= 0) return pts[0]!;
  let left = d;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg || i === pts.length - 1) {
      const k = seg > 0 ? Math.min(1, left / seg) : 1;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= seg;
  }
  return pts[pts.length - 1]!;
}

// ---------------------------------------------------------------------------

export class InsideScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ro?: ResizeObserver;
  private raf = 0;
  private sh = 200;
  /** Scene time in seconds, accumulated a capped frame at a time — see FarmScene. */
  private clock = 0;
  private view: FarmView = EMPTY_VIEW;
  private rng: () => number = mulberry32(1);
  private dt = 0;
  private lastFrame = performance.now();
  private motes: Mote[] = [];
  private dug: Dug[] = [];
  private puffs: Puff[] = [];
  private falling: Fall[] = [];
  private loose: Loose[] = [];
  private looseId = 0;
  private rides: Ride[] = [];
  private porters: Porter[] = [];
  /** Potatoes spat out of the mound's mouth, still in the air over the pile. */
  private delivered: { x: number; y: number; vy: number }[] = [];
  /**
   * When each tier's vessel started growing, on the scene clock. A tier that was
   * already standing when the tab opened is `-Infinity`: the network is grown
   * once, by the farm that first needed it, and a restore is not an install.
   */
  private grown = new Map<InsideId, number>();
  private sawView = false;
  /**
   * The hoard the yard is currently showing, which chases the real one rather
   * than snapping to it — spending should look like spending here too.
   */
  private shown = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.ctx.imageSmoothingEnabled = false;
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
    }
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = rect.width > 0 ? rect.height / rect.width : 1.1;
    this.sh = Math.max(90, Math.min(340, Math.round(SCENE_W * ratio)));
    this.canvas.width = SCENE_W;
    this.canvas.height = this.sh;
    this.ctx.imageSmoothingEnabled = false;
  }

  update(view: FarmView): void {
    const wiped =
      this.sawView && (view.seed !== this.view.seed || view.generation !== this.view.generation);
    this.view = view;
    if (wiped || !this.sawView) {
      this.rng = mulberry32(hashSeed(view.seed));
      this.clearOut();
    }
    // Anything standing on the first frame was already here; anything that turns
    // up later is an install, and the flesh visibly grows a vessel out to it.
    for (const id of ORDER) {
      const owned = view.working[id] ?? 0;
      if (owned > 0 && !this.grown.has(id)) {
        this.grown.set(id, this.sawView ? this.clock : -Infinity);
      } else if (owned <= 0) {
        this.grown.delete(id);
      }
    }
    this.sawView = true;
  }

  /** A different tuber entirely: handed down, or ploughed under. */
  private clearOut(): void {
    this.motes = [];
    this.dug = [];
    this.puffs = [];
    this.falling = [];
    this.loose = [];
    this.rides = [];
    this.porters = [];
    this.delivered = [];
    this.grown.clear();
    this.shown = Math.max(0, this.view.hoard);
  }

  start(): void {
    if (this.raf) return;
    this.lastFrame = performance.now();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro?.disconnect();
  }

  /**
   * A dig: a potato comes up out of the flesh where you put your finger.
   *
   * The same verb as outside and deliberately the same feedback — digging is the
   * one thing you do with your hands in either world, and it would be a strange
   * kind of continuity for it to feel different on the other side of the fold.
   */
  dig(at?: { x: number; y: number }): void {
    if (this.dug.length > 14) return;
    const top = this.floorY() - 6;
    const floor = this.sh - 8;
    const x = at
      ? Math.max(3, Math.min(SCENE_W - 8, Math.round(at.x)))
      : 20 + Math.random() * (SCENE_W - 60);
    const y = at ? Math.max(top, Math.min(floor, Math.round(at.y))) : top + 6 + Math.random() * 20;
    this.dug.push({ x: Math.round(x), y: Math.round(y), born: performance.now() });
    this.puff(x, y, -10);
    this.puff(x + 3, y, 10);
  }

  // --- Where the bands are ---------------------------------------------------

  private roofY(): number {
    return Math.round(this.sh * ROOF_SHARE);
  }

  /** The seam where the far wall meets the plain. The scene's horizon. */
  private floorY(): number {
    return Math.round(this.sh * (ROOF_SHARE + HOLLOW_SHARE));
  }

  /** The front edge of the plain, where the hoard starts. */
  private yardY(): number {
    return Math.round(this.sh * (ROOF_SHARE + HOLLOW_SHARE + FLOOR_SHARE));
  }

  /** How deep the plain is, which most of the layout is measured in. */
  private plainH(): number {
    return Math.max(12, this.yardY() - this.floorY());
  }

  /** Which mark of a tier to draw, given the upgrades bought on it. */
  private mark(id: InsideId): Art {
    const marks = PRODUCER_MARKS[id];
    const level = Math.max(0, Math.min(marks.length - 1, this.view.marks[id] ?? 0));
    return marks[level] ?? marks[0];
  }

  /** Owned a hundred of it, so it's lit. */
  private primed(id: InsideId): boolean {
    return (this.view.marks[id] ?? 0) >= 3;
  }

  private owned(id: InsideId): number {
    return this.view.working[id] ?? 0;
  }

  private working(id: InsideId): number {
    const place = PLACEMENT[id];
    return shownCount(this.owned(id), place.cap, place.spread);
  }

  /** Per-frame odds for something that should happen `perSec` times a second. */
  private chance(perSec: number): boolean {
    return Math.random() < perSec * this.dt;
  }

  // --- Drawing ---------------------------------------------------------------

  private draw(): void {
    const now = performance.now();
    // Capped, so a backgrounded tab doesn't come back with a minute of scene
    // time to catch up on and set every animation off at once.
    this.dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.clock += this.dt;
    const t = this.clock;

    const ctx = this.ctx;
    const roof = this.roofY();
    const floor = this.floorY();
    const yard = this.yardY();

    ctx.clearRect(0, 0, SCENE_W, this.sh);
    // The place first, then the dark over it, then everything you built on top
    // of the dark. That order is the whole reason a primed tier reads as a light
    // source down here rather than as a bright sprite: there's no sun inside a
    // potato, so the only thing lighting the picture is kit you paid for.
    this.drawHollow(roof, floor);
    this.drawCords(roof, floor, t);
    this.drawWall(roof, floor, t);
    this.drawRoof(roof, t);
    this.drawPlain(floor, yard);
    this.drawGloom(roof, yard);

    // Light, and then the things throwing it.
    this.drawSpill(floor, yard, t);
    this.drawGates(floor, t);
    this.drawFurrows(roof, t);
    this.drawVeins(roof, floor, t);
    this.drawSeconds(roof, t);
    this.drawMotes(roof, floor, t);

    this.stepFalling();
    this.drawFalling();

    this.drawSeams(floor, yard, t);

    // The plumbing, and everything riding it. Drawn over the back of the plain
    // and under everything that stands at the front of it, which is where a
    // vessel running down to the mound actually is.
    const runs = this.runners(t);
    this.drawVessels(runs, t);
    this.stepRides(runs);
    this.drawRides(runs);

    this.drawEyes(floor, yard, t);
    this.stepLoose(runs);
    this.drawLoose(t);
    this.drawHoard(yard);
    this.stepPorters(yard);
    this.drawChorus(t);
    this.drawTaps(yard, t);
    this.drawBroken(yard);
    this.drawDelivered(yard);
    this.drawDug(now);
    this.drawPuffs(now);

    this.emit(roof, floor, yard, t);
  }

  /** The cavity itself: warm dark, darkest at the bottom of the wall. */
  private drawHollow(roof: number, floor: number): void {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, roof, 0, floor);
    grad.addColorStop(0, HOLLOW_TOP);
    grad.addColorStop(1, HOLLOW_BOTTOM);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCENE_W, floor);
  }

  /**
   * Cords: old vessels strung across the hollow, ceiling to wall.
   *
   * Nothing hangs off them and nothing you buy puts them there — they're the
   * room's own architecture, and they exist because a cavity with nothing
   * spanning it has no depth. Deterministic off the seed, so they're this
   * tuber's insides rather than a different set every reload.
   */
  private drawCords(roof: number, floor: number, t: number): void {
    const ctx = this.ctx;
    const rng = mulberry32(hashSeed(this.view.seed) ^ 0x3f17);
    const band = Math.max(8, floor - roof);
    for (let i = 0; i < 5; i++) {
      const x0 = Math.round(rng() * SCENE_W);
      const x1 = Math.round(rng() * SCENE_W);
      const y0 = roof + Math.round(rng() * band * 0.2);
      const y1 = floor - Math.round(rng() * band * 0.25);
      const thick = rng() < 0.4 ? 2 : 1;
      const sway = 1 + rng() * 2;
      const phase = rng() * 7;
      const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0)));
      for (let s = 0; s <= steps; s++) {
        const k = s / steps;
        // A slack line, not a taut one: sag through the middle, and the whole
        // thing breathes with the room.
        const sag = Math.sin(k * Math.PI) * (4 + sway * 2);
        const x = Math.round(x0 + (x1 - x0) * k + Math.sin(t * 0.3 + phase + k * 3) * sway);
        const y = Math.round(y0 + (y1 - y0) * k + sag);
        ctx.fillStyle = rgba(VESSEL_DEEP, 0.45);
        ctx.fillRect(x, y, thick, thick);
      }
    }
  }

  /**
   * The far wall: a proper mass of flesh standing behind the plain, with fibre
   * running down it and a slow swell.
   *
   * It used to be a ragged fringe a dozen pixels high along the horizon, and the
   * cost of that was the gates — a door is a hole in something, and five doors
   * standing in front of a dark band read as five picture frames hung in the
   * air. Give the wall enough height to have doors cut in it and they're doors.
   */
  private drawWall(roof: number, floor: number, t: number): void {
    const ctx = this.ctx;
    const breathe = Math.sin(t * 0.4) * 0.5 + 0.5;
    const top = floor - Math.round((floor - roof) * 0.62);
    const grad = ctx.createLinearGradient(0, top, 0, floor);
    grad.addColorStop(0, mix(FLESH_DEEP, HOLLOW_BOTTOM, 0.45));
    grad.addColorStop(1, mix(FLESH_DEEP, FLESH_MID, 0.2));
    ctx.fillStyle = grad;

    // The crown of the wall, ragged. Drawn as columns so the skyline is the
    // thing that's uneven rather than the mass behind it.
    const crown: number[] = [];
    for (let x = 0; x < SCENE_W; x++) {
      const h = fract(Math.sin(x * 12.9898) * 43758.5453);
      const h2 = fract(Math.sin(x * 0.21 + 4.1) * 1731.7);
      const y = top + Math.round(h * 5 + h2 * 9 - breathe * 2);
      crown.push(y);
      ctx.fillRect(x, y, 1, floor - y);
    }

    // Fibre, running down it. Vertical, because the ceiling's runs across and
    // the turn between them is most of what says which surface you're looking at.
    //
    // Broken into strands rather than run floor to crown: a full-height line
    // every three pixels is a picket fence, and a wall of pickets was the first
    // thing anyone noticed about this wall.
    for (let x = 0; x < SCENE_W; x += 3) {
      const h = fract(Math.sin(x * 7.77 + 1.3) * 43758.5453);
      const h2 = fract(h * 137.7);
      if (h2 < 0.3) continue;
      const y = (crown[x] ?? top) + 3 + Math.round(h * (floor - top) * 0.55);
      const len = Math.max(2, Math.round(h2 * (floor - y) * 0.55));
      ctx.fillStyle = rgba(h > 0.55 ? FLESH_MID : HOLLOW_BOTTOM, 0.08 + h2 * 0.08);
      ctx.fillRect(x, y, 1, len);
    }

    // A rim of light along the crown, where the hollow's air catches it.
    for (let x = 0; x < SCENE_W; x++) {
      ctx.fillStyle = rgba(FLESH_MID, 0.28);
      ctx.fillRect(x, crown[x] ?? top, 1, 1);
    }

    // The seam the wall meets the plain on. The one hard line in the picture.
    ctx.fillStyle = INK;
    ctx.fillRect(0, floor - 1, SCENE_W, 1);
  }

  /**
   * The Periderm Gates: doors cut in the inside of the skin, standing along the
   * back wall in the order you cut them.
   *
   * They light the wall around them, which is the only thing in here throwing
   * light that you didn't have to buy a hundred of — the point of the rung is
   * that there's something on the other side.
   */
  private drawGates(floor: number, t: number): void {
    const ctx = this.ctx;
    const n = this.working("skin");
    if (n === 0) return;
    const sprite = artCanvas(this.mark("skin"));
    for (let i = 0; i < n; i++) {
      const { x, y } = this.gateAt(i, n, floor, sprite.w, sprite.h);
      // Whatever's through there isn't steady.
      const flicker = 0.16 + 0.06 * Math.sin(t * 1.1 + i * 2.1);
      this.glow(x + sprite.w / 2, y + sprite.h / 2, sprite.w * 1.6, "#ffe8b0", flicker);
      this.primeGlow("skin", x, y, sprite.w, sprite.h, t, i);
      ctx.drawImage(sprite.canvas, x, y);
      // The threshold: a lip of flesh worn smooth by what comes over it, so the
      // door meets the floor instead of stopping in mid-wall.
      ctx.fillStyle = INK;
      ctx.fillRect(x - 1, floor - 1, sprite.w + 2, 1);
      ctx.fillStyle = mix(STARCH, FLESH_MID, 0.4);
      ctx.fillRect(x, floor, sprite.w, 1);
    }
  }

  private gateAt(i: number, n: number, floor: number, w: number, h: number): Pt {
    const span = SCENE_W - 16;
    return {
      x: Math.round(8 + (span / Math.max(1, n)) * (i + 0.5) - w / 2),
      y: floor - h - 1,
    };
  }

  /**
   * What the gates throw on the floor in front of them.
   *
   * Drawn after the gloom and before the sprites, because it's light rather than
   * paint: a wedge widening away from the door, which is the cheapest way to say
   * the room behind it is brighter than this one.
   */
  private drawSpill(floor: number, yard: number, t: number): void {
    const ctx = this.ctx;
    const n = this.working("skin");
    if (n === 0) return;
    const sprite = artCanvas(this.mark("skin"));
    const depth = Math.round((yard - floor) * 0.42);
    for (let i = 0; i < n; i++) {
      const gate = this.gateAt(i, n, floor, sprite.w, sprite.h);
      const cx = gate.x + sprite.w / 2;
      const flicker = 0.9 + 0.1 * Math.sin(t * 1.1 + i * 2.1);
      for (let d = 0; d < depth; d++) {
        const k = d / depth;
        const half = sprite.w / 2 + k * 9;
        ctx.fillStyle = rgba("#ffe8b0", 0.15 * (1 - k) * flicker);
        ctx.fillRect(Math.round(cx - half), floor + d, Math.round(half * 2), 1);
      }
    }
  }

  /**
   * The ceiling. Flesh, lit from nothing in particular, with the fibre of it
   * running across rather than down — it's the same tissue as the wall seen from
   * the other side, and that turn is most of what says you're underneath it.
   *
   * Also where two tiers keep their ground: the scars the Inversion Furrows have
   * ploughed, and the vascular tree the Phloem Veins are clamped onto.
   */
  private drawRoof(roof: number, t: number): void {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, roof);
    grad.addColorStop(0, FLESH_LIT);
    grad.addColorStop(0.55, FLESH_MID);
    grad.addColorStop(1, FLESH_DEEP);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCENE_W, roof);

    // Fibre, deterministic off the seed so it's this farm's ceiling every time.
    const rng = mulberry32(hashSeed(this.view.seed) ^ 0x9e37);
    for (let i = 0; i < 26; i++) {
      const y = Math.round(rng() * roof);
      const x = Math.round(rng() * SCENE_W);
      const w = 6 + Math.round(rng() * 22);
      ctx.fillStyle = rgba(FLESH_DEEP, 0.14 + rng() * 0.12);
      ctx.fillRect(x, y, w, 1);
    }

    this.drawTree(roof);
    this.drawScars(roof, t);

    // The underside, hanging in. A ragged edge rather than a ruled one: nothing
    // in a potato is flat, and a straight ceiling reads as a floor upside down.
    for (let x = 0; x < SCENE_W; x += 2) {
      const h = fract(Math.sin(x * 7.13 + 2.7) * 43758.5453);
      const drop = Math.round(h * 5 + Math.sin(t * 0.5 + x * 0.05) * 0.8);
      ctx.fillStyle = mix(FLESH_DEEP, HOLLOW_TOP, 0.35);
      ctx.fillRect(x, roof, 2, drop);
    }
  }

  /**
   * The scars: strips of ceiling the Inversion Furrows have already been over,
   * ribbed the way ploughed ground is.
   *
   * This is the furrow tier's ground, and it's how the count reads at a glance —
   * one furrow has worked a short run of the roof, a hundred of them have the
   * whole ceiling in stripes.
   */
  private drawScars(roof: number, t: number): void {
    const ctx = this.ctx;
    const owned = this.owned("furrow");
    if (owned <= 0) return;
    const lanes = Math.max(1, Math.round(territory(owned, 1, 5)));
    const reach = territory(owned, 0.3, 1) * SCENE_W;
    for (let i = 0; i < lanes; i++) {
      const h = fract(Math.sin((i + 1) * 33.7) * 4375.85);
      const y = 2 + Math.round((i + 0.5) * ((roof - 4) / lanes));
      const from = Math.round(h * (SCENE_W - reach));
      // Ribs across the strip. The gap between them is what makes it ploughed
      // rather than shaded, so it stays at three pixels however wide the run
      // gets — at two it moirés against the buffer and the ceiling flickers.
      for (let x = from; x < from + reach && x < SCENE_W; x += 3) {
        if (x < 0) continue;
        ctx.fillStyle = rgba(FLESH_DEEP, 0.24);
        ctx.fillRect(x, y, 2, 3);
      }
      // The turned edge along the near side, catching what light there is.
      ctx.fillStyle = rgba(FLESH_LIT, 0.22 + 0.05 * Math.sin(t * 0.5 + i));
      ctx.fillRect(Math.max(0, from), y + 3, Math.round(reach), 1);
      ctx.fillStyle = rgba(FLESH_DEEP, 0.2);
      ctx.fillRect(Math.max(0, from), y - 1, Math.round(reach), 1);
    }
  }

  /**
   * The vascular tree the Phloem Veins are tapped into.
   *
   * A vein hanging on nothing is a clamp floating in a room. So the ceiling
   * grows plumbing, and how far the plumbing has branched is how many veins you
   * own — which makes the roof the second place on the canvas where a count you
   * can't fit on screen is legible as an amount of *place*.
   */
  private drawTree(roof: number): void {
    const ctx = this.ctx;
    const owned = this.owned("vein");
    if (owned <= 0) return;
    const depth = Math.round(territory(owned, 1, 4));
    const rng = mulberry32(hashSeed(this.view.seed) ^ 0x77c1);

    const limb = (x: number, y: number, dx: number, len: number, w: number, level: number) => {
      const x1 = x + dx;
      const y1 = Math.min(roof - 1, y + len);
      const steps = Math.max(2, Math.round(Math.hypot(dx, len)));
      for (let s = 0; s <= steps; s++) {
        const k = s / steps;
        const px = Math.round(x + (x1 - x) * k);
        const py = Math.round(y + (y1 - y) * k);
        ctx.fillStyle = rgba(VESSEL_DEEP, 0.75);
        ctx.fillRect(px, py, w, 1);
        if (w > 1) {
          ctx.fillStyle = rgba(SAP, 0.22);
          ctx.fillRect(px, py, 1, 1);
        }
      }
      if (level <= 0) return;
      const child = Math.max(1, w - 1);
      limb(x1, y1, -(3 + rng() * 7), (roof - y1) * 0.45, child, level - 1);
      limb(x1, y1, 3 + rng() * 7, (roof - y1) * 0.45, child, level - 1);
    };

    const trunks = Math.max(1, Math.round(territory(owned, 1, 3)));
    for (let i = 0; i < trunks; i++) {
      const x = Math.round(((i + 0.5) / trunks) * SCENE_W + (rng() - 0.5) * 20);
      limb(x, 0, (rng() - 0.5) * 8, roof * 0.4, Math.max(2, depth), depth);
    }
  }

  /**
   * The Inversion Furrows, ploughing the roof with their coulters biting upward.
   *
   * Hashed pace and phase, and alternating directions — a roof gets worked in
   * both, and evenly dealt starts at one speed draw a formation instead of a
   * farm.
   */
  private drawFurrows(roof: number, t: number): void {
    const ctx = this.ctx;
    const n = this.working("furrow");
    if (n === 0) return;
    const place = PLACEMENT.furrow;
    const sprite = artCanvas(this.mark("furrow"));
    const span = SCENE_W + sprite.w;
    const lanes = Math.max(1, Math.round(territory(this.owned("furrow"), 1, 5)));
    for (let i = 0; i < n; i++) {
      const h = fract(Math.sin((i + 1) * 33.7) * 4375.85);
      const pace = place.speed! * (0.75 + 0.5 * fract(h * 7.13));
      const dir = i % 2 === 0 ? 1 : -1;
      const raw = (t * pace + h * span) % span;
      const along = dir > 0 ? raw : span - raw;
      const x = Math.floor(((along % span) + span) % span) - sprite.w;
      // It rides in the scar it cut, so the strip under it is the strip it made.
      const lane = i % lanes;
      const y = 1 + Math.round((lane + 0.5) * ((roof - 4) / lanes)) - 1;
      this.primeGlow("furrow", x, y, sprite.w, sprite.h, t, i);
      ctx.drawImage(sprite.canvas, x, y);
      if (this.chance(3)) this.puff(x + sprite.w - 2, y + sprite.h, (Math.random() - 0.5) * 8, -6);
    }
  }

  /**
   * The Phloem Veins, hanging out of the ceiling with the clamp partway down.
   *
   * Drawn with the vessel running back up into the roof rather than stopping at
   * the top of the sprite: the rung is a tap on something that was already
   * there, and a clamp floating in mid-air is a clamp on nothing.
   */
  private drawVeins(roof: number, floor: number, t: number): void {
    const ctx = this.ctx;
    const n = this.working("vein");
    if (n === 0) return;
    const sprite = artCanvas(this.mark("vein"));
    // They hang to all sorts of depths. Clustered at the ceiling they read as a
    // second row of machinery bolted to the roof; spread down the band they read
    // as plumbing coming through a room.
    const drop = Math.max(6, (floor - roof) * 0.5);
    for (let i = 0; i < n; i++) {
      const { x, y } = this.veinAt(i, roof, drop, t);
      // The vessel it hangs off, running up out of the picture.
      ctx.fillStyle = "#5c3b58";
      ctx.fillRect(x + 2, roof - 4, 2, y - roof + 6);
      this.primeGlow("vein", x, y, sprite.w, sprite.h, t, i);
      ctx.drawImage(sprite.canvas, x, y);
      // A bead of sap working its way down the vessel.
      const bead = (t * 0.4 + fract(Math.sin((i + 1) * 91.3) * 4375.85)) % 1;
      ctx.fillStyle = SAP;
      ctx.fillRect(x + 2, y + sprite.h - 2 + Math.round(bead * 8), 2, 1);
    }
  }

  private veinAt(i: number, roof: number, drop: number, t: number): Pt {
    const h = fract(Math.sin((i + 1) * 91.3) * 4375.85);
    return {
      x: Math.round(10 + h * (SCENE_W - 24)),
      y: roof + 3 + Math.round(fract(h * 13.7) * drop) + Math.round(Math.sin(t * 0.6 + h * 7)),
    };
  }

  /**
   * The Second Potato. It hangs, high in the hollow, exactly where a sun would
   * be if this place had one — which is the entire joke and the reason it gets
   * that spot in both worlds.
   */
  private drawSeconds(roof: number, t: number): void {
    const ctx = this.ctx;
    const n = this.working("second");
    if (n === 0) return;
    const sprite = artCanvas(this.mark("second"));
    for (let i = 0; i < n; i++) {
      const { x, y } = this.secondAt(i, roof, t);
      this.glow(
        x + sprite.w / 2,
        y + sprite.h / 2,
        sprite.w * 1.8,
        "#f0c68c",
        0.16 + 0.05 * Math.sin(t * 0.8 + i),
      );
      this.primeGlow("second", x, y, sprite.w, sprite.h, t, i);
      ctx.drawImage(sprite.canvas, x, y);
    }
  }

  private secondAt(i: number, roof: number, t: number): Pt {
    const h = fract(Math.sin((i + 1) * 71.9) * 4375.85);
    return {
      x: SCENE_W - 38 - i * 34 + Math.round(Math.sin(t * 0.21 + h * 6) * 2),
      y: roof + 6 + Math.round(h * 12) + Math.round(Math.sin(t * 0.29 + h * 9) * 2),
    };
  }

  /**
   * Starch dust, drifting upward through the hollow.
   *
   * The one piece of pure atmosphere in the scene, and it earns its place: with
   * no weather, no crop cycle and no sky, an inside farm with nothing bought yet
   * would otherwise be a completely static picture.
   */
  private drawMotes(roof: number, floor: number, t: number): void {
    const ctx = this.ctx;
    const band = Math.max(1, floor - roof);
    while (this.motes.length < MOTES) {
      this.motes.push({
        x: this.rng() * SCENE_W,
        y: roof + this.rng() * band,
        rise: 2 + this.rng() * 5,
        sway: 3 + this.rng() * 7,
        phase: this.rng() * 7,
        bright: this.rng() < 0.3,
      });
    }
    for (const m of this.motes) {
      m.y -= m.rise * this.dt;
      if (m.y < roof - 2) {
        m.y = floor + 2;
        m.x = this.rng() * SCENE_W;
      }
      const x = Math.round(m.x + Math.sin(t * 0.5 + m.phase) * m.sway);
      ctx.fillStyle = rgba(m.bright ? "#f7f1dc" : STARCH, m.bright ? 0.5 : 0.26);
      ctx.fillRect(((x % SCENE_W) + SCENE_W) % SCENE_W, Math.round(m.y), 1, 1);
    }
  }

  /**
   * The plain: starch underfoot, going grey as the soil does, with the grain of
   * it running toward the mound.
   *
   * Soil is the same number it always was and it does the same job — it's what
   * the tuber's own damage is billed against — so the ground reading it is the
   * one habit worth carrying over from the field.
   *
   * The grain is new and it's doing the work the outside's crop rows do: an
   * unbroken tan gradient is a desert, and six lines converging on the corner
   * your hoard is in turn it into a floor with a downhill.
   */
  private drawPlain(floor: number, yard: number): void {
    const ctx = this.ctx;
    const health = clamp(this.view.soil, 0, 1);
    const near = mix(STARCH_TIRED, STARCH, health);
    const far = mix(STARCH_TIRED, STARCH_DARK, health);
    const grad = ctx.createLinearGradient(0, floor, 0, this.sh);
    grad.addColorStop(0, far);
    grad.addColorStop(1, near);
    ctx.fillStyle = grad;
    ctx.fillRect(0, floor, SCENE_W, this.sh - floor);

    // The grain. Every line runs from somewhere along the back wall down to the
    // mound, so the floor itself says where everything ends up.
    const depth = yard - floor;
    for (let i = 0; i <= 12; i++) {
      const backX = (i / 12) * (SCENE_W + 60) - 30;
      const steps = depth;
      for (let d = 0; d < steps; d += 1) {
        const k = d / steps;
        // Bunched toward the near end, the way lines converging on a point are.
        const x = Math.round(backX + (HEAP_CROWN_X - backX) * (k * k * 0.62));
        if (x < 0 || x >= SCENE_W) continue;
        ctx.fillStyle = rgba(STARCH_DARK, 0.18 + k * 0.2);
        ctx.fillRect(x, floor + d, 1, 1);
        ctx.fillStyle = rgba("#f7f1dc", 0.1 + k * 0.1);
        ctx.fillRect(x + 1, floor + d, 1, 1);
      }
    }

    // Broken flecks in the starch, deterministic, so the ground under your farm
    // is your farm's ground.
    const rng = mulberry32(hashSeed(this.view.seed) ^ 0x51ed);
    for (let i = 0; i < 26; i++) {
      const y = floor + Math.round(rng() * (this.sh - floor));
      const x = Math.round(rng() * SCENE_W);
      const w = 4 + Math.round(rng() * 18);
      ctx.fillStyle = rgba(rng() > 0.5 ? "#f7f1dc" : STARCH_DARK, 0.14 + rng() * 0.16);
      ctx.fillRect(x, y, w, 1);
    }

    this.drawQuarry(floor, yard);
    this.drawPatch(floor, yard);
    this.drawSpoil(yard);

    // The wall's shadow across the back of the plain. Without it the two bands
    // meet on a ruled line and the plain reads as a desert with a cliff behind
    // it rather than as the floor of the room the cliff is a wall of.
    const shade = Math.round((this.sh - floor) * 0.12);
    for (let d = 0; d < shade; d++) {
      ctx.fillStyle = rgba(HOLLOW_BOTTOM, 0.5 * (1 - d / shade));
      ctx.fillRect(0, floor + d, SCENE_W, 1);
    }

    // Where the plain stops being the farm and starts being the yard.
    ctx.fillStyle = rgba(INK, 0.25);
    ctx.fillRect(0, yard, SCENE_W, 1);
  }

  /**
   * The quarry the Starch Seams are cut into: a pale terraced bite out of the
   * back of the plain that widens as you buy more of them.
   *
   * The seams are the one rung down here that is a hole in the ground rather
   * than a thing standing on it, and until there was a hole for them to be in
   * they read as a row of pale rugs.
   */
  private drawQuarry(floor: number, yard: number): void {
    const owned = this.owned("starch");
    if (owned <= 0) return;
    const ctx = this.ctx;
    const half = this.quarryHalf();
    const cx = SCENE_W * 0.6;
    const top = this.quarryTop(floor, yard);
    const stepH = this.quarryStep(floor, yard);
    const deep = stepH * 2;

    // A pit, seen the way you see the rest of this floor: from over it and a
    // little in front. So it's a dark bite out of the plain with a bright near
    // rim, terraces stepping down inside it, and the spoil thrown out in front.
    //
    // Two goes at this were wrong the same way. Horizontal pale terraces read as
    // a stack of planks lying on the floor; vertical pale striations — a cut
    // face drawn square-on — read as a curtain hung across the room. The plain
    // is not a wall, and anything drawn on it has to agree about which way the
    // camera is pointing.
    for (let x = Math.round(cx - half); x < cx + half; x++) {
      if (x < 0 || x >= SCENE_W) continue;
      const k = (x - cx) / half;
      const round = Math.sqrt(Math.max(0, 1 - k * k));
      const h = fract(Math.sin(x * 4.71 + 0.9) * 43758.5453);
      const d = Math.round(deep * round - h * 2);
      if (d <= 1) continue;
      // Arced hard and jittered, because the far lip is the longest run of
      // constant y in the shape and without both it's a ruled line with a
      // shadow under it.
      const y0 = top + Math.round((1 - round) * 9 + h * 3);
      // The hole.
      ctx.fillStyle = rgba(HOLLOW_BOTTOM, 0.5);
      ctx.fillRect(x, y0, 1, d);
      // The far lip, cut into the flesh and in its own shadow.
      ctx.fillStyle = rgba(HOLLOW_BOTTOM, 0.66);
      ctx.fillRect(x, y0, 1, 2);
      // The near rim, which is the edge you'd be standing on.
      ctx.fillStyle = mix(STARCH, "#f7f1dc", 0.7);
      ctx.fillRect(x, y0 + d, 1, 2);
      ctx.fillStyle = rgba(STARCH_DARK, 0.4);
      ctx.fillRect(x, y0 + d + 2, 1, 1);
      // Terraces down the inside. Broken, so they're worked stone and not
      // contour lines on a map.
      for (let s = 1; s <= 2; s++) {
        if (fract(h * (11 * s)) > 0.55) continue;
        ctx.fillStyle = rgba("#f7f1dc", 0.3);
        ctx.fillRect(x, y0 + Math.round((d * s) / 3), 1, 1);
      }
    }

    // Spoil, thrown out in front of the near rim: what's been got out of it.
    for (let i = 0; i < 30; i++) {
      const h = fract(Math.sin((i + 1) * 63.7) * 4375.85);
      const h2 = fract(h * 137.7);
      const x = Math.round(cx - half + h * half * 2);
      const k = (x - cx) / half;
      const round = Math.sqrt(Math.max(0, 1 - k * k));
      const y = top + Math.round((1 - round) * 9 + deep * round) + 3 + Math.round(h2 * stepH);
      if (x < 0 || x >= SCENE_W) continue;
      ctx.fillStyle = rgba(h2 > 0.5 ? "#f7f1dc" : STARCH_DARK, 0.5);
      ctx.fillRect(x, y, 2, 1);
    }
  }

  private quarryHalf(): number {
    return territory(this.owned("starch"), 13, 52);
  }

  private quarryTop(floor: number, yard: number): number {
    return floor + Math.round((yard - floor) * 0.12);
  }

  private quarryStep(floor: number, yard: number): number {
    return Math.max(3, Math.round((yard - floor) * 0.08));
  }

  /**
   * The patch the Sprouting Eyes have taken: ground gone green at the edges,
   * spreading with the count.
   */
  private drawPatch(floor: number, yard: number): void {
    const owned = this.owned("eyes");
    if (owned <= 0) return;
    const ctx = this.ctx;
    const half = territory(owned, 14, 72);
    const cx = SCENE_W * 0.34;
    const top = floor + Math.round((yard - floor) * 0.34);
    const h = Math.round((yard - floor) * 0.5);
    const rng = mulberry32(hashSeed(this.view.seed) ^ 0x2b19);
    for (let i = 0; i < 90; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng());
      const x = Math.round(cx + Math.cos(a) * r * half);
      const y = Math.round(top + h / 2 + Math.sin(a) * r * (h / 2));
      if (x < 0 || x >= SCENE_W || y < floor || y > yard) continue;
      // Rootlets, not grass: a two pixel tick rather than a blade, because the
      // patch is the ground having been got into from underneath.
      ctx.fillStyle = rgba(SPROUT, 0.18 + rng() * 0.3);
      ctx.fillRect(x, y, 1, rng() > 0.6 ? 2 : 1);
    }
  }

  /** Spoil rings round the Mantle Taps' shaft mouths, growing with the count. */
  private drawSpoil(yard: number): void {
    const owned = this.owned("mantle");
    if (owned <= 0) return;
    const ctx = this.ctx;
    const n = this.working("mantle");
    const spread = Math.round(territory(owned, 5, 11));
    const sprite = artCanvas(this.mark("mantle"));
    for (let i = 0; i < n; i++) {
      const x = HEAP_W + 6 + i * 28 + Math.round(sprite.w / 2);
      if (x > SCENE_W - 2) break;
      for (let d = 0; d < 4; d++) {
        const w = spread * 2 - d * 3;
        if (w <= 0) break;
        ctx.fillStyle = rgba(STARCH_DARK, 0.26 - d * 0.04);
        ctx.fillRect(Math.round(x - w / 2), yard + 3 + d, w, 1);
      }
    }
  }

  /**
   * The Starch Seams, working the quarry face. Drawn first of the floor tiers
   * and furthest back, standing on the terraces they cut.
   */
  private drawSeams(floor: number, yard: number, t: number): void {
    const ctx = this.ctx;
    const n = this.working("starch");
    if (n === 0) return;
    const sprite = artCanvas(this.mark("starch"));
    for (let i = 0; i < n; i++) {
      const { x, y } = this.seamAt(i, n, floor, yard, sprite.w, sprite.h);
      this.primeGlow("starch", x, y, sprite.w, sprite.h, t, i);
      ctx.drawImage(sprite.canvas, x, y);
      if (this.chance(1.5)) this.puff(x + sprite.w / 2, y + sprite.h, (Math.random() - 0.5) * 12, -4);
    }
  }

  private seamAt(i: number, n: number, floor: number, yard: number, w: number, h: number): Pt {
    const half = this.quarryHalf();
    const cx = SCENE_W * 0.6;
    const top = this.quarryTop(floor, yard);
    const stepH = this.quarryStep(floor, yard);
    const hh = fract(Math.sin((i + 1) * 23.1) * 4375.85);
    // Spread along the face, one to a terrace as the count climbs, so a seam
    // always stands in the cut it made rather than beside it.
    const spot = n <= 1 ? 0.5 : i / (n - 1);
    const x = Math.round(cx - half + spot * (half * 2 - w) + (hh - 0.5) * 6);
    // Standing on the near rim, staggered a little in depth so a full crew
    // isn't a rank.
    const k = clamp((x + w / 2 - cx) / half, -1, 1);
    const round = Math.sqrt(Math.max(0, 1 - k * k));
    const y = top + Math.round((1 - round) * 9 + stepH * 2 * round) - h + 3 + Math.round(hh * 3);
    return { x: clamp(x, 1, SCENE_W - w - 1), y };
  }

  /**
   * The Sprouting Eyes. They don't do anything — they're the only rung on either
   * farm that is purely the potato's, so they sit there and grow, and what
   * animates is the sprout rather than any machinery.
   */
  private drawEyes(floor: number, yard: number, t: number): void {
    const ctx = this.ctx;
    const n = this.working("eyes");
    if (n === 0) return;
    const sprite = artCanvas(this.mark("eyes"));
    for (let i = 0; i < n; i++) {
      const { x, y } = this.eyeAt(i, floor, yard, sprite.h);
      // The sprout leans. Whole pixels, on a long slow cycle, so a field of them
      // sways out of step rather than in time.
      const h = fract(Math.sin((i + 1) * 41.7) * 4375.85);
      const lean = Math.sin(t * 0.6 + h * 6) > 0.35 ? 1 : 0;
      this.primeGlow("eyes", x, y, sprite.w, sprite.h, t, i);
      ctx.drawImage(sprite.canvas, x + lean, y);
    }
  }

  private eyeAt(i: number, floor: number, yard: number, h: number): Pt {
    const owned = this.owned("eyes");
    const half = territory(owned, 14, 72);
    const cx = SCENE_W * 0.34;
    const top = floor + Math.round((yard - floor) * 0.34);
    const band = Math.max(4, (yard - floor) * 0.46);
    const hh = fract(Math.sin((i + 1) * 41.7) * 4375.85);
    const h2 = fract(hh * 137.7);
    const x = Math.round(cx - half + hh * half * 2);
    return { x: clamp(x, 2, SCENE_W - 12), y: Math.round(top + h2 * band) - h };
  }

  // --- The vessels -----------------------------------------------------------

  /**
   * The trunk, from the mouth over your mound back along the front of the plain.
   *
   * Defined mouth-first because that's the end everything is going to and the
   * end it grows from: the flesh puts out plumbing toward whatever you install,
   * not the other way round.
   */
  private trunkPath(): Pt[] {
    const yard = this.yardY();
    return [
      // The mouth hangs over the mound rather than stopping at the seam: a
      // vessel that ends in the yard's empty top half is a vessel delivering
      // your crop to a patch of floor next to the pile.
      { x: 12, y: yard + 21 },
      { x: 10, y: yard - 7 },
      { x: 34, y: yard - 11 },
      { x: 84, y: yard - 13 },
      { x: 132, y: yard - 17 },
      { x: SCENE_W + 3, y: yard - 23 },
    ];
  }

  /** Where along the trunk a given junction sits. */
  private trunkAt(jx: number): Pt {
    const pts = this.trunkPath();
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (jx <= b.x || i === pts.length - 1) {
        const k = b.x === a.x ? 0 : clamp((jx - a.x) / (b.x - a.x), 0, 1);
        return { x: jx, y: Math.round(a.y + (b.y - a.y) * k) };
      }
    }
    return pts[pts.length - 1]!;
  }

  /** The trunk from a junction back to the mouth, as a polyline. */
  private trunkToMouth(jx: number): Pt[] {
    const pts = this.trunkPath();
    const out: Pt[] = [this.trunkAt(jx)];
    for (let i = pts.length - 1; i >= 0; i--) {
      if (pts[i]!.x < jx) out.push(pts[i]!);
    }
    return out;
  }

  private intakeAt(id: InsideId): Pt | null {
    const run = RUNNER[id];
    if (!run) return null;
    const floor = this.floorY();
    return {
      x: Math.round(run.intake.x * SCENE_W),
      y: Math.round(floor + run.intake.deep * this.plainH()),
    };
  }

  /**
   * Every vessel on the farm this frame: one branch per tier you own, and the
   * ride path each one's crop takes down to the mound.
   */
  private runners(t: number): Runner[] {
    const out: Runner[] = [];
    for (const id of RUNNER_ORDER) {
      const run = RUNNER[id];
      const owned = this.owned(id);
      if (!run || owned <= 0) continue;
      const intake = this.intakeAt(id)!;
      const junction = this.trunkAt(run.junction);
      const born = this.grown.get(id) ?? -Infinity;
      const grow = clamp((t - born) / RUNNER_GROW_S, 0, 1);
      // A slight kink halfway along, so a branch looks grown rather than ruled.
      const bend = fract(Math.sin(run.junction * 3.1) * 4375.85) - 0.5;
      const mid = {
        x: Math.round((junction.x + intake.x) / 2 + bend * 12),
        y: Math.round((junction.y + intake.y) / 2 + bend * 5),
      };
      const branch = [junction, mid, intake];
      out.push({
        id,
        branch,
        branchLen: pathLength(branch),
        grow,
        w: runnerWidth(owned),
        // Crop goes the other way: in at the mouth, along to the junction, and
        // down the trunk to the pile.
        ride: [intake, mid, ...this.trunkToMouth(run.junction)],
        intake,
      });
    }
    for (const r of out) r.rideLen = pathLength(r.ride);
    return out;
  }

  /**
   * The network, drawn: a trunk out of the mound with the branches joining it.
   *
   * There is no steel in here. The outside farm's answer to moving a potato is a
   * nine-pixel pipe on trestles, because that's what a farm builds; the inside's
   * is that the flesh grows you a vessel, so it's tissue-coloured, it bulges
   * where something is inside it, and it squeezes rather than pours.
   */
  private drawVessels(runs: Runner[], t: number): void {
    if (runs.length === 0) return;
    const ctx = this.ctx;

    // How far back the trunk has been laid: to the furthest branch that's
    // finished growing, plus however far the newest one has got.
    let reach = 0;
    for (const r of runs) reach = Math.max(reach, r.branch[0]!.x * (0.35 + 0.65 * r.grow));
    const trunk = this.trunkPath();
    const trunkLen = pathLength(trunk);
    // Trunk width from the widest thing feeding it: a farm running one tier gets
    // a thread, a farm running all eight gets a main.
    const tw = Math.min(4, runs.reduce((m, r) => Math.max(m, r.w), 1) + 1);
    let drawn = 0;
    for (let d = 0; d < trunkLen; d++) {
      if (pointAlong(trunk, d).x > reach) break;
      drawn = d;
    }
    this.stroke(trunk, drawn, tw, 1);

    for (const r of runs) {
      this.stroke(r.branch, r.branchLen * r.grow, r.w, 0.92, true);
      if (r.grow >= 1) this.drawIntake(r, t);
      else if (this.chance(10)) {
        // The tip of a vessel working its way out to something new.
        const tip = pointAlong(r.branch, r.branchLen * r.grow);
        this.puff(tip.x, tip.y, (Math.random() - 0.5) * 10, -4);
      }
    }

    // Peristalsis: a bright band travelling down every vessel toward the mound,
    // whether or not there's anything in it. It's what makes the network read as
    // alive and pumping rather than as pipe laid on the floor.
    for (const r of runs) {
      if (r.grow < 1) continue;
      const period = r.rideLen!;
      for (let k = 0; k < 3; k++) {
        const d = ((t * RUN_SPEED + (k * period) / 3) % period);
        const p = pointAlong(r.ride, d);
        ctx.fillStyle = rgba(VESSEL_LIT, 0.5);
        ctx.fillRect(Math.round(p.x - r.w / 2), Math.round(p.y - r.w / 2), r.w, 1);
      }
    }

    // The mouth over the mound, where it all comes out.
    const mouth = trunk[0]!;
    const pump = Math.round(0.5 + 0.5 * Math.sin(t * 3));
    // A funnel: wider than the trunk it's on the end of, tapering to an opening
    // that works. Drawn in courses rather than as a box, so it belongs to the
    // same picture as the cysts a few pixels to the right of it.
    for (let c = 0; c < 4; c++) {
      const w = 9 - c * 2;
      const x = mouth.x - Math.floor(w / 2);
      ctx.fillStyle = rgba(VESSEL_DEEP, 0.55);
      ctx.fillRect(x - 1, mouth.y - 4 + c, w + 2, 1);
      ctx.fillStyle = c === 0 ? mix(VESSEL, VESSEL_LIT, 0.5) : VESSEL;
      ctx.fillRect(x, mouth.y - 4 + c, w, 1);
    }
    ctx.fillStyle = mix(HOLLOW_BOTTOM, VESSEL_DEEP, 0.3);
    ctx.fillRect(mouth.x - 2 + pump, mouth.y, 4 - pump * 2, 2);
  }

  /**
   * One vessel, laid along a polyline: a soft shadow where it lifts the floor,
   * the body, and a lit line down the top of it.
   *
   * No hard outline. Everything else on this canvas is outlined in `INK` because
   * everything else is a *thing* standing on the ground; a vessel is the ground,
   * swollen, and a black keyline round it turned the whole network into pipework
   * lying on top of the farm rather than running under it.
   */
  private stroke(pts: Pt[], len: number, w: number, alpha: number, taper = false): void {
    const ctx = this.ctx;
    if (len <= 0) return;
    const full = pathLength(pts);
    // A branch is drawn from the trunk outward, so it's fattest where it joins
    // and finest at the mouth — which is the way a vein is, and which takes most
    // of the weight out of the network without taking any of it off the screen.
    const at = (d: number) => (taper ? Math.max(1, Math.round(w * (1 - (d / full) * 0.55))) : w);
    for (let d = 0; d <= len; d++) {
      const p = pointAlong(pts, d);
      const ww = at(d);
      const half = Math.floor(ww / 2);
      const x = Math.round(p.x) - half;
      const y = Math.round(p.y) - half;
      ctx.fillStyle = rgba(VESSEL_DEEP, alpha * 0.28);
      ctx.fillRect(x - 1, y + 1, ww + 2, ww + 1);
    }
    for (let d = 0; d <= len; d++) {
      const p = pointAlong(pts, d);
      const ww = at(d);
      const half = Math.floor(ww / 2);
      const x = Math.round(p.x) - half;
      const y = Math.round(p.y) - half;
      ctx.fillStyle = rgba(VESSEL, alpha * 0.85);
      ctx.fillRect(x, y, ww, ww);
      ctx.fillStyle = rgba(VESSEL_LIT, alpha * 0.4);
      ctx.fillRect(x, y, ww, 1);
    }
  }

  /** The mouth at the head of a branch, which loose potatoes roll into. */
  private drawIntake(r: Runner, t: number): void {
    const ctx = this.ctx;
    const p = r.intake;
    const gape = 1 + Math.round(0.5 + 0.5 * Math.sin(t * 2 + r.intake.x));
    // Wide and low. Squarer than this and it reads as a crate sitting on the
    // floor, which is the one thing a hole must not look like.
    const w = r.w + 6;
    const x = Math.round(p.x - w / 2);
    const y = Math.round(p.y) - 1;
    ctx.fillStyle = rgba(VESSEL_DEEP, 0.4);
    ctx.fillRect(x, y + 2, w, 2);
    ctx.fillStyle = VESSEL;
    ctx.fillRect(x + 1, y, w - 2, 3);
    ctx.fillStyle = rgba(VESSEL_LIT, 0.6);
    ctx.fillRect(x + 1, y, w - 2, 1);
    // The hole itself, which opens and closes. The only genuinely dark thing on
    // the plain, so a mouth reads as a way out of the picture.
    ctx.fillStyle = mix(HOLLOW_BOTTOM, VESSEL_DEEP, 0.25);
    ctx.fillRect(Math.round(p.x) - gape - 1, y + 1, gape * 2 + 2, 2);
  }

  /** Everything riding a vessel, moved along it. */
  private stepRides(runs: Runner[]): void {
    const by = new Map<InsideId, Runner>();
    for (const r of runs) by.set(r.id, r);
    this.rides = this.rides.filter((ride) => {
      const run = by.get(ride.id);
      if (!run) return false;
      ride.d += RUN_SPEED * this.dt;
      if (ride.d < run.rideLen!) return true;
      // Out of the mouth and onto the pile. It's already in the number at the
      // top of the screen — this is the last thing you see it do.
      const mouth = run.ride[run.ride.length - 1]!;
      if (this.delivered.length < 12) {
        this.delivered.push({ x: mouth.x, y: mouth.y + 3, vy: 8 });
      }
      return false;
    });
  }

  private drawRides(runs: Runner[]): void {
    const ctx = this.ctx;
    const potato = artCanvas(POTATO_SPRITE);
    const by = new Map<InsideId, Runner>();
    for (const r of runs) by.set(r.id, r);
    for (const ride of this.rides) {
      const run = by.get(ride.id);
      if (!run) continue;
      const p = pointAlong(run.ride, ride.d);
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      // The bulge it makes going past, then the potato itself, dimmed — it's
      // under a skin, and drawing it at full strength made the vessel look like
      // a gutter with potatoes sitting in it.
      //
      // The bulge is only a pixel wider than the vessel. It was three, and at
      // three every potato in the network drew a block bigger than the vessel
      // carrying it, so a busy farm's plumbing read as a chain of crates.
      const b = run.w + 1;
      const half = Math.floor(b / 2);
      ctx.fillStyle = rgba(VESSEL_DEEP, 0.4);
      ctx.fillRect(x - half - 1, y - half + 1, b + 2, b + 1);
      ctx.fillStyle = VESSEL;
      ctx.fillRect(x - half, y - half, b, b);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(potato.canvas, x - 3, y - 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = rgba(VESSEL_LIT, 0.4);
      ctx.fillRect(x - half, y - half, b, 1);
    }
  }

  // --- Everything that isn't in a vessel yet ---------------------------------

  /**
   * What each tier does, and how often.
   *
   * Once a second per drawn unit, roughly. Not tied to the actual rate — the
   * rate crosses twenty orders of magnitude over a run and any honest mapping is
   * either nothing or a solid wall of potatoes — but tied to the count you can
   * see, so more of a thing visibly makes more, which is the promise that
   * matters.
   */
  private emit(roof: number, floor: number, yard: number, t: number): void {
    // Out of the ceiling, behind a plough.
    const furrows = this.working("furrow");
    if (furrows > 0 && this.chance(flow(furrows))) {
      this.drop(4 + Math.random() * (SCENE_W - 12), roof + 2, floor, yard);
    }
    // Off a vein's clamp, when the bead at the bottom has got big enough.
    const veins = this.working("vein");
    if (veins > 0 && this.chance(flow(veins) * 0.85)) {
      const i = Math.floor(Math.random() * veins);
      const p = this.veinAt(i, roof, Math.max(6, (floor - roof) * 0.5), t);
      this.drop(p.x + 1, p.y + 12, floor, yard);
    }
    // Through a door, from whatever's on the other side of it.
    const gates = this.working("skin");
    if (gates > 0 && this.chance(flow(gates))) {
      const sprite = artCanvas(this.mark("skin"));
      const i = Math.floor(Math.random() * gates);
      const g = this.gateAt(i, gates, floor, sprite.w, sprite.h);
      this.drop(g.x + sprite.w / 2, g.y + sprite.h - 4, floor, yard, 0.25);
    }
    // Fruiting, high up where the sun was.
    const seconds = this.working("second");
    if (seconds > 0 && this.chance(flow(seconds) * 0.8)) {
      const sprite = artCanvas(this.mark("second"));
      const i = Math.floor(Math.random() * seconds);
      const p = this.secondAt(i, roof, t);
      this.drop(p.x + sprite.w / 2, p.y + sprite.h, floor, yard);
    }
    // Cut off the face.
    const seams = this.working("starch");
    if (seams > 0 && this.chance(flow(seams))) {
      const sprite = artCanvas(this.mark("starch"));
      const i = Math.floor(Math.random() * seams);
      const p = this.seamAt(i, seams, floor, yard, sprite.w, sprite.h);
      this.spawnLoose(p.x + sprite.w / 2, p.y + sprite.h);
      this.puff(p.x + sprite.w / 2, p.y + sprite.h, (Math.random() - 0.5) * 10, -5);
    }
    // Swollen enough to come away.
    const eyes = this.working("eyes");
    if (eyes > 0 && this.chance(flow(eyes) * 0.8)) {
      const sprite = artCanvas(this.mark("eyes"));
      const i = Math.floor(Math.random() * eyes);
      const p = this.eyeAt(i, floor, yard, sprite.h);
      this.spawnLoose(p.x + sprite.w / 2, p.y + sprite.h);
    }
    // Up the shaft.
    const taps = this.working("mantle");
    if (taps > 0 && this.chance(flow(taps))) {
      const sprite = artCanvas(this.mark("mantle"));
      const i = Math.floor(Math.random() * taps);
      const x = HEAP_W + 6 + i * 28 + sprite.w / 2;
      if (x < SCENE_W - 4) {
        this.spawnLoose(x, yard + 4 - sprite.h);
        this.puff(x, yard + 6 - sprite.h, (Math.random() - 0.5) * 12, -10);
      }
    }
  }

  /** Something coming down through the air, to land on the plain. */
  private drop(x: number, y: number, floor: number, yard: number, deep = 0.5): void {
    if (this.falling.length >= MAX_FALLING) return;
    const depth = Math.max(6, yard - floor);
    this.falling.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 10,
      vy: 0,
      land: floor + 3 + Math.random() * depth * deep,
      spin: Math.random() * 7,
    });
  }

  private stepFalling(): void {
    const dt = this.dt;
    this.falling = this.falling.filter((f) => {
      f.vy += FALL_G * dt;
      f.y += f.vy * dt;
      f.x += f.vx * dt;
      if (f.y < f.land) return true;
      this.spawnLoose(f.x, f.land);
      this.puff(f.x, f.land, -8, -4);
      this.puff(f.x, f.land, 8, -4);
      return false;
    });
  }

  private drawFalling(): void {
    const ctx = this.ctx;
    const potato = artCanvas(POTATO_SPRITE);
    for (const f of this.falling) {
      // Tumbling, at this size, is a one pixel nudge on a fast cycle. Anything
      // more honest needs rotation, and rotation resamples.
      const wob = Math.sin(this.clock * 9 + f.spin) > 0 ? 1 : 0;
      ctx.drawImage(potato.canvas, Math.round(f.x) - 3, Math.round(f.y) + wob);
    }
  }

  /**
   * A potato on the floor, looking for a way to the mound.
   *
   * It goes to whichever intake is nearest unless one of the Chorus gets to it
   * first, which is the whole difference between the two: the vessels are the
   * farm working, and the Chorus is somebody carrying it.
   */
  private spawnLoose(x: number, y: number): void {
    if (this.loose.length >= MAX_LOOSE) return;
    this.loose.push({
      id: this.looseId++,
      x: clamp(x, 3, SCENE_W - 4),
      y: clamp(y, this.floorY() + 2, this.sh - 6),
      to: null,
      wait: 0.25 + Math.random() * 0.5,
      held: false,
    });
  }

  private stepLoose(runs: Runner[]): void {
    const dt = this.dt;
    const ready = runs.filter((r) => r.grow >= 1);
    this.loose = this.loose.filter((l) => {
      if (l.held) return true;
      if (l.wait > 0) {
        l.wait -= dt;
        return true;
      }
      // Pick the mouth it's nearest, once, and stick with it — re-choosing every
      // frame makes a potato equidistant from two of them shiver in place.
      if (!l.to || !ready.some((r) => r.id === l.to)) {
        let best: Runner | null = null;
        let bestD = Infinity;
        for (const r of ready) {
          const d = Math.hypot(r.intake.x - l.x, r.intake.y - l.y);
          if (d < bestD) {
            bestD = d;
            best = r;
          }
        }
        if (!best) return true;
        l.to = best.id;
      }
      const run = ready.find((r) => r.id === l.to);
      if (!run) return true;
      const dx = run.intake.x - l.x;
      const dy = run.intake.y - l.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2.5) {
        if (this.rides.length < MAX_RIDES) this.rides.push({ id: run.id, d: 0 });
        return false;
      }
      const step = (ROLL_SPEED * dt) / dist;
      l.x += dx * step;
      l.y += dy * step;
      return true;
    });
  }

  private drawLoose(t: number): void {
    const ctx = this.ctx;
    const potato = artCanvas(POTATO_SPRITE);
    for (const l of this.loose) {
      if (l.held) continue;
      // Rolling: it bobs a pixel, which at five pixels tall is the whole of what
      // a roll can be.
      const roll = l.wait > 0 ? 0 : Math.sin(t * 11 + l.id) > 0 ? 1 : 0;
      ctx.fillStyle = rgba(INK, 0.22);
      ctx.fillRect(Math.round(l.x) - 3, Math.round(l.y) + 1, 7, 1);
      ctx.drawImage(potato.canvas, Math.round(l.x) - 3, Math.round(l.y) - 4 + roll);
    }
  }

  /**
   * The Chorus: the other yous, working a plain nobody assigned them.
   *
   * How many stand there leans on `generation` as well as on how many you own,
   * because that's the mechanic — every farm you handed down is still working —
   * and it's the only thing on either canvas that makes the meta-layer visible.
   *
   * What they *do* is carry. They were drifting along a line before, and a rung
   * you paid five hundred quadrillion for that visibly does nothing is a strange
   * thing to have on the screen; now they walk out to whatever's lying on the
   * floor, pick it up and take it to the pile, which is the same job the
   * farmhands do on the other side of the fold.
   */
  private crew(): number {
    const owned = this.owned("chorus");
    if (owned <= 0) return 0;
    const place = PLACEMENT.chorus;
    return Math.min(
      place.cap,
      shownCount(owned, place.cap, place.spread) + Math.min(3, this.view.generation - 1),
    );
  }

  private stepPorters(yard: number): void {
    const want = this.crew();
    const dt = this.dt;
    const drop = { x: HEAP_W + 2, y: yard + 14 };

    while (this.porters.length > want) {
      const gone = this.porters.pop();
      if (gone && gone.load >= 0) {
        const held = this.loose.find((l) => l.id === gone.load);
        if (held) held.held = false;
      }
    }
    while (this.porters.length < want) {
      const i = this.porters.length;
      const rank = Math.floor(i / 5);
      const home = 18 + (i % 5) * 30 + (rank % 2) * 15;
      const homeY = yard - 22 + rank * 8;
      this.porters.push({
        x: home,
        y: homeY,
        home: { x: home, y: homeY },
        loiter: { x: home, y: homeY },
        state: "idle",
        load: -1,
        until: 0,
      });
    }

    for (const p of this.porters) {
      switch (p.state) {
        case "idle": {
          // Idle ones amble rather than stand: a crew with nothing to lift
          // should read as people on a farm, not a rank waiting for a whistle.
          if (this.walk(p, p.loiter.x, p.loiter.y, dt, 0.4)) {
            p.loiter = {
              x: clamp(p.home.x + (Math.random() - 0.5) * 30, 6, SCENE_W - 8),
              y: clamp(p.home.y + (Math.random() - 0.5) * 16, this.floorY() + 8, yard - 4),
            };
          }
          if (this.clock < p.until) break;
          const free = this.loose.find((l) => !l.held && l.wait <= 0);
          if (!free) {
            p.until = this.clock + 0.4 + Math.random() * 0.8;
            break;
          }
          free.held = true;
          p.load = free.id;
          p.state = "fetch";
          break;
        }
        case "fetch": {
          const held = this.loose.find((l) => l.id === p.load);
          if (!held) {
            p.load = -1;
            p.state = "idle";
            break;
          }
          if (this.walk(p, held.x, held.y, dt, 1)) p.state = "carry";
          break;
        }
        case "carry": {
          const held = this.loose.find((l) => l.id === p.load);
          if (!held) {
            p.load = -1;
            p.state = "idle";
            break;
          }
          held.x = p.x;
          held.y = p.y - 9;
          if (this.walk(p, drop.x, drop.y, dt, 1)) {
            this.loose = this.loose.filter((l) => l.id !== p.load);
            this.delivered.push({ x: p.x, y: p.y - 6, vy: 4 });
            this.puff(p.x, p.y, (Math.random() - 0.5) * 8, -6);
            p.load = -1;
            p.state = "back";
          }
          break;
        }
        case "back": {
          if (this.walk(p, p.home.x, p.home.y, dt, 0.9)) {
            p.state = "idle";
            p.until = this.clock + Math.random() * 0.6;
          }
          break;
        }
      }
    }
  }

  /** Step a walker toward a spot. True the frame it gets there. */
  private walk(p: { x: number; y: number }, tx: number, ty: number, dt: number, pace: number): boolean {
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1.2) return true;
    const step = Math.min(dist, PORTER_SPEED * pace * dt);
    p.x += (dx / dist) * step;
    p.y += (dy / dist) * step;
    return false;
  }

  private drawChorus(t: number): void {
    const ctx = this.ctx;
    if (this.porters.length === 0) return;
    const sprite = artCanvas(this.mark("chorus"));
    const potato = artCanvas(POTATO_SPRITE);
    // Nearest last, so a crew crossing each other overlaps the right way round.
    const order = [...this.porters].sort((a, b) => a.y - b.y);
    for (let i = 0; i < order.length; i++) {
      const p = order[i]!;
      const x = Math.round(p.x) - 3;
      // A pixel of bob while moving, a stoop while idle. Both whole pixels.
      const moving = p.state !== "idle";
      const bob = moving && Math.sin(t * 7 + i) > 0 ? 1 : 0;
      const stoop = !moving && Math.sin(t * 0.7 + i * 5) > 0.7 ? 2 : 0;
      const y = Math.round(p.y) - sprite.h + bob + stoop;
      this.primeGlow("chorus", x, y, sprite.w, sprite.h, t, i);
      ctx.fillStyle = rgba(INK, 0.2);
      ctx.fillRect(x, Math.round(p.y), sprite.w, 1);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(sprite.canvas, x, y);
      ctx.globalAlpha = 1;
      if (p.state === "carry") ctx.drawImage(potato.canvas, x, y - 5);
    }
  }

  /** Potatoes arriving on the pile, from a vessel's mouth or somebody's hands. */
  private drawDelivered(yard: number): void {
    const ctx = this.ctx;
    const potato = artCanvas(POTATO_SPRITE);
    const rest = this.sh - 6;
    this.delivered = this.delivered.filter((d) => {
      d.vy += FALL_G * this.dt;
      d.y += d.vy * this.dt;
      // Onto the mound, which is somewhere between the crown and the floor
      // depending on how much of it there is — close enough at this size.
      const stop = Math.max(yard + 12, rest - 26);
      if (d.y >= stop) {
        this.puff(d.x, stop, (Math.random() - 0.5) * 10, -6);
        return false;
      }
      ctx.drawImage(potato.canvas, Math.round(d.x) - 3, Math.round(d.y));
      return true;
    });
  }

  /**
   * The Mantle Taps, at the front with their shafts running off the bottom of
   * the world. Drawn after the hoard so they stand in front of the stores, and
   * the shaft simply runs out of the buffer — the cheapest way to say it goes
   * further than you'd like.
   */
  private drawTaps(yard: number, t: number): void {
    const ctx = this.ctx;
    const n = this.working("mantle");
    if (n === 0) return;
    const sprite = artCanvas(this.mark("mantle"));
    const foot = yard + 4;
    for (let i = 0; i < n; i++) {
      const x = HEAP_W + 6 + i * 28;
      if (x + sprite.w > SCENE_W - 2) break;
      const top = foot - sprite.h;
      this.primeGlow("mantle", x, top, sprite.w, sprite.h, t, i);
      ctx.drawImage(sprite.canvas, x, top);
      // The shaft carries on past the bottom of the screen, fading as it goes.
      // Drawn solid it's a hard brown bar the full depth of the yard, and four
      // of them slice the hoard into strips — which is the one thing in front of
      // the player that has to stay readable.
      const deep = this.sh - foot;
      for (let d = 0; d < deep; d++) {
        const a = 1 - d / deep;
        ctx.fillStyle = rgba(INK, a * 0.9);
        ctx.fillRect(x + 3, foot + d, 1, 1);
        ctx.fillRect(x + 6, foot + d, 1, 1);
        ctx.fillStyle = rgba("#5b3f2c", a * 0.9);
        ctx.fillRect(x + 4, foot + d, 2, 1);
      }
      // The pump beat, and a breath off the head each stroke.
      const beat = (t * 0.9 + i * 0.37) % 1;
      if (beat < 0.08) {
        ctx.fillStyle = "#ffb454";
        ctx.fillRect(x + 4, top + 2, 2, 1);
        if (this.chance(6)) this.puff(x + 5, top, (Math.random() - 0.5) * 10, -8);
      }
    }
  }

  /**
   * The hoard: a mound of potatoes at the front, with the flesh swelling up
   * around it into cysts as you get richer.
   *
   * The mound chases the real number rather than snapping to it, which is what
   * makes spending look like spending — buy a rung and you watch the pile come
   * down.
   */
  private drawHoard(yard: number): void {
    const ctx = this.ctx;
    const target = Math.max(0, this.view.hoard);
    if (this.shown < 0) this.shown = target;
    // Exponential chase on the magnitude, so it takes about the same moment to
    // cross one order as the next.
    const k = 1 - Math.pow(0.06, this.dt);
    this.shown += (target - this.shown) * k;
    const layout = yardLayout(this.shown);

    // The cysts first: the mound is heaped in front of them.
    const cysts = Math.min(CYST_SLOTS.length, Math.floor(layout.stage / CYST_EVERY));
    for (let i = 0; i < cysts; i++) this.drawCyst(CYST_SLOTS[i]!, yard);

    const potato = artCanvas(POTATO_SPRITE);
    const slots = heapSlots();
    const heap = Math.min(HEAP_CAP, Math.max(0, Math.round(layout.heap)));
    const foot = this.sh - 3;
    for (let i = 0; i < heap; i++) {
      const slot = slots[i];
      if (!slot) break;
      ctx.drawImage(potato.canvas, slot.x, foot + slot.y);
    }
  }

  /**
   * One swelling in the flesh, drawn rather than blitted.
   *
   * A dome built out of narrowing courses, because a cyst is the one thing in
   * either scene whose size is a *variable* — it's how much of your hoard the
   * tuber has grown around — and a sprite would mean ten sprites. Outlined and
   * lit from the top left like everything else on the canvas, so it sits in the
   * same world as the art it stands next to instead of reading as a UI shape.
   */
  private drawCyst(slot: { x: number; row: number; w: number }, yard: number): void {
    const ctx = this.ctx;
    const base = yard + 5 + slot.row * 6;
    const courses = Math.max(2, Math.round(slot.w / 2.4));
    const skin = mix(STARCH, FLESH_MID, 0.3);
    for (let c = 0; c < courses; c++) {
      // Narrows faster near the crown, which is what makes it a dome and not a
      // ziggurat. Whole pixels: no rounding fudge on a 176-wide buffer.
      const inset = Math.round(Math.pow(c / courses, 1.5) * (slot.w / 2));
      const w = slot.w - inset * 2;
      if (w <= 0) break;
      const y = base - c;
      ctx.fillStyle = INK;
      ctx.fillRect(slot.x + inset - 1, y, w + 2, 1);
      ctx.fillStyle = c === courses - 1 ? mix(skin, "#f7f1dc", 0.5) : skin;
      ctx.fillRect(slot.x + inset, y, w, 1);
    }
    // The seam it grew out of, and the shine down its left shoulder.
    ctx.fillStyle = INK;
    ctx.fillRect(slot.x - 1, base + 1, slot.w + 2, 1);
    ctx.fillStyle = rgba("#f7f1dc", 0.45);
    ctx.fillRect(slot.x + 2, base - courses + 2, 1, Math.max(1, courses - 3));
  }

  /**
   * What the tuber closed around, left where it stands in a strip along the
   * front. One strip of dead kit is a thing you notice from across the room;
   * the same units scattered among the working ones is not.
   *
   * It starts clear of the left corner, which is where the trunk vessel comes
   * down into the mound — the one thing in the yard that has to stay legible.
   */
  private drawBroken(yard: number): void {
    const ctx = this.ctx;
    let x = 20;
    for (const id of ORDER) {
      const place = PLACEMENT[id];
      const n = shownCount(this.view.broken[id] ?? 0, place.cap, place.spread);
      for (let i = 0; i < n; i++) {
        const dead = artTinted(this.mark(id), "#6b6b74", 0.62);
        if (x + dead.w > SCENE_W - 6) return;
        ctx.drawImage(dead.canvas, x, yard - dead.h + 2);
        x += dead.w + 3;
      }
    }
  }

  private drawDug(now: number): void {
    const ctx = this.ctx;
    const potato = artCanvas(POTATO_SPRITE);
    this.dug = this.dug.filter((d) => now - d.born < DUG_MS);
    for (const d of this.dug) {
      const age = (now - d.born) / DUG_MS;
      // Up out of the flesh, hang, and gone.
      const lift = Math.round(Math.sin(Math.min(1, age * 1.6) * Math.PI * 0.5) * 5);
      ctx.globalAlpha = age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1;
      ctx.drawImage(potato.canvas, d.x, d.y - lift);
      ctx.globalAlpha = 1;
    }
  }

  private puff(x: number, y: number, vx: number, vy = -6): void {
    if (this.puffs.length >= MAX_PUFFS) return;
    this.puffs.push({ x, y, vx, vy, born: performance.now(), life: 500 + Math.random() * 400 });
  }

  private drawPuffs(now: number): void {
    const ctx = this.ctx;
    this.puffs = this.puffs.filter((p) => now - p.born < p.life);
    for (const p of this.puffs) {
      const age = (now - p.born) / p.life;
      const x = Math.round(p.x + p.vx * age);
      const y = Math.round(p.y + p.vy * age);
      ctx.fillStyle = rgba("#e6dcc0", 0.35 * (1 - age));
      ctx.fillRect(x, y, 2, 2);
    }
  }

  /** The dark the room is in before anything of yours is standing in it. */
  private drawGloom(roof: number, yard: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = rgba("#1a1008", GLOOM);
    ctx.fillRect(0, roof, SCENE_W, this.sh - roof);
    // The roof takes less: it's the closest thing to a source in the picture.
    ctx.fillStyle = rgba("#1a1008", GLOOM * 0.45);
    ctx.fillRect(0, 0, SCENE_W, roof);
    // And the yard is warmed rather than dimmed, because the hoard is the thing
    // you came back to look at.
    ctx.fillStyle = rgba("#f0c68c", 0.06);
    ctx.fillRect(0, yard, SCENE_W, this.sh - yard);
  }

  // --- Light -----------------------------------------------------------------

  private glow(cx: number, cy: number, r: number, color: string, alpha: number): void {
    if (alpha <= 0.001 || r <= 0) return;
    const ctx = this.ctx;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, rgba(color, alpha));
    grad.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }

  /**
   * What a hundred-owned tier throws. It breathes, on a phase taken from the
   * unit's index — a whole plain of them pulsing in lockstep reads as a shader.
   */
  private primeGlow(
    id: InsideId,
    x: number,
    y: number,
    w: number,
    h: number,
    t: number,
    idx = 0,
    scale = 1,
  ): void {
    if (!this.primed(id)) return;
    const pulse = 0.7 + 0.3 * Math.sin(t * 1.5 + idx * 2.3);
    this.glow(x + w / 2, y + h / 2, Math.max(w, h) * 0.9 * scale, PRIME_GLOW[id], 0.4 * pulse * scale);
  }
}

/** One tier's plumbing, as laid out this frame. */
interface Runner {
  id: InsideId;
  /** Junction to intake, which is the way it grows. */
  branch: Pt[];
  branchLen: number;
  /** 0 while the flesh is still putting it out, 1 once it's carrying. */
  grow: number;
  w: number;
  /** Intake to the mouth over the mound, which is the way the crop goes. */
  ride: Pt[];
  rideLen?: number;
  intake: Pt;
}
