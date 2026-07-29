/**
 * The homestead, drawn.
 *
 * A low-res buffer (SCENE_W wide, height matched to the element's aspect so
 * nothing letterboxes) scaled up crisply by CSS `image-rendering: pixelated`,
 * with its own rAF loop. Same approach as cozy_sprites' habitat.
 *
 * The screen is three bands, and the split is the whole point of the rework:
 * the middle band is the **farm** — every producer you own has a silhouette out
 * there, and broken kit is visibly broken — and the front band is the **hoard**,
 * the potatoes you're actually holding, piled in the yard. Spend and the yard
 * shrinks; leave the tab open and it grows. Two numbers that used to be text.
 *
 * RENDERING RULE (inherited, and it matters): every blit is integer-aligned and
 * unscaled. No ctx.scale/rotate on any sprite. At this buffer size a fractional
 * transform resamples the art off the pixel grid and 1px outlines double or
 * vanish. Animation is translation only.
 */

import type { solo } from "@battle/sim";

import {
  BARN,
  BARROW,
  CLOUD,
  CRATE,
  ELEVATOR,
  FENCE,
  cropStages,
  FLOWERS,
  POTATO_SPRITE,
  PRODUCER_MARKS,
  SACK,
  SHED,
  SILO,
  TREE,
  TUFT,
  withered,
} from "./art.js";
import { artCanvas, artTinted, type Art } from "./pixel.js";

export const SCENE_W = 176;

const YARD_SHARE = 0.23; // the hoard yard, front band — deep enough to stand a silo in
const FIELD_SHARE = 0.46; // the working field
const MIN_SKY = 20;

const GRASS = "#6aa348";
const GRASS_DARK = "#5b8f3d";
const DIRT = "#8a5f3f";
const DIRT_DARK = "#6b4630";

/** What the scene needs to know. Everything else stays in the sim. */
export interface FarmView {
  /** Working (unbroken) count per producer. */
  working: Partial<Record<solo.SoloProducerId, number>>;
  /** Broken count per producer — drawn, greyed out, right where it stands. */
  broken: Partial<Record<solo.SoloProducerId, number>>;
  /**
   * How many of a producer's two upgrades you own, 0-2. Picks which mark of
   * that tier gets drawn — spending on a tier changes something out in the
   * field, not just a number in a panel.
   */
  marks: Partial<Record<solo.SoloProducerId, number>>;
  /** 0..1. Drags the field's colour and wilts a share of the crop. */
  soil: number;
  /** Potatoes on hand. Drives the whole yard. */
  hoard: number;
  /** Stable across reloads, so the farm's layout is *your* farm's layout. */
  seed: string;
}

export const EMPTY_VIEW: FarmView = {
  working: {},
  broken: {},
  marks: {},
  soil: 1,
  hoard: 0,
  seed: "0",
};

// ---------------------------------------------------------------------------
// Time of day. The farm runs on the wall clock, so the sky should too.
// ---------------------------------------------------------------------------

type Phase = "day" | "dusk" | "night";

function phaseNow(): Phase {
  const h = new Date().getHours();
  if (h >= 20 || h < 5) return "night";
  if (h < 7 || h >= 18) return "dusk";
  return "day";
}

const SKY: Record<Phase, { top: string; bottom: string; hill: string; hillFar: string }> = {
  day: { top: "#8fd3f4", bottom: "#c9ecf7", hill: "#5f9c46", hillFar: "#79ad5e" },
  dusk: { top: "#4a4a86", bottom: "#f0a878", hill: "#3f6b39", hillFar: "#557c48" },
  night: { top: "#1d1f42", bottom: "#3a3564", hill: "#25402c", hillFar: "#2f4a35" },
};

// ---------------------------------------------------------------------------
// Deterministic jitter — a farm's layout shouldn't reshuffle on every render.
// ---------------------------------------------------------------------------

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The fractional part, always positive. Used for cheap per-index hashing. */
function fract(x: number): number {
  return ((x % 1) + 1) % 1;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// The hoard
// ---------------------------------------------------------------------------

/**
 * The yard doesn't count your potatoes. It shows what you've built with them.
 *
 * Two earlier goes at this both counted, and counting is the problem. Place
 * value emptied the whole yard every time you crossed a power of ten. Rows of
 * units fixed that but replaced it with a bar chart: forty identical sprites
 * where the only difference between a millionaire and a billionaire was three
 * more crates in the same strip.
 *
 * So: a build-out. The yard passes through a fixed sequence of stages, each
 * arriving at a threshold and each *adding one thing* to a spot that is its
 * spot forever — a sack, then another, then a crate, a barrow, a shed, a silo,
 * eventually a grain elevator standing over the fence line. You don't read the
 * yard, you recognise it. Between stages the working heap grows, so there's
 * always something moving, and it's the heap that gets hauled into whatever
 * arrives next.
 *
 * Thresholds are roughly one stage per four-and-a-bit times richer. That's
 * granular enough that clearing out your bank for an upgrade visibly costs you
 * a building or two, and you watch them come back.
 */
interface Prop {
  art: Art;
  /** Left edge, in buffer pixels. */
  x: number;
  /** Which depth station it stands on: 0 is the front edge of the yard. */
  row: number;
}

interface Stage {
  /** Potatoes on hand at which this stage arrives. */
  at: number;
  /** How big the working heap grows before the next stage takes it away. */
  heap: number;
  /** The one thing this stage puts in the yard. The early stages are heap only. */
  add?: Prop;
}

const p = (art: Art, x: number, row: number): Prop => ({ art, x, row });

/**
 * The build-out, in order. Positions are hand-placed rather than generated:
 * the left of the yard is the working end (sacks, crates, sheds), the right is
 * the heap with the tall stuff standing behind it.
 *
 * It runs out at around a hundred trillion, which is past the last thing on the
 * price list. A yard with everything in it is a fine place for the ladder to
 * stop.
 */
export const YARD: Stage[] = [
  { at: 0, heap: 3 },
  { at: 3, heap: 6 },
  { at: 10, heap: 10 },
  { at: 30, heap: 15 },
  { at: 80, heap: 21 },
  { at: 200, heap: 21, add: p(SACK, 6, 0) },
  { at: 900, heap: 21, add: p(SACK, 20, 0) },
  { at: 4e3, heap: 21, add: p(CRATE, 2, 1) },
  { at: 2e4, heap: 21, add: p(BARROW, 36, 0) },
  { at: 8e4, heap: 21, add: p(SACK, 52, 0) },
  { at: 3e5, heap: 21, add: p(CRATE, 20, 1) },
  { at: 1.5e6, heap: 21, add: p(SHED, 8, 2) },
  { at: 6e6, heap: 21, add: p(SILO, 90, 3) },
  { at: 3e7, heap: 21, add: p(CRATE, 38, 1) },
  { at: 1.2e8, heap: 21, add: p(SACK, 68, 0) },
  { at: 5e8, heap: 21, add: p(SILO, 106, 3) },
  { at: 2e9, heap: 21, add: p(CRATE, 56, 1) },
  { at: 1e10, heap: 21, add: p(ELEVATOR, 52, 3) },
  { at: 4e10, heap: 21, add: p(CRATE, 74, 1) },
  { at: 2e11, heap: 21, add: p(SILO, 122, 3) },
  { at: 8e11, heap: 21, add: p(CRATE, 92, 1) },
  { at: 3e12, heap: 21, add: p(SHED, 40, 2) },
  { at: 1.5e13, heap: 21, add: p(SILO, 138, 3) },
  { at: 6e13, heap: 21, add: p(ELEVATOR, 28, 3) },
];

interface YardLayout {
  /** Index into YARD. Everything up to and including it is standing. */
  stage: number;
  /** Potatoes in the working heap, 0..the stage's cap. */
  heap: number;
}

export function yardLayout(amount: number): YardLayout {
  const a = Math.max(0, amount);
  let stage = 0;
  while (stage + 1 < YARD.length && a >= YARD[stage + 1]!.at) stage++;

  const here = YARD[stage]!;
  const next = YARD[stage + 1];
  let frac = 1;
  if (next) {
    // The first stage counts potatoes; every stage after it counts magnitudes,
    // because that's the only scale on which the later ones are the same size.
    frac =
      stage === 0
        ? a / next.at
        : (Math.log10(a) - Math.log10(here.at)) / (Math.log10(next.at) - Math.log10(here.at));
  }
  return { stage, heap: Math.max(0, Math.min(here.heap, Math.floor(frac * here.heap))) };
}

function sameLayout(a: YardLayout, b: YardLayout): boolean {
  return a.stage === b.stage && a.heap === b.heap;
}

/**
 * The working heap: a mound, front-right, where every dug potato is already
 * being thrown. Six wide at the base, each course half a potato in from the one
 * below, and the potatoes overlapping by a pixel — a heap of anything touches
 * itself, and spaced out on a grid it reads as a row of items instead.
 *
 * Courses fill from the middle outward, so three potatoes are a small pile
 * rather than the left end of a big one.
 */
const HEAP_BASE = 6;
const HEAP_X = 121;
const HEAP_STEP = 6;
export const HEAP_CAP = (HEAP_BASE * (HEAP_BASE + 1)) / 2;

let heapCache: { x: number; y: number }[] | null = null;

function heapSlots(): { x: number; y: number }[] {
  if (!heapCache) {
    const h = artCanvas(POTATO_SPRITE).h;
    heapCache = [];
    for (let course = 0; course < HEAP_BASE; course++) {
      const n = HEAP_BASE - course;
      const order = Array.from({ length: n }, (_, i) => i).sort(
        (a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2),
      );
      for (const i of order) {
        heapCache.push({
          x: HEAP_X + course * 3 + i * HEAP_STEP,
          y: -h - course * 3 - (i % 2),
        });
      }
    }
  }
  return heapCache;
}

/**
 * A handful of potatoes being carried into the unit they just added up to, or
 * a unit coming apart because you spent it. Short-lived, purely cosmetic, and
 * the only thing on this canvas that interpolates a position — it still lands
 * on whole pixels.
 */
interface Bundle {
  art: Art;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  born: number;
  dur: number;
  /** Rises and fades instead of travelling. Used for potatoes you spent. */
  poof: boolean;
}

// ---------------------------------------------------------------------------
// Producer placement
// ---------------------------------------------------------------------------

/** A producer flying, driving or standing somewhere specific. */
type Band = "sky" | "back" | "field" | "walk";

interface Placement {
  band: Band;
  /** How many of the thing ever appear, however many you own. */
  cap: number;
  /** Drives across the field rather than standing in it. */
  speed?: number;
  /**
   * How fast the drawn count climbs with the owned count. Crops are cheap to
   * draw and a field is *made of* them, so beds get a much steeper curve than
   * machines — a dozen plants reads as a farm, a dozen combines reads as a mess.
   */
  spread?: number;
}

const PLACEMENT: Record<solo.SoloProducerId, Placement> = {
  plot: { band: "field", cap: 95, spread: 9 },
  hand: { band: "walk", cap: 6 },
  irrigation: { band: "field", cap: 4 },
  // Slow. A tractor that crosses the screen in fifteen seconds is a tractor
  // working a field; one that does it in five is a toy being pushed along.
  tractor: { band: "field", cap: 3, speed: 6 },
  harvester: { band: "field", cap: 2, speed: 4.5 },
  lab: { band: "back", cap: 3 },
  refinery: { band: "back", cap: 2 },
  tower: { band: "back", cap: 4 },
  seeder: { band: "sky", cap: 3, speed: 2.5 },
  reactor: { band: "back", cap: 2 },
  orbital: { band: "sky", cap: 2, speed: 7 },
  singularity: { band: "sky", cap: 2 },
};

const ORDER: solo.SoloProducerId[] = [
  "plot",
  "hand",
  "irrigation",
  "tractor",
  "harvester",
  "lab",
  "refinery",
  "tower",
  "seeder",
  "reactor",
  "orbital",
  "singularity",
];

/**
 * How many of a tier to actually draw. Counts run to hundreds and the field
 * holds a couple of dozen things before it's soup, so the mapping is
 * logarithmic: the first few are one-for-one and after that it takes a
 * doubling to add another silhouette.
 */
function shownCount(owned: number, cap: number, spread = 2.4): number {
  if (owned <= 0) return 0;
  if (owned <= 4) return Math.min(owned, cap);
  return Math.min(cap, 4 + Math.floor(Math.log2(owned / 4) * spread));
}

// ---------------------------------------------------------------------------

interface Flying {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
}

/**
 * Dust, steam and water: the small stuff that says a machine is running rather
 * than parked. One pixel each, no sprite, no transform — cheap enough that
 * every tier can have some without the frame budget noticing.
 */
interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  dur: number;
  color: string;
  size: number;
}

const MAX_PUFFS = 40;

/** Nothing on this canvas needs more potatoes than this in the air at once. */
const MAX_FLYING = 20;

/** How long a building takes to come out of the ground, or to go back into it. */
const BUILD_MS = 520;

/**
 * How much of an arriving building is still underground, in pixels, `age`
 * milliseconds in. Rising eases out so it lands rather than stops; sinking is
 * linear, because something you can no longer afford shouldn't linger.
 */
export function buildHidden(age: number, up: boolean, height: number): number {
  const t = Math.max(0, Math.min(1, age / BUILD_MS));
  const shown = up ? 1 - (1 - t) * (1 - t) : 1 - t;
  return Math.round((1 - shown) * height);
}

// ---------------------------------------------------------------------------
// The crop cycle, and the people who work it
// ---------------------------------------------------------------------------
//
// The farm is scenery, not a readout. None of what follows is derived from your
// production rate and none of it feeds back into it — the field grows on its
// own clock and the hands walk at their own pace whether you're making twelve
// potatoes a second or twelve trillion. What it's for is having somewhere to
// look: a farm that idles is still a farm doing something.

/** How long a bed takes to come up. Long, on purpose — this is a place, not a slot machine. */
const GROW_SECONDS = 46;

/** How long a ripe bed stands before the farm gets to it without you watching. */
const RIPE_SECONDS = 14;

/** Buffer pixels a second. A farmhand crosses the field in about five. */
const HAND_SPEED = 14;
const PICK_SECONDS = 1.8;
const REST_SECONDS = 2.4;

/**
 * One farmhand, working. They pick the bed that's been ready longest, carry it
 * down to the yard, drop it on the pile and walk back for another.
 */
interface Hand {
  x: number;
  y: number;
  /** Where in the yard this one unloads. Spread out, so they don't queue. */
  home: number;
  state: "resting" | "out" | "picking" | "back";
  /** Index into the drawn beds. -1 while resting. */
  target: number;
  /** Wall time at which a timed state ends. */
  until: number;
  carrying: boolean;
}

/** One plant in a row, as drawn this frame. Ground point, not top-left. */
interface Bed {
  x: number;
  y: number;
  /** Which crop row it stands in. */
  row: number;
  /** Wilted plants are skipped: nothing there is worth walking out for. */
  dry: boolean;
}

/** A crop row's extent, so everything else on the farm can work *with* it. */
interface Row {
  y: number;
  left: number;
  right: number;
}

/** How deep the field can get planted before it stops adding rows. */
const FIELD_ROWS = 5;

/** How long a tractor's furrow stays fresh behind it. */
const TILL_MS = 4500;

/** Seed dropped from a cloud seeder, on its way down to a specific plant. */
interface Seed {
  x: number;
  y: number;
  vy: number;
  /** Index into `beds`. The drop is aimed, so it visibly does something. */
  crop: number;
}

export class FarmScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ro?: ResizeObserver;
  private raf = 0;
  private sh = 200;
  private t0 = performance.now();
  private view: FarmView = EMPTY_VIEW;
  private rngSeed = 1;
  private flying: Flying[] = [];
  private puffs: Puff[] = [];
  /** The plants as laid out this frame. Deterministic, so an index is a place. */
  private beds: Bed[] = [];
  /** This frame's crop rows. Rigs stand beside these; machines drive along them. */
  private rows: Row[] = [];
  /** Fresh furrow behind a tractor, fading. */
  private tills: { x: number; y: number; born: number }[] = [];
  private seeds: Seed[] = [];
  /** When each bed was last cleared. Indexed the same as `beds`. */
  private planted: number[] = [];
  private hands: Hand[] = [];
  private dt = 0;
  private lastFrame = performance.now();
  /**
   * The hoard the yard is currently showing, which chases the real one rather
   * than snapping to it. This is what makes spending *look* like spending:
   * buy a tractor and you watch the crates come back apart.
   */
  private shown = -1;
  private shownLayout = yardLayout(0);
  private bundles: Bundle[] = [];
  /**
   * Stages part-way through arriving or leaving, as stage index to the moment
   * it started. A prop on this list is drawn sliding out of or down into the
   * ground rather than just standing there.
   */
  private building = new Map<number, { born: number; up: boolean }>();

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
    this.view = view;
    this.rngSeed = hashSeed(view.seed);
  }

  /** Which mark of a tier to draw, given the upgrades bought on it. */
  private mark(id: solo.SoloProducerId): Art {
    const marks = PRODUCER_MARKS[id];
    const level = Math.max(0, Math.min(marks.length - 1, this.view.marks[id] ?? 0));
    return marks[level] ?? marks[0];
  }

  /**
   * Throw a potato from somewhere on the farm onto the pile, on an arc that
   * actually lands where it's aimed — the flight time is solved against
   * `drawFlying`'s gravity rather than guessed, so potatoes from the back fence
   * and potatoes from the front row both finish in the yard.
   */
  private launch(x: number, y: number, landX: number, lift = 46): void {
    if (this.flying.length > MAX_FLYING) return;
    const vy = -lift - Math.random() * 26;
    const drop = this.sh - 8 - y;
    const flight = (-vy + Math.sqrt(vy * vy + 4 * 90 * drop)) / (2 * 90);
    this.flying.push({ x, y, vx: (landX - x) / Math.max(0.35, flight), vy, born: performance.now() });
  }

  /**
   * A dig: a potato pops out of the field and is thrown onto the loose pile —
   * aimed at it, so the yard's rightmost column is visibly where digging goes.
   */
  dig(): void {
    if (this.flying.length > 24) return;
    const x = 20 + Math.random() * (SCENE_W - 60);
    const y = this.fieldTop() + 20 + Math.random() * 30;
    this.launch(x, y, 0.82 * SCENE_W + Math.random() * 14);
  }

  /** How ripe a bed is, 0..1, where 1 is ready to lift. */
  private ripeness(i: number, t: number): number {
    const planted = this.planted[i];
    if (planted === undefined) return 0;
    return Math.min(1, (t - planted) / GROW_SECONDS);
  }

  /** Clear a bed and start it again. Whatever lifted it gets one potato. */
  private lift(i: number, t: number, toYard = true): void {
    const bed = this.beds[i];
    this.planted[i] = t;
    if (bed && toYard) this.launch(bed.x + 3, bed.y - 6, 14 + Math.random() * (SCENE_W - 28), 28);
  }

  /**
   * The farmhands, going about it.
   *
   * Each one walks out to whichever bed has been ready longest, spends a moment
   * pulling it, carries the potato down to the yard, drops it on the pile and
   * walks back. Nothing here is fast and nothing here is synchronised — the
   * point is that there's always somebody halfway across the field.
   */
  private stepHands(t: number, dt: number, count: number, yardY: number): void {
    const unload = yardY + Math.round((this.sh - yardY) * 0.42);

    while (this.hands.length > count) this.hands.pop();
    while (this.hands.length < count) {
      const i = this.hands.length;
      this.hands.push({
        x: 16 + i * 27,
        y: unload,
        home: 16 + i * 27,
        state: "resting",
        target: -1,
        // Staggered, so they don't all set off on the same frame like a chorus.
        until: t + i * 1.9,
        carrying: false,
      });
    }

    for (const hand of this.hands) {
      switch (hand.state) {
        case "resting": {
          if (t < hand.until) break;
          const target = this.claimBed(t);
          if (target < 0) {
            // Nothing ready and nothing growing: try again shortly.
            hand.until = t + 1.5;
            break;
          }
          hand.target = target;
          hand.state = "out";
          break;
        }
        case "out": {
          const bed = this.beds[hand.target];
          if (!bed) {
            hand.state = "resting";
            hand.target = -1;
            hand.until = t + 0.5;
            break;
          }
          if (this.walk(hand, bed.x + 1, bed.y, dt)) {
            hand.state = "picking";
            hand.until = t + PICK_SECONDS;
          }
          break;
        }
        case "picking": {
          if (t < hand.until) break;
          // Carried by hand, so no potato is thrown — they're taking it down.
          this.lift(hand.target, t, false);
          hand.carrying = true;
          hand.state = "back";
          break;
        }
        case "back": {
          if (this.walk(hand, hand.home, unload, dt)) {
            hand.carrying = false;
            // Set down rather than thrown: a short hop onto the nearest pile.
            this.launch(hand.home + 2, unload - 6, hand.home + 10, 12);
            hand.state = "resting";
            hand.target = -1;
            hand.until = t + REST_SECONDS + Math.random() * 2;
          }
          break;
        }
      }
    }
  }

  /**
   * The bed that's been ready longest and isn't already somebody's job. Wilted
   * beds are passed over — there's nothing under them worth the walk, which is
   * the soil bar showing up as behaviour rather than a number.
   */
  private claimBed(t: number): number {
    let best = -1;
    let bestRipe = 0.55;
    for (let i = 0; i < this.beds.length; i++) {
      if (this.beds[i]!.dry) continue;
      if (this.hands.some((h) => h.target === i)) continue;
      const ripe = this.ripeness(i, t);
      if (ripe > bestRipe) {
        bestRipe = ripe;
        best = i;
      }
    }
    return best;
  }

  /** Step a hand toward a point. True once it's there. */
  private walk(hand: Hand, tx: number, ty: number, dt: number): boolean {
    const dx = tx - hand.x;
    const dy = ty - hand.y;
    const d = Math.hypot(dx, dy);
    if (d < 1.5) {
      hand.x = tx;
      hand.y = ty;
      return true;
    }
    const step = Math.min(d, HAND_SPEED * dt);
    hand.x += (dx / d) * step;
    hand.y += (dy / d) * step;
    return false;
  }

  private drawHands(t: number): void {
    const ctx = this.ctx;
    const sprite = artCanvas(this.mark("hand"));
    const spud = artCanvas(POTATO_SPRITE);
    for (const hand of this.hands) {
      const moving = hand.state === "out" || hand.state === "back";
      // A 1px bob while walking, and a deeper stoop while pulling a bed.
      const bob = moving ? Math.floor(t * 4) % 2 : hand.state === "picking" ? 2 : 0;
      const x = Math.round(hand.x);
      const y = Math.round(hand.y) - sprite.h + bob;
      ctx.drawImage(sprite.canvas, x, y);
      if (hand.carrying) ctx.drawImage(spud.canvas, x + 1, y - 4);
    }
  }

  private puff(x: number, y: number, kind: "dust" | "steam" | "water", vx?: number): void {
    if (this.puffs.length >= MAX_PUFFS) return;
    const spec = {
      dust: { color: "#b79a72", vx: -6, vy: -5, dur: 620, size: 2 },
      steam: { color: "#e8ecf0", vx: 3, vy: -13, dur: 900, size: 2 },
      water: { color: "#8ec9e6", vx: 0, vy: 4, dur: 460, size: 1 },
    }[kind];
    this.puffs.push({
      x,
      y,
      vx: (vx ?? spec.vx) + (Math.random() - 0.5) * 8,
      vy: spec.vy - Math.random() * 4,
      born: performance.now(),
      dur: spec.dur,
      color: spec.color,
      size: spec.size,
    });
  }

  /** Per-frame odds for something that should happen `perSec` times a second. */
  private chance(perSec: number): boolean {
    return Math.random() < this.dt * perSec;
  }

  start(): void {
    const loop = () => {
      this.draw(performance.now());
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
  }

  // --- Geometry ------------------------------------------------------------

  /**
   * The three bands, as fractions rather than fixed pixel depths. Fixed depths
   * looked right at one aspect ratio and left two thirds of a tall phone as
   * empty sky — the farm should get the screen, not the weather.
   */
  private yardTop(): number {
    return this.sh - Math.max(34, Math.round(this.sh * YARD_SHARE));
  }

  private fieldTop(): number {
    return Math.max(MIN_SKY, this.yardTop() - Math.max(40, Math.round(this.sh * FIELD_SHARE)));
  }

  // --- Drawing -------------------------------------------------------------

  private draw(now: number): void {
    const ctx = this.ctx;
    const t = (now - this.t0) / 1000;
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.dt = dt;
    this.lastFrame = now;
    const phase = phaseNow();
    const horizon = this.fieldTop();
    const yardY = this.yardTop();

    this.stepHoard(dt, now);

    this.drawSky(phase, t, horizon);
    this.drawHills(phase, horizon);
    this.drawGround(horizon, yardY);
    this.drawBack(t, horizon, phase);
    this.drawField(t, now, horizon, yardY);
    this.drawPuffs(now, dt);
    this.drawFence(yardY);
    this.drawHoard(now);
    // The hands walk between the two bands, so they're drawn after both — and
    // after the field has said where this frame's beds are.
    this.stepHands(t, dt, shownCount(this.view.working.hand ?? 0, PLACEMENT.hand.cap), yardY);
    this.drawHands(t);
    this.drawFlying(now);
    this.drawBundles(now);

    // Night everywhere except the yard's lamp-lit patch, so the hoard stays
    // readable at 2am — the one thing you came back to look at.
    if (phase === "night") {
      ctx.fillStyle = "rgba(20, 22, 48, 0.34)";
      ctx.fillRect(0, 0, SCENE_W, yardY);
    }
  }

  private drawSky(phase: Phase, t: number, horizon: number): void {
    const ctx = this.ctx;
    const sky = SKY[phase];
    const grad = ctx.createLinearGradient(0, 0, 0, horizon);
    grad.addColorStop(0, sky.top);
    grad.addColorStop(1, sky.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCENE_W, horizon);

    if (phase === "night") {
      const rng = mulberry32(this.rngSeed ^ 0x51ed);
      ctx.fillStyle = "#f4f1d8";
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(rng() * SCENE_W);
        const y = Math.floor(rng() * Math.max(1, horizon - 8));
        if (rng() > 0.35 + 0.3 * Math.sin(t * 0.7 + i)) ctx.fillRect(x, y, 1, 1);
      }
      // Moon
      ctx.fillStyle = "#f7f0d0";
      ctx.beginPath();
      ctx.arc(SCENE_W - 30, 20, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = sky.top;
      ctx.beginPath();
      ctx.arc(SCENE_W - 34, 17, 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = phase === "dusk" ? "#ffca77" : "#fdf0a6";
      ctx.beginPath();
      ctx.arc(SCENE_W - 28, 22, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Drifting clouds. Day only — at night they'd just be grey smears.
    if (phase !== "night") {
      const cloud = artCanvas(CLOUD);
      for (let i = 0; i < 3; i++) {
        const span = SCENE_W + cloud.w;
        const x = Math.floor((((t * (3 + i) + i * 70) % span) + span) % span) - cloud.w;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(cloud.canvas, x, 8 + i * 13);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawHills(phase: Phase, horizon: number): void {
    const ctx = this.ctx;
    const sky = SKY[phase];
    // Two rolling ridges, drawn as 1px columns so they sit on the buffer's grid
    // instead of being antialiased into a smear by a path fill.
    for (const [amp, base, color] of [
      [5, 16, sky.hillFar],
      [7, 9, sky.hill],
    ] as const) {
      ctx.fillStyle = color;
      for (let x = 0; x < SCENE_W; x++) {
        const h = Math.round(base + amp * Math.cos((2 * Math.PI * x) / 61 + amp));
        ctx.fillRect(x, horizon - h, 1, h);
      }
    }
  }

  private drawGround(horizon: number, yardY: number): void {
    const ctx = this.ctx;
    const soil = this.view.soil;
    // Tired soil isn't a number on this screen — the field goes the colour of a
    // field that needs help.
    const dry = 1 - Math.max(0, Math.min(1, soil));
    const mix = (a: string, b: string, k: number) => {
      const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
      const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
      return `rgb(${pa.map((c, i) => Math.round(c + ((pb[i] ?? c) - c) * k)).join(",")})`;
    };
    ctx.fillStyle = mix(GRASS, "#a89b46", dry);
    ctx.fillRect(0, horizon, SCENE_W, yardY - horizon);

    // Furrows: shallow bands that give the field a direction to be ploughed in.
    ctx.fillStyle = mix(GRASS_DARK, "#8d8a3a", dry);
    for (let y = horizon + 6; y < yardY; y += 9) ctx.fillRect(0, y, SCENE_W, 2);

    // The yard: beaten dirt, because this is where everything gets dumped.
    ctx.fillStyle = DIRT;
    ctx.fillRect(0, yardY, SCENE_W, this.sh - yardY);
    ctx.fillStyle = DIRT_DARK;
    const rng = mulberry32(this.rngSeed ^ 0x9e37);
    for (let i = 0; i < 30; i++) {
      ctx.fillRect(
        Math.floor(rng() * SCENE_W),
        yardY + 2 + Math.floor(rng() * Math.max(1, this.sh - yardY - 4)),
        2,
        1,
      );
    }
  }

  /** Buildings and the skyline: the far edge of the property. */
  private drawBack(t: number, horizon: number, phase: Phase): void {
    const ctx = this.ctx;
    const baseline = horizon + 8;

    const barn = artCanvas(BARN);
    ctx.drawImage(barn.canvas, 4, baseline - barn.h);
    if (phase === "night") {
      // The barn keeps a light on. Cheap, and it makes the place feel occupied.
      ctx.fillStyle = "rgba(255, 214, 130, 0.85)";
      ctx.fillRect(4 + 12, baseline - barn.h + 10, 4, 3);
    }

    const tree = artCanvas(TREE);
    ctx.drawImage(tree.canvas, SCENE_W - tree.w - 3, baseline - tree.h + 2);

    // Everything else queues up along the back edge in tier order, so climbing
    // the ladder reads as the skyline filling in.
    const queue: { id: solo.SoloProducerId; art: Art; dead: boolean }[] = [];
    for (const id of ORDER) {
      const place = PLACEMENT[id];
      if (place.band !== "back") continue;
      const n = shownCount(this.view.working[id] ?? 0, place.cap);
      const brokenN = shownCount(this.view.broken[id] ?? 0, place.cap);
      const art = this.mark(id);
      for (let i = 0; i < n; i++) queue.push({ id, art, dead: false });
      for (let i = 0; i < brokenN; i++) queue.push({ id, art, dead: true });
    }

    // When the skyline is full, the *lowest* tiers give up their spot. A farm
    // with a fusion reactor shouldn't be showing you its third tuber lab
    // instead — the newest thing you bought is the thing you want to look at.
    const left = 4 + barn.w + 4;
    const right = SCENE_W - tree.w - 6;
    let width = queue.reduce((w, item) => w + artCanvas(item.art).w + 2, 0);
    while (queue.length > 1 && left + width > right) {
      width -= artCanvas(queue.shift()!.art).w + 2;
    }

    let x = left;
    let idx = 0;
    for (const item of queue) {
      const sprite = item.dead ? artTinted(item.art, "#6b6b74", 0.6) : artCanvas(item.art);
      if (x + sprite.w > right) break;
      ctx.drawImage(sprite.canvas, x, baseline - sprite.h);
      if (!item.dead) {
        // The stack runs, which is how you tell it from a dead one at a glance
        // without reading the colour.
        if (this.chance(0.45)) this.puff(x + 2, baseline - sprite.h - 1, "steam");
        // Windows and panel lights, blinking on their own phase. A row of
        // identical silhouettes standing perfectly still reads as a printed
        // backdrop; a couple of moving pixels each reads as a night shift.
        const beat = Math.sin(t * 1.4 + idx * 2.3);
        if (beat > 0.1) {
          ctx.fillStyle = beat > 0.75 ? "#fff0b8" : "#ffd782";
          ctx.fillRect(x + 2, baseline - sprite.h + 2, 2, 1);
        }
        if (Math.sin(t * 0.9 + idx * 1.1) > 0.4) {
          ctx.fillStyle = "#8ee0c0";
          ctx.fillRect(x + sprite.w - 3, baseline - Math.floor(sprite.h / 2), 1, 1);
        }
        // And every so often — rarely — something it made is walked down to the
        // yard. A trickle, not a conveyor: the back fence should read as a
        // place that's busy, not as a number going up.
        if (this.chance(0.05)) {
          this.launch(x + Math.floor(sprite.w / 2), baseline - 4, 14 + Math.random() * (SCENE_W - 28), 30);
        }
      }
      idx++;
      x += sprite.w + 2;
    }
  }

  private drawField(t: number, now: number, horizon: number, yardY: number): void {
    const ctx = this.ctx;
    const rng = mulberry32(this.rngSeed);
    const top = horizon + 12;
    const depth = Math.max(20, yardY - top - 4);

    /** Ground-level y for a lane given as a fraction of the field's depth. */
    const lane = (f: number) => top + Math.round(depth * f);

    // A farm with nothing on it yet is still somewhere, so scatter a little
    // ambient green before anything the player bought goes down.
    const tuft = artCanvas(TUFT);
    const flowers = artCanvas(FLOWERS);
    for (let i = 0; i < 14; i++) {
      const sprite = rng() < 0.3 ? flowers : tuft;
      const x = Math.floor(rng() * (SCENE_W - sprite.w));
      const y = lane(rng()) - sprite.h;
      ctx.drawImage(sprite.canvas, x, y);
    }

    // The field.
    //
    // Plants stand shoulder to shoulder in continuous rows on one worked strip
    // of soil, and the rows fill in as you buy land. That's the difference
    // between a field of potatoes and a scattering of window boxes, which is
    // what evenly-spaced individual beds looked like however many there were.
    const plants = shownCount(this.view.working.plot ?? 0, PLACEMENT.plot.cap, PLACEMENT.plot.spread);
    const stages = cropStages(this.mark("plot"));
    const plant = artCanvas(this.mark("plot"));
    const wiltShare = 1 - this.view.soil;
    const step = plant.w + 1;
    const marginX = 10;
    const usable = SCENE_W - marginX * 2;
    // Capped well short of the full width, so the field grows as a block —
    // deeper as well as wider. Letting one row run the whole screen before
    // starting a second made a big farm look like a hedge.
    const maxPerRow = Math.max(3, Math.min(Math.floor(usable / step), 13));
    const rowCount = Math.max(0, Math.min(FIELD_ROWS, Math.ceil(plants / maxPerRow)));
    // Evened out across however many rows that comes to, so the last row isn't
    // a stub hanging off the bottom of the block.
    const perRow = rowCount > 0 ? Math.min(maxPerRow, Math.ceil(plants / rowCount)) : 0;

    // Rows sit in the back three-quarters, leaving headland at the front for
    // the machines to turn on and the hands to walk down.
    const rowGround = (r: number) => lane(0.1 + (r * 0.62) / (FIELD_ROWS - 1));

    this.beds.length = 0;
    this.rows.length = 0;
    this.drawTills(now);

    for (let r = 0; r < rowCount; r++) {
      const count = Math.min(perRow, plants - r * perRow);
      if (count <= 0) break;
      const width = count * step - 1;
      const left = marginX + Math.round((usable - width) / 2);
      const ground = rowGround(r);
      this.rows.push({ y: ground, left, right: left + width });

      // One continuous worked strip per row, drawn before the plants standing
      // on it. Lifting a crop leaves soil behind, not lawn.
      ctx.fillStyle = this.view.soil < 0.7 ? "#8a7a3c" : DIRT;
      ctx.fillRect(left - 2, ground - 2, width + 4, 3);
      ctx.fillStyle = DIRT_DARK;
      ctx.fillRect(left - 2, ground + 1, width + 4, 1);

      for (let c = 0; c < count; c++) {
        const i = r * perRow + c;
        const x = left + c * step;
        // Deterministic per plant rather than drawn from the layout's rng
        // stream, so wilt doesn't reshuffle when the field changes size.
        const dry = fract(Math.sin(i * 12.9898) * 43758.5453) < wiltShare;
        this.beds.push({ x, y: ground, row: r, dry });

        // Neighbours ripen together: the stagger is a smooth function of where
        // the plant stands, so the field comes on in patches like a real one
        // instead of flickering at random.
        this.planted[i] ??= t - GROW_SECONDS * (0.5 + 0.5 * Math.sin(c * 0.7 + r * 2.1));

        const age = t - this.planted[i]!;
        const stage =
          age >= GROW_SECONDS ? 3 : age >= GROW_SECONDS * 0.6 ? 2 : age >= GROW_SECONDS * 0.25 ? 1 : 0;
        // Wilt keeps the mark's silhouette and loses its colour, so an upgraded
        // bed still reads as an upgraded bed while it's struggling.
        const art = stages[stage]!;
        const sprite = artCanvas(dry ? withered(art) : art);
        // A 1px sway on a slow sine, offset along the row — the whole field
        // leans together in a wave, which is cheap and reads as wind.
        const sway = Math.sin(t * 1.1 + c * 0.4 + r) > 0.6 ? 1 : 0;
        ctx.drawImage(sprite.canvas, x + sway, ground - sprite.h);

        if (!dry && age > GROW_SECONDS + RIPE_SECONDS) this.lift(i, t);
      }
    }

    // Irrigation stands at the ends of the rows it waters, alternating sides,
    // and throws across them. A rig in the middle of nowhere was just a pole.
    const sprinklers = shownCount(this.view.working.irrigation ?? 0, PLACEMENT.irrigation.cap);
    const sprinkler = artCanvas(this.mark("irrigation"));
    for (let i = 0; i < sprinklers; i++) {
      const row = this.rows[i % Math.max(1, this.rows.length)];
      const side = i % 2 === 0 ? 1 : -1;
      const x = row
        ? side > 0
          ? Math.min(SCENE_W - sprinkler.w - 2, row.right + 3)
          : Math.max(2, row.left - sprinkler.w - 3)
        : 14 + i * 42;
      const ground = row ? row.y : lane(0.2);
      ctx.drawImage(sprinkler.canvas, x, ground - sprinkler.h);
      // Droplets sweep out over the crop on a slow sine, so the arc reads as
      // one head turning rather than a static spray.
      if (this.chance(5)) {
        const reach = 10 + (0.5 + 0.5 * Math.sin(t * 0.8 + i)) * 22;
        this.puff(x + sprinkler.w / 2, ground - sprinkler.h + 2, "water", -side * reach);
      }
    }

    // Machines work the rows: they drive the headland just in front of a row,
    // reach back over it, and something happens to the crop as they pass.
    for (const [id, fallback] of [
      ["tractor", 0.5],
      ["harvester", 0.78],
    ] as const) {
      const place = PLACEMENT[id];
      const n = shownCount(this.view.working[id] ?? 0, place.cap);
      const sprite = artCanvas(this.mark(id));
      const span = SCENE_W + sprite.w;
      for (let i = 0; i < n; i++) {
        // The combine takes the rows from the front, the tractor from the back,
        // so on a farm with two rows they aren't nose to tail on the same one.
        // With nothing planted they fall back to their own lanes on open grass.
        const pick =
          id === "harvester" ? this.rows.length - 1 - (i % Math.max(1, this.rows.length)) : i % Math.max(1, this.rows.length);
        const row = this.rows.length > (id === "harvester" && this.rows.length < 2 ? 1 : 0) ? this.rows[pick] : undefined;
        const ground = row ? row.y + 5 : lane(fallback);
        const x = Math.floor((((t * place.speed! + (i * span) / n) % span) + span) % span) - sprite.w;
        ctx.drawImage(sprite.canvas, x, ground - sprite.h);
        if (this.chance(2.5)) this.puff(x + 1, ground - 2, "dust");

        if (id === "tractor") {
          // A tractor ploughs. The furrow it leaves is the whole reason to
          // watch one cross a field.
          if (this.tills.length < 90 && this.chance(14)) {
            this.tills.push({ x: x + 1, y: ground - 1, born: now });
          }
        }

        // Both of them lift what's ready under the header as they pass. The
        // combine throws it out of the chute; the tractor just turns it up.
        const reach = id === "harvester" ? 6 : 2;
        for (let b = 0; b < this.beds.length; b++) {
          const bed = this.beds[b]!;
          if (bed.dry || Math.abs(bed.y - (ground - 5)) > 3) continue;
          if (bed.x < x - reach || bed.x > x + sprite.w + reach) continue;
          if (this.ripeness(b, t) < 1) continue;
          this.planted[b] = t;
          this.launch(x + 2, ground - sprite.h - 2, 14 + Math.random() * (SCENE_W - 28), 34);
        }
      }
    }

    // Everything broken is parked in one row along the fence, greyed out. One
    // strip of dead machinery is a thing you notice from across the room; the
    // same units scattered among the working ones is not.
    let deadX = 6;
    for (const id of ORDER) {
      const place = PLACEMENT[id];
      if (place.band === "sky" || place.band === "back") continue;
      const brokenN = shownCount(this.view.broken[id] ?? 0, place.cap);
      for (let i = 0; i < brokenN; i++) {
        const dead = artTinted(this.mark(id), "#6b6b74", 0.62);
        if (deadX + dead.w > SCENE_W - 6) break;
        ctx.drawImage(dead.canvas, deadX, lane(0.99) - dead.h);
        deadX += dead.w + 3;
      }
    }

    // The sky tiers, above everything on the ground — and each of them doing
    // its own job to the field below rather than sliding past it.
    for (const id of ["seeder", "orbital", "singularity"] as const) {
      const place = PLACEMENT[id];
      const n = shownCount(this.view.working[id] ?? 0, place.cap);
      const sprite = artCanvas(this.mark(id));
      for (let i = 0; i < n; i++) {
        if (place.speed) {
          const span = SCENE_W + sprite.w;
          const x = Math.floor((((t * place.speed + i * 80) % span) + span) % span) - sprite.w;
          const y = 6 + i * 14;
          ctx.drawImage(sprite.canvas, x, y);

          if (id === "seeder") {
            // It seeds. Each drop is aimed at a plant and brings it on — the
            // tier that says "the weather works for you now" ought to be
            // visibly doing something to the weather's job.
            if (this.seeds.length < 20 && this.chance(1.1)) this.dropSeed(x + sprite.w / 2, y + sprite.h);
          } else {
            // The greenhouse runs a grow-light down onto the rows in sweeps.
            const cycle = (t * 0.14 + i * 0.37) % 1;
            if (cycle < 0.22) this.drawBeam(x + sprite.w / 2, y + sprite.h, t, cycle / 0.22);
          }
        } else {
          // The singularity doesn't travel. It hangs there and breathes, and
          // every few seconds something it made simply arrives in the yard.
          const y = 10 + i * 20 + (Math.sin(t * 0.9 + i) > 0 ? 1 : 0);
          const x = 20 + i * 44;
          this.drawPulse(x + sprite.w / 2, y + sprite.h / 2, t + i);
          ctx.drawImage(sprite.canvas, x, y);
          if (this.chance(0.22)) {
            this.launch(x + sprite.w / 2, y + sprite.h, 14 + Math.random() * (SCENE_W - 28), 20);
          }
        }
      }
    }

    this.stepSeeds(t);
  }

  /** Furrow behind a tractor: fresh dark soil that grasses back over. */
  private drawTills(now: number): void {
    const ctx = this.ctx;
    this.tills = this.tills.filter((till) => {
      const age = now - till.born;
      if (age > TILL_MS) return false;
      ctx.globalAlpha = 0.55 * (1 - age / TILL_MS);
      ctx.fillStyle = DIRT_DARK;
      ctx.fillRect(Math.round(till.x), Math.round(till.y), 3, 2);
      ctx.globalAlpha = 1;
      return true;
    });
  }

  /** Aim a seed at a plant that could use one. */
  private dropSeed(x: number, y: number): void {
    if (this.beds.length === 0) return;
    // The least-grown plant in range, so a drop visibly changes something.
    let pick = Math.floor(Math.random() * this.beds.length);
    for (let i = 0; i < 4; i++) {
      const other = Math.floor(Math.random() * this.beds.length);
      if ((this.planted[other] ?? 0) > (this.planted[pick] ?? 0)) pick = other;
    }
    this.seeds.push({ x, y, vy: 26 + Math.random() * 10, crop: pick });
  }

  /** Seeds falling, and what they do when they land. */
  private stepSeeds(t: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#e6d78a";
    this.seeds = this.seeds.filter((seed) => {
      seed.y += seed.vy * this.dt;
      const bed = this.beds[seed.crop];
      if (!bed || seed.y >= bed.y) {
        if (bed) {
          // Brought on by a quarter of its cycle, and a puff where it landed.
          this.planted[seed.crop] = Math.min(t, (this.planted[seed.crop] ?? t) - GROW_SECONDS * 0.25);
          this.puff(bed.x + 3, bed.y - 2, "water");
        }
        return false;
      }
      // Drift toward the plant it's aimed at, so the drop reads as deliberate.
      seed.x += (bed.x + 3 - seed.x) * Math.min(1, this.dt * 1.6);
      ctx.fillRect(Math.round(seed.x), Math.round(seed.y), 1, 2);
      return true;
    });
  }

  /** A grow-light sweeping down from an orbital greenhouse onto the rows. */
  private drawBeam(x: number, y: number, t: number, progress: number): void {
    const ctx = this.ctx;
    const row = this.rows[this.rows.length - 1];
    const floor = row ? row.y : this.yardTop() - 6;
    if (floor <= y) return;
    // Fades in and out over the sweep rather than snapping on.
    ctx.globalAlpha = 0.16 * Math.sin(progress * Math.PI);
    ctx.fillStyle = "#d8f5b0";
    const half = 3;
    ctx.fillRect(Math.round(x) - half, Math.round(y), half * 2, Math.round(floor - y));
    ctx.globalAlpha = 1;
    // Anything under it comes on a little, which is the point of the thing.
    if (this.chance(3)) {
      for (let b = 0; b < this.beds.length; b++) {
        const bed = this.beds[b]!;
        if (Math.abs(bed.x + 3 - x) > half + 2) continue;
        this.planted[b] = Math.min(t, (this.planted[b] ?? t) - GROW_SECONDS * 0.06);
      }
    }
  }

  /** The singularity, breathing. Four points on the grid, no rotation. */
  private drawPulse(cx: number, cy: number, t: number): void {
    const ctx = this.ctx;
    const phase = (t * 0.55) % 1;
    const r = Math.round(4 + phase * 9);
    ctx.globalAlpha = 0.5 * (1 - phase);
    ctx.fillStyle = "#c9a4f0";
    for (const [dx, dy] of [
      [0, -r],
      [0, r],
      [-r, 0],
      [r, 0],
    ] as const) {
      ctx.fillRect(Math.round(cx + dx), Math.round(cy + dy), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** Dust, steam and water, drawn between the field and the fence. */
  private drawPuffs(now: number, dt: number): void {
    const ctx = this.ctx;
    this.puffs = this.puffs.filter((p) => {
      const age = now - p.born;
      if (age > p.dur) return false;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = 0.7 * (1 - age / p.dur);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      ctx.globalAlpha = 1;
      return true;
    });
  }

  private drawFence(yardY: number): void {
    const ctx = this.ctx;
    const fence = artCanvas(FENCE);
    for (let x = 0; x < SCENE_W; x += fence.w) {
      ctx.drawImage(fence.canvas, x, yardY - fence.h + 1);
    }
  }

  // --- The hoard -----------------------------------------------------------

  /**
   * Move the shown hoard toward the real one and fire off whatever that
   * transition should look like. Exponential chase, so a small dig is a nudge
   * and a big purchase is a visible drain rather than a jump cut.
   */
  private stepHoard(dt: number, now: number): void {
    const target = Math.max(0, this.view.hoard);
    if (this.shown < 0) {
      // First frame after mount: adopt the hoard rather than animating up from
      // zero, or every reload replays your whole farm's history at you.
      this.shown = target;
      this.shownLayout = yardLayout(target);
      return;
    }

    const k = 1 - Math.exp(-dt * 3.2);
    const gap = target - this.shown;
    this.shown += gap * k;
    // Snap once it's close, so the heap settles instead of creeping forever.
    if (Math.abs(gap) < Math.max(0.5, target * 1e-4)) this.shown = target;

    const next = yardLayout(this.shown);
    if (!sameLayout(next, this.shownLayout)) {
      if (next.stage !== this.shownLayout.stage) this.turnStage(this.shownLayout.stage, next.stage, now);
      this.shownLayout = next;
    }

    const cutoff = now - 900;
    if (this.bundles.length > 0) this.bundles = this.bundles.filter((b) => b.born + b.dur > cutoff);
    for (const [stage, run] of this.building) {
      if (run.born + BUILD_MS < now) this.building.delete(stage);
    }
  }

  /**
   * How far back in the yard something stands. 0 is the heap at the front edge;
   * each station back steps by the same amount, so the yard reads as depth
   * rather than as a stack of shelves. On a short screen the steps tighten
   * instead of the back row walking off the top.
   */
  private station(i: number): number {
    const step = Math.max(5, Math.min(9, Math.floor((this.sh - this.yardTop() - 12) / 4)));
    return this.sh - 4 - i * step;
  }

  /** Where a prop's feet are, once it's finished arriving. */
  private propFoot(prop: Prop): number {
    return this.station(prop.row);
  }

  /**
   * Crossing a threshold. Going up, the heap gets carried into whatever just
   * arrived and the new thing rises out of the ground behind a cloud of its own
   * dust; going down, it sinks back into the ground it came out of. Either way
   * the stage that moved is the loudest thing on the canvas for half a second,
   * because it's the only part of the yard that ever changes shape.
   */
  private turnStage(from: number, to: number, now: number): void {
    const up = to > from;
    // A purchase can drop several stages at once. Each one gets its own moment,
    // stacked up in sequence, so a big spend reads as a demolition rather than
    // as everything blinking out on the same frame.
    const moved: number[] = [];
    for (let s = Math.min(from, to) + 1; s <= Math.max(from, to); s++) moved.push(s);
    if (!up) moved.reverse();

    for (const [i, stage] of moved.entries()) {
      const prop = YARD[stage]?.add;
      if (!prop) continue;
      const born = now + i * 120;
      this.building.set(stage, { born, up });
      const sprite = artCanvas(prop.art);
      const foot = this.propFoot(prop);
      // Dust at the feet, thrown outward — the same puffs the machines use.
      for (let d = 0; d < 4; d++) {
        this.puff(prop.x + 2 + (d * sprite.w) / 3, foot - 2, "dust", d < 2 ? -14 : 14);
      }
      if (!up || this.bundles.length > 24) continue;
      // The heap, going into it. Three potatoes is enough to read as "that pile
      // went in there" without burying the thing that just arrived.
      const heap = heapSlots();
      const base = this.station(0);
      for (let n = 0; n < 3; n++) {
        const slot = heap[n * 3]!;
        this.bundles.push({
          art: POTATO_SPRITE,
          x0: slot.x,
          y0: base + slot.y,
          x1: prop.x + Math.floor(sprite.w / 2) - 3 + n * 2,
          y1: foot - sprite.h + 2,
          born: born + n * 80,
          dur: 420,
          poof: false,
        });
      }
    }
  }

  /**
   * The yard: everything built so far, back stations first, and the working
   * heap in front of the lot.
   */
  private drawHoard(now: number): void {
    const ctx = this.ctx;
    const layout = this.shownLayout;

    if (this.shown < 1 && this.building.size === 0) {
      // Empty yard, but not an empty frame — a couple of strays in the dirt.
      const spud = artCanvas(POTATO_SPRITE);
      const baseline = this.station(0);
      ctx.drawImage(spud.canvas, SCENE_W - 22, baseline - spud.h);
      ctx.drawImage(spud.canvas, SCENE_W - 14, baseline - spud.h + 1);
      return;
    }

    // Back to front, so a silo is behind the crates rather than sitting on
    // them — nothing here is drawn scaled, so depth is only ever draw order.
    for (let row = 3; row >= 0; row--) {
      for (let stage = 0; stage < YARD.length; stage++) {
        const prop = YARD[stage]?.add;
        if (!prop || prop.row !== row) continue;
        const run = this.building.get(stage);
        if (stage > layout.stage && !run) continue;
        this.drawProp(prop, run, now);
      }
    }

    const spud = artCanvas(POTATO_SPRITE);
    const baseline = this.station(0);
    const heap = heapSlots();
    for (let j = 0; j < layout.heap; j++) {
      ctx.drawImage(spud.canvas, heap[j]!.x, baseline + heap[j]!.y);
    }
  }

  /**
   * One thing in the yard, standing or in the middle of arriving. Arrivals rise
   * out of the ground: the sprite is clipped to the footprint it will end up
   * occupying and slid up into it, which costs a clip rect but keeps every
   * pixel of the art on the grid.
   */
  private drawProp(prop: Prop, run: { born: number; up: boolean } | undefined, now: number): void {
    const ctx = this.ctx;
    const sprite = artCanvas(prop.art);
    const top = this.propFoot(prop) - sprite.h;
    if (!run) {
      ctx.drawImage(sprite.canvas, prop.x, top);
      return;
    }

    const hidden = buildHidden(now - run.born, run.up, sprite.h);
    if (hidden >= sprite.h) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(prop.x, top, sprite.w, sprite.h);
    ctx.clip();
    ctx.drawImage(sprite.canvas, prop.x, top + hidden);
    ctx.restore();
  }

  /** Potatoes being carried between columns, drawn over the columns themselves. */
  private drawBundles(now: number): void {
    const ctx = this.ctx;
    for (const b of this.bundles) {
      const p = (now - b.born) / b.dur;
      if (p < 0 || p > 1) continue;
      const sprite = artCanvas(b.art);
      if (b.poof) {
        ctx.globalAlpha = 1 - p;
        ctx.drawImage(sprite.canvas, b.x0, Math.round(b.y0 + (b.y1 - b.y0) * p));
        ctx.globalAlpha = 1;
        continue;
      }
      // Ease out, with a hop over the gap — a flat lerp reads as a slide.
      const e = 1 - (1 - p) * (1 - p);
      const x = Math.round(b.x0 + (b.x1 - b.x0) * e);
      const y = Math.round(b.y0 + (b.y1 - b.y0) * e - Math.sin(p * Math.PI) * 11);
      ctx.drawImage(sprite.canvas, x, y);
    }
  }

  /** Dug potatoes, arcing out of the field and into the yard. */
  private drawFlying(now: number): void {
    const ctx = this.ctx;
    const sprite = artCanvas(POTATO_SPRITE);
    const floor = this.sh - 8;
    this.flying = this.flying.filter((f) => {
      const age = (now - f.born) / 1000;
      const x = f.x + f.vx * age;
      const y = f.y + f.vy * age + 90 * age * age;
      if (y > floor || x > SCENE_W) return false;
      ctx.drawImage(sprite.canvas, Math.round(x), Math.round(y));
      return true;
    });
  }
}
