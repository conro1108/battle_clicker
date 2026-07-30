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

/** The shared outline ink, for the bits of the scene drawn as rects not art. */
const INK = "#402e3a";

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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
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
 * The working heap: a mound, front-left, where every potato the farm sends
 * down lands. Eight wide at the base, each course half a potato in from the one
 * below, and the potatoes overlapping by two pixels — a heap of anything
 * touches itself, and spaced out on a grid it reads as a row of items instead.
 *
 * Slots fill center-out *and* upward at the same time, weighted so a course
 * starts before the one below it is finished. Filling a whole course first laid
 * a flat line of potatoes along the yard and only stacked once it ran out of
 * room, which is the one shape a dumped pile never has: three potatoes were a
 * row, and a dozen were a fence.
 */
const HEAP_BASE = 8;
const HEAP_X = 6;
const HEAP_STEP = 5;
export const HEAP_CAP = (HEAP_BASE * (HEAP_BASE + 1)) / 2;

/** How eagerly the pile climbs. Higher stacks sooner; 0 is a flat row. */
const HEAP_CLIMB = 1.15;

let heapCache: { x: number; y: number }[] | null = null;

function heapSlots(): { x: number; y: number }[] {
  if (!heapCache) {
    const h = artCanvas(POTATO_SPRITE).h;
    const slots: { x: number; y: number; key: number }[] = [];
    for (let course = 0; course < HEAP_BASE; course++) {
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

/** How wide the mound gets at the base, for anything that has to clear it. */
const HEAP_W = HEAP_X + (HEAP_BASE - 1) * HEAP_STEP + 7;

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
 * the right of the yard is the working end (sacks, crates, sheds), the left is
 * the heap with the tall stuff standing behind it.
 *
 * That way round because the heap is where everything lands, and everything
 * lands on the left — the pipeline comes down the west side and the trough
 * empties towards it. A mound in the opposite corner from the two chutes
 * feeding it was the yard's oldest lie.
 *
 * It runs out at around a hundred trillion, which is past the last thing on the
 * price list. A yard with everything in it is a fine place for the ladder to
 * stop.
 */
export const YARD: Stage[] = [
  { at: 0, heap: 5 },
  { at: 5, heap: 13 },
  { at: 16, heap: 21 },
  { at: 45, heap: 29 },
  { at: 110, heap: HEAP_CAP },
  { at: 200, heap: HEAP_CAP, add: p(SACK, 159, 0) },
  { at: 900, heap: HEAP_CAP, add: p(SACK, 145, 0) },
  { at: 4e3, heap: HEAP_CAP, add: p(CRATE, 159, 1) },
  { at: 2e4, heap: HEAP_CAP, add: p(BARROW, 127, 0) },
  { at: 8e4, heap: HEAP_CAP, add: p(SACK, 113, 0) },
  { at: 3e5, heap: HEAP_CAP, add: p(CRATE, 141, 1) },
  { at: 1.5e6, heap: HEAP_CAP, add: p(SHED, 141, 2) },
  { at: 6e6, heap: HEAP_CAP, add: p(SILO, 73, 3) },
  { at: 3e7, heap: HEAP_CAP, add: p(CRATE, 123, 1) },
  { at: 1.2e8, heap: HEAP_CAP, add: p(SACK, 97, 0) },
  { at: 5e8, heap: HEAP_CAP, add: p(SILO, 57, 3) },
  { at: 2e9, heap: HEAP_CAP, add: p(CRATE, 105, 1) },
  { at: 1e10, heap: HEAP_CAP, add: p(ELEVATOR, 105, 3) },
  { at: 4e10, heap: HEAP_CAP, add: p(CRATE, 87, 1) },
  { at: 2e11, heap: HEAP_CAP, add: p(SILO, 41, 3) },
  { at: 8e11, heap: HEAP_CAP, add: p(CRATE, 69, 1) },
  { at: 3e12, heap: HEAP_CAP, add: p(SHED, 109, 2) },
  { at: 1.5e13, heap: HEAP_CAP, add: p(SILO, 25, 3) },
  { at: 6e13, heap: HEAP_CAP, add: p(ELEVATOR, 129, 3) },
  { at: 2.5e14, heap: HEAP_CAP, add: p(CRATE, 51, 1) },
  { at: 1e15, heap: HEAP_CAP, add: p(SHED, 77, 2) },
  { at: 4e15, heap: HEAP_CAP, add: p(SACK, 81, 0) },
  { at: 1.5e16, heap: HEAP_CAP, add: p(SILO, 10, 3) },
  { at: 6e16, heap: HEAP_CAP, add: p(ELEVATOR, 153, 3) },
  { at: 2.5e17, heap: HEAP_CAP, add: p(BARROW, 63, 0) },
];

interface YardLayout {
  /** Index into YARD. Everything up to and including it is standing. */
  stage: number;
  /** Potatoes in the working heap, 0..the stage's cap. */
  heap: number;
}

/**
 * What's left on the mound after a stage arrives and takes the pile with it,
 * as a fraction of the cap. Not zero: a farm making thousands a second should
 * never be standing over one potato and a shed, which is what emptying the
 * mound at every threshold used to look like.
 */
const HEAP_KEEP = 0.4;

/**
 * How the heap fills between one stage and the next. Well under 1, so most of
 * the pile is back within the first slice of the stage and the long tail is
 * spent topping it off — the mound should read as full most of the time and
 * only be conspicuously low right after something carted it away.
 */
const HEAP_EASE = 0.5;

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
  frac = Math.max(0, Math.min(1, frac));

  // Where the mound starts this stage. A stage that put something in the yard
  // was built out of the pile, so the pile starts low; a stage that only made
  // room for a bigger mound picks up exactly where the last one left off, so
  // the early game is one unbroken climb rather than four resets to nothing.
  const from = stage === 0 ? 0 : here.add ? Math.round(here.heap * HEAP_KEEP) : YARD[stage - 1]!.heap;
  const grow = stage === 0 ? frac : Math.pow(frac, HEAP_EASE);
  const heap = from + Math.floor((here.heap - from) * grow);
  return { stage, heap: Math.max(0, Math.min(here.heap, heap)) };
}

function sameLayout(a: YardLayout, b: YardLayout): boolean {
  return a.stage === b.stage && a.heap === b.heap;
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

/**
 * Somebody moving the hoard about by hand.
 *
 * A crate doesn't appear in the yard because a number went up, it appears
 * because the pile got bagged and carried into it. So every stage change now
 * has a person in it: out from the mound with a sack on the shoulder, tip it
 * in, walk back for the next one — and when you spend the yard back down, the
 * same walk in reverse, off out of the gate with what you paid.
 */
interface Porter {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  born: number;
  /** How long the loaded leg takes. The empty leg back takes the same. */
  walk: number;
  /** Comes home empty afterwards. False for a load that's leaving for good. */
  home: boolean;
}

/** Yard pace, buffer pixels a second. Slower than the field: it's heavy. */
const PORTER_SPEED = 24;
/** How long they stand at the far end tipping the sack in. */
const PORTER_TIP = 300;

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
   * How fast the drawn count climbs with the owned count. A long run buys a
   * hundred and forty farmhands and only fifty greenhouses, so the tiers you
   * stack deepest need the shallowest curve to keep looking different at
   * twenty, fifty and a hundred.
   */
  spread?: number;
}

const PLACEMENT: Record<solo.SoloProducerId, Placement> = {
  // The crop doesn't use the log curve — the field draws a bed per plot until
  // the land is full — so its cap is only the ceiling on broken ones.
  plot: { band: "field", cap: 108 },
  hand: { band: "walk", cap: 16, spread: 3 },
  irrigation: { band: "field", cap: 12, spread: 2.6 },
  // Slow. A tractor that crosses the screen in fifteen seconds is a tractor
  // working a field; one that does it in five is a toy being pushed along.
  tractor: { band: "field", cap: 6, spread: 1.4, speed: 6 },
  harvester: { band: "field", cap: 5, spread: 1.2, speed: 4.5 },
  lab: { band: "back", cap: 5 },
  refinery: { band: "back", cap: 5 },
  tower: { band: "back", cap: 5 },
  seeder: { band: "sky", cap: 5, spread: 1.6, speed: 2.5 },
  reactor: { band: "back", cap: 4 },
  orbital: { band: "sky", cap: 4, spread: 1.4, speed: 7 },
  singularity: { band: "sky", cap: 3, spread: 1.2 },
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

/**
 * How a potato gets from where it was made to where it's kept.
 *
 * There used to be one answer to this and it was ballistics: everything on the
 * farm threw its potatoes at the yard on a parabola, and a busy farm looked
 * like a hailstorm. Nothing on a farm moves like that. So every tier now has
 * plumbing instead — the machines auger into a trough, the sheds pipe it down,
 * the hands carry it — and the only thing that leaves the ground unassisted is
 * the one you dug up yourself.
 */

/** A potato on a chute or an auger: straight line, constant speed, no arc. */
interface Haul {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  born: number;
  dur: number;
  /**
   * On a slide rather than in a pipe: picks up speed on the way down and
   * kicks up dirt where it lands. A potato on an auger is being pushed at a
   * constant rate; a potato on a chute is falling.
   */
  slide?: boolean;
}

/** A potato inside the pipeline, measured as distance travelled along it. */
interface Lump {
  /** Where on the horizontal run it was fed in. */
  from: number;
  d: number;
}

/** A potato you turned up yourself: out of the soil, and gone into the sack. */
interface Dug {
  x: number;
  y: number;
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

/**
 * A billow of steam off a cooling tower. Fatter, slower and longer-lived than a
 * puff, and it grows as it climbs — a reactor's plume is the biggest thing on
 * the property and it should be drawn like weather, not like exhaust.
 */
interface Plume {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  dur: number;
  size: number;
}

const MAX_PLUMES = 80;

/** How long a dug potato sits in the open before it's counted and gone. */
const DUG_MS = 850;

/**
 * How much the trough holds before the machines are just tipping it over.
 * Small on purpose: the level is drawn in six pixels, so a cap much past this
 * means the first few potatoes in there round away to nothing showing.
 */
const TROUGH_CAP = 12;

/**
 * Seconds between potatoes going down the trough's spout, when the trough is
 * empty. A full one empties four times faster, which is what stops the level
 * from either pinning at the brim or never showing anything in there at all —
 * it settles wherever the machines above it are actually keeping it.
 */
const TROUGH_DRAIN = 0.8;

/** Buffer pixels a second, for a potato in the pipeline. */
const PIPE_SPEED = 40;

const MAX_HAULS = 24;

/** Beds a machine takes on board before it tips a sack out at the headland. */
const MACHINE_LOAD = 5;
/** What one of those sacks is worth when a hand tips it into the trough. */
const SACK_WORTH = 3;
/** Sacks that can be waiting at once. Past this the machines hold their load. */
const MAX_SACKS = 9;
const MAX_LUMPS = 64;

/** The angled run at the bottom of the pipeline, in pixels across and its fall. */
const CHUTE_LEN = 14;
const CHUTE_SLOPE = 0.7;

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
const HAND_SPEED = 19;
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
  /** The depth it stands at when it's home — ranks, so a big crew isn't a line. */
  homeY: number;
  /** Where it's ambling to while it has nothing to do. */
  loiter: { x: number; y: number };
  /** The row it works by preference, so the crew covers the field. */
  rowPref: number;
  state: "resting" | "out" | "picking" | "back" | "fetch" | "hauling";
  /** Index into the drawn beds. -1 while resting. */
  target: number;
  /** Id of the sack it's been sent for, or -1. */
  sack: number;
  /** Wall time at which a timed state ends. */
  until: number;
  carrying: "none" | "potato" | "sack";
}

/**
 * A machine's load, tipped out at the end of the row for somebody to deal with.
 *
 * The machines used to auger straight into the trough from wherever they stood,
 * which meant the potato left the combine as a thrown object and crossed forty
 * pixels of open air. This is the same journey with the work put back in: the
 * combine fills, tips a sack at the headland, and a hand walks out for it.
 */
interface Sack {
  id: number;
  x: number;
  y: number;
  /** Wall clock at the drop, so it can land rather than appear. */
  born: number;
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
const FIELD_ROWS = 6;

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

/**
 * A cloud seeder, working the sky the way the hands work the ground.
 *
 * These used to drift left to right at a fixed pace on a fixed lane, seeding
 * whatever happened to be under them, and a rank of them was a screensaver.
 * A seeder has a *job*: pick a patch that needs bringing on, dart over it from
 * wherever it is, stop dead, and dump on it. So it holds a position and a
 * destination and moves between them, and it goes up and left as readily as
 * down and right.
 */
interface Flyer {
  x: number;
  y: number;
  /** Where the current dash started, and where it ends. */
  x0: number;
  y0: number;
  tx: number;
  ty: number;
  /** Seconds into the dash, and how long the dash takes. */
  t: number;
  dur: number;
  /** Seconds left standing over the patch. Zero while it's travelling. */
  hold: number;
  /** Metronome for the drops while it's holding. */
  drip: number;
}

/** Buffer pixels a second at full tilt. Fast: it's the sky, nothing's in it. */
const FLY_SPEED = 58;

export class FarmScene {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ro?: ResizeObserver;
  private raf = 0;
  private sh = 200;
  /**
   * Scene time, in seconds, accumulated a capped frame at a time rather than
   * read off the wall clock.
   *
   * A backgrounded tab stops getting frames, and a scene clock derived from a
   * fixed epoch comes back minutes ahead: every bed in the field is suddenly
   * long overdue, every one of them lifts on the same frame, and switching back
   * to the game greeted you with the entire harvest going off at once. The farm
   * pauses with the tab now and picks up where it left off.
   */
  private clock = 0;
  private view: FarmView = EMPTY_VIEW;
  private rngSeed = 1;
  private hauls: Haul[] = [];
  private lumps: Lump[] = [];
  /** Sacks tipped out by the machines, waiting for a hand. */
  private sacks: Sack[] = [];
  private sackId = 0;
  /** How full each drawn machine is, keyed by tier and index. */
  private machineLoad = new Map<string, number>();
  private dug: Dug[] = [];
  private puffs: Puff[] = [];
  /** Cooling-tower steam, on its own budget so it can't starve the dust. */
  private plumes: Plume[] = [];
  /** The plants as laid out this frame. Deterministic, so an index is a place. */
  private beds: Bed[] = [];
  /** This frame's crop rows. Rigs stand beside these; machines drive along them. */
  private rows: Row[] = [];
  /** Fresh furrow behind a tractor, fading. */
  private tills: { x: number; y: number; born: number }[] = [];
  private seeds: Seed[] = [];
  /** The seeders aloft, one entry each, kept between frames. */
  private flyers: Flyer[] = [];
  /** When each bed was last cleared. Indexed the same as `beds`. */
  private planted: number[] = [];
  private hands: Hand[] = [];
  /** What's sitting in the trough, 0..TROUGH_CAP, and the spout's metronome. */
  private troughFill = 0;
  private troughClock = 0;
  /** This frame's trough, as `[x, w, ground]`. Null when nothing works the field. */
  private troughBox: { x: number; w: number; y: number } | null = null;
  /** How far right the pipeline reaches this frame. 0 when nothing feeds it. */
  private pipeEnd = 0;
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
  /** The yard crew, moving the pile into and out of what it paid for. */
  private porters: Porter[] = [];
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
   * A dig: a potato comes up out of the ground where you put your finger, sits
   * in the open for a moment in a cloud of its own dirt, and is gone.
   *
   * It doesn't travel. Digging is the one thing on this farm you do with your
   * hands, and the whole reward is seeing the thing come out of the soil at the
   * spot you picked — carting it anywhere afterwards is the machines' job.
   */
  dig(at?: { x: number; y: number }): void {
    if (this.dug.length > 14) return;
    const top = this.fieldTop() + 8;
    const floor = this.sh - 8;
    const x = at ? Math.max(3, Math.min(SCENE_W - 8, Math.round(at.x))) : 20 + Math.random() * (SCENE_W - 60);
    const y = at ? Math.max(top, Math.min(floor, Math.round(at.y))) : top + 12 + Math.random() * 30;
    this.dug.push({ x: Math.round(x), y: Math.round(y), born: performance.now() });
    this.puff(x, y, "dust", -10);
    this.puff(x + 3, y, "dust", 10);
  }

  /** How ripe a bed is, 0..1, where 1 is ready to lift. */
  private ripeness(i: number, t: number): number {
    const planted = this.planted[i];
    if (planted === undefined) return 0;
    return Math.min(1, (t - planted) / GROW_SECONDS);
  }

  /**
   * Clear a bed and start it again. Nothing is drawn coming off it: whatever
   * lifted the bed is the thing that carries it, and a bed that went over and
   * got tidied up off-screen shouldn't produce a potato out of thin air.
   */
  private lift(i: number, t: number): void {
    // Replanted part-grown, not from bare soil. A farm running eleven machines
    // sweeps every row every few seconds, and a bed that goes back to a two
    // pixel sprout each time means the field you spent the whole game buying
    // is permanently brown.
    this.planted[i] = t - GROW_SECONDS * 0.35;
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
      // Sixteen of them have to stand somewhere: six to a rank, ranks stepped
      // back into the yard and offset half a place so the crew reads as a crew
      // and not a police line.
      const rank = Math.floor(i / 6);
      const inRank = i % 6;
      const home = 12 + inRank * 26 + (rank % 2) * 13;
      const homeY = unload + rank * 7;
      // Staggered so they don't set off on the same frame like a chorus, but
      // barely — two seconds of jitter off a hash rather than two seconds per
      // hand in a queue. Sixteen hands standing in the yard counting to thirty
      // is the crew you just bought doing nothing, which is the opposite of
      // what buying them was for.
      const jitter = fract(Math.sin((i + 1) * 91.7) * 4375.85);
      this.hands.push({
        x: home,
        y: homeY,
        home,
        homeY,
        loiter: { x: home, y: homeY },
        rowPref: i % FIELD_ROWS,
        state: "resting",
        target: -1,
        sack: -1,
        until: t + jitter * 2,
        carrying: "none",
      });
    }

    for (const hand of this.hands) {
      switch (hand.state) {
        case "resting": {
          // Idle hands amble. They pick a spot a few paces off, wander to it at
          // half pace, and pick another — so a crew with nothing ready to lift
          // reads as people standing about a farm rather than a rank of clones
          // waiting for a whistle.
          if (this.walk(hand, hand.loiter.x, hand.loiter.y, dt, 0.35)) {
            hand.loiter = {
              x: clamp(hand.home + (Math.random() - 0.5) * 26, 4, SCENE_W - 10),
              y: clamp(hand.homeY + (Math.random() - 0.5) * 14, yardY + 4, this.sh - 6),
            };
          }
          if (t < hand.until) break;
          // A sack sitting at the headland is worth more than another bed:
          // it's already picked, and it's in the way.
          const sack = this.claimSack(hand);
          if (sack >= 0) {
            hand.sack = sack;
            hand.state = "fetch";
            break;
          }
          const target = this.claimBed(t, hand);
          if (target < 0) {
            // Nothing ready and nothing growing: try again shortly.
            hand.until = t + 0.6 + Math.random();
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
          this.lift(hand.target, t);
          hand.carrying = "potato";
          hand.state = "back";
          break;
        }
        case "fetch": {
          const sack = this.sacks.find((sk) => sk.id === hand.sack);
          if (!sack) {
            hand.sack = -1;
            hand.state = "resting";
            hand.until = t + 0.3;
            break;
          }
          if (this.walk(hand, sack.x, sack.y, dt)) {
            this.sacks = this.sacks.filter((sk) => sk.id !== hand.sack);
            hand.carrying = "sack";
            hand.state = "hauling";
          }
          break;
        }
        case "hauling": {
          // To the trough if there is one — that's where the machines' load
          // goes — and to the yard if there isn't.
          const box = this.troughBox;
          const tx = box ? clamp(hand.x, box.x + 4, box.x + box.w - 6) : hand.home;
          const ty = box ? box.y + 3 : hand.homeY;
          if (this.walk(hand, tx, ty, dt, 0.85)) {
            hand.carrying = "none";
            hand.sack = -1;
            if (box) this.troughFill = Math.min(TROUGH_CAP, this.troughFill + SACK_WORTH);
            this.puff(tx + 1, ty - 2, "dust");
            hand.state = "resting";
            hand.loiter = this.turnAround(hand, yardY);
            hand.until = t + 0.4;
          }
          break;
        }
        case "back": {
          // To the trough, same as the sacks. One deposit point for the whole
          // farm: what a hand pulls out of a bed goes where a combine's load
          // goes, and the trough empties towards the mound.
          const bin = this.troughBox;
          const bx = bin ? clamp(hand.x, bin.x + 4, bin.x + bin.w - 6) : hand.home;
          const by = bin ? bin.y + 3 : hand.homeY;
          if (this.walk(hand, bx, by, dt)) {
            hand.carrying = "none";
            if (bin) this.troughFill = Math.min(TROUGH_CAP, this.troughFill + 1);
            // Set down, not thrown. The dirt it kicks up is the whole event.
            this.puff(bx + 2, by - 1, "dust");
            hand.state = "resting";
            hand.target = -1;
            hand.loiter = this.turnAround(hand, yardY);
            hand.until = t + REST_SECONDS * (0.5 + Math.random());
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
  private claimBed(t: number, hand: Hand): number {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < this.beds.length; i++) {
      const bed = this.beds[i]!;
      if (bed.dry) continue;
      if (this.hands.some((h) => h.target === i)) continue;
      const ripe = this.ripeness(i, t);
      if (ripe <= 0.55) continue;
      // Ripest first, then weighted against the walk, then against the row
      // this one tends to work. Purely by ripeness they all set off for the
      // same corner, because beds ripen in patches; purely by distance they
      // all crowd the near row. Each hand leaning towards a row of its own is
      // what spreads the crew over the whole field.
      const score =
        ripe * 40 -
        Math.hypot(bed.x - hand.x, bed.y - hand.y) * 0.35 -
        Math.abs(bed.row - hand.rowPref) * 9;
      if (best < 0 || score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  /** Step a hand toward a point. True once it's there. */
  private walk(hand: Hand, tx: number, ty: number, dt: number, pace = 1): boolean {
    const dx = tx - hand.x;
    const dy = ty - hand.y;
    const d = Math.hypot(dx, dy);
    if (d < 1.5) {
      hand.x = tx;
      hand.y = ty;
      return true;
    }
    const step = Math.min(d, HAND_SPEED * pace * dt);
    hand.x += (dx / d) * step;
    hand.y += (dy / d) * step;
    return false;
  }

  private drawHands(t: number): void {
    const ctx = this.ctx;
    const sprite = artCanvas(this.mark("hand"));
    const spud = artCanvas(POTATO_SPRITE);
    const sack = artCanvas(SACK);
    for (const hand of this.hands) {
      const moving = hand.state !== "resting" && hand.state !== "picking";
      // A 1px bob while walking, and a deeper stoop while pulling a bed.
      const bob = moving ? Math.floor(t * 4) % 2 : hand.state === "picking" ? 2 : 0;
      const x = Math.round(hand.x);
      const y = Math.round(hand.y) - sprite.h + bob;
      ctx.drawImage(sprite.canvas, x, y);
      if (hand.carrying === "potato") ctx.drawImage(spud.canvas, x + 1, y - 4);
      // Sacks ride on the shoulder, which is also why a hand carrying one
      // walks at eighty-five per cent pace.
      if (hand.carrying === "sack") ctx.drawImage(sack.canvas, x - 2, y - sack.h + 3);
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
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.dt = dt;
    this.lastFrame = now;
    this.clock += dt;
    const t = this.clock;
    const phase = phaseNow();
    const horizon = this.fieldTop();
    const yardY = this.yardTop();

    this.stepHoard(dt, now);
    this.pipeEnd = 0;

    this.drawSky(phase, t, horizon);
    this.drawHills(phase, horizon);
    this.drawGround(horizon, yardY);
    this.drawBack(t, now, horizon);
    this.drawField(t, now, horizon, yardY);
    this.drawSacks(now);
    this.drawPuffs(now, dt);
    this.drawFence(yardY);
    this.drawHoard(now);
    // The spout hangs over the yard on its way to the mound at the front of it,
    // so it's drawn after the yard rather than with the trough it comes off:
    // behind the silos it was pouring the crop out somewhere you couldn't see.
    if (this.troughBox) this.drawSpout(this.troughBox);
    this.drawPorters(now);
    // After the hoard: the pipeline runs down the near side of the yard, so it
    // passes in front of the silos rather than being swallowed by them.
    this.drawPipeline(horizon, yardY, dt);
    // The hands walk between the two bands, so they're drawn after both — and
    // after the field has said where this frame's beds are.
    this.stepHands(t, dt, shownCount(this.view.working.hand ?? 0, PLACEMENT.hand.cap, PLACEMENT.hand.spread), yardY);
    this.drawHands(t);
    this.drawHauls(now);
    this.drawDug(now);
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
    // Shade along the back of it, under the fence, where nothing stands. One
    // flat brown from the fence to the bottom of the screen gave the yard no
    // floor at all — everything in it looked stuck to a wall.
    ctx.fillStyle = DIRT_DARK;
    ctx.fillRect(0, yardY, SCENE_W, 3);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, yardY + 3, SCENE_W, 3);
    ctx.globalAlpha = 1;
    const rng = mulberry32(this.rngSeed ^ 0x9e37);
    for (let i = 0; i < 30; i++) {
      ctx.fillRect(
        Math.floor(rng() * SCENE_W),
        yardY + 6 + Math.floor(rng() * Math.max(1, this.sh - yardY - 8)),
        2,
        1,
      );
    }

    // The apron: the patch in front of the mound is walked over all day and
    // has everything on the farm tipped onto it, so it's bare and paler than
    // the rest. It also gives the heap somewhere to sit.
    const foot = this.station(0);
    ctx.fillStyle = "#9a6c48";
    ctx.fillRect(HEAP_X - 5, foot - 3, HEAP_W - HEAP_X + 10, 6);
    ctx.fillRect(HEAP_X - 3, foot - 5, HEAP_W - HEAP_X + 6, 10);
    ctx.fillStyle = "#a87a54";
    ctx.fillRect(HEAP_X - 2, foot - 4, HEAP_W - HEAP_X + 4, 5);
  }

  /** Buildings and the skyline: the far edge of the property. */
  private drawBack(t: number, now: number, horizon: number): void {
    const ctx = this.ctx;
    const baseline = horizon + 8;

    // Steam first, so it comes out from behind the towers rather than over
    // the front of them.
    this.drawPlumes(now);

    // No barn. It stood here for a long time as a bookend and it never meant
    // anything — nothing you buy touched it, and it was taking a third of the
    // back edge away from the tiers that do.
    const tree = artCanvas(TREE);
    ctx.drawImage(tree.canvas, SCENE_W - tree.w - 3, baseline - tree.h + 2);

    // Everything else queues up along the back edge in tier order, so climbing
    // the ladder reads as the skyline filling in.
    const queue: { id: solo.SoloProducerId; art: Art; dead: boolean }[] = [];
    for (const id of ORDER) {
      const place = PLACEMENT[id];
      if (place.band !== "back") continue;
      const n = shownCount(this.view.working[id] ?? 0, place.cap, place.spread);
      const brokenN = shownCount(this.view.broken[id] ?? 0, place.cap, place.spread);
      const art = this.mark(id);
      for (let i = 0; i < n; i++) queue.push({ id, art, dead: false });
      for (let i = 0; i < brokenN; i++) queue.push({ id, art, dead: true });
    }

    // When the skyline is full, the *lowest* tiers give up their spot. A farm
    // with a fusion reactor shouldn't be showing you its third tuber lab
    // instead — the newest thing you bought is the thing you want to look at.
    const left = 4;
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
        this.buildingLife(item.id, x, baseline - sprite.h, sprite.w, sprite.h, t, idx);
        // Everything along the back edge stands on the pipeline, and every so
        // often drops something into it. A trickle, not a conveyor: the far
        // side of the property should read as a place that's busy.
        this.pipeEnd = Math.max(this.pipeEnd, x + Math.floor(sprite.w / 2));
        // Each shed tips in about once a second. With a skyline of them the
        // trunk runs properly full, which is what a farm making most of its
        // potatoes up here should look like.
        if (this.chance(1.1)) this.feedPipe(x + Math.floor(sprite.w / 2));
      }
      idx++;
      x += sprite.w + 2;
    }
  }

  /** Which mark of a tier is standing, 0..2. */
  private markLevel(id: solo.SoloProducerId): number {
    return Math.max(0, Math.min(2, this.view.marks[id] ?? 0));
  }

  /**
   * What a building on the back edge does while it stands there.
   *
   * Every one of them used to get the same two blinking pixels and the same
   * wisp of steam off the top left corner, which at a glance made the whole
   * skyline one building repeated. They're different industries: the lab is lit
   * and bubbling, the refinery is on fire, the tower is a rack of grow lights
   * cycling, and the reactor is a reactor.
   */
  private buildingLife(
    id: solo.SoloProducerId,
    x: number,
    top: number,
    w: number,
    h: number,
    t: number,
    idx: number,
  ): void {
    const ctx = this.ctx;
    switch (id) {
      case "lab": {
        // Three lit windows on their own phases, and whatever's in the dome.
        for (const [k, c] of [2, 7, 12].entries()) {
          const beat = Math.sin(t * 1.7 + idx * 2.1 + k * 1.9);
          if (beat <= -0.2) continue;
          ctx.globalAlpha = 0.3 + 0.5 * Math.max(0, beat);
          ctx.fillStyle = "#e4fbff";
          ctx.fillRect(x + c, top + 6, 2, 2);
        }
        const glow = 0.5 + 0.5 * Math.sin(t * 1.1 + idx);
        ctx.globalAlpha = 0.2 + 0.35 * glow;
        ctx.fillStyle = "#b6f2fb";
        ctx.fillRect(x + 4, top + 1, 8, 3 - Math.round(glow));
        ctx.globalAlpha = 1;
        if (this.chance(0.5)) this.puff(x + 8, top, "steam", 2);
        break;
      }
      case "refinery": {
        // The flare stack, which is the one thing on the skyline that's alight.
        // Later marks draw a flame into the art, so the live one is anchored to
        // where the stack actually tops out rather than to the top of the
        // sprite — otherwise the upgrade lights a second fire above the first.
        const stack = top + [0, 2, 3][this.markLevel("refinery")]!;
        const flick = fract(Math.sin(t * 11.3 + idx * 4.1) * 4375.85);
        const tall = 2 + Math.round(flick * 2);
        ctx.fillStyle = "#f0913c";
        ctx.fillRect(x + 11, stack - tall, 3, tall);
        ctx.fillStyle = "#ffe08a";
        ctx.fillRect(x + 12, stack - tall + 1, 1, Math.max(1, tall - 1));
        if (this.chance(0.9)) this.puff(x + 12, stack - tall - 1, "steam", 7);
        // Vessel lights down the near tank, running in sequence.
        const lamp = Math.floor(t * 2.2 + idx) % 3;
        ctx.fillStyle = "#ffd782";
        ctx.fillRect(x + 2, top + h - 3 - lamp * 2, 1, 1);
        break;
      }
      case "tower": {
        // A rack of grow lights, cycling floor by floor: the light walks up the
        // tower and starts again, so a row of them ripples.
        const floors = Math.max(1, Math.round((h - 7) / 3));
        const lit = Math.floor(t * 2.6 + idx * 1.7) % floors;
        for (const c of [2, 6]) {
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = "#e6ffc4";
          ctx.fillRect(x + c, top + 4 + lit * 3, 2, 2);
        }
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#c8f5a0";
        ctx.fillRect(x - 1, top + 3 + lit * 3, w + 2, 4);
        ctx.globalAlpha = 1;
        break;
      }
      case "reactor": {
        // Steam off the tower, continuously. This is the only thing on the farm
        // that draws its own weather.
        if (this.plumes.length < MAX_PLUMES && this.chance(11)) {
          this.plumes.push({
            x: x + w / 2 - 2 + (Math.random() - 0.5) * 6,
            y: top + 1 - Math.random() * 2,
            // Barely any sideways push to start with: it leaves the mouth as a
            // column and only finds the wind once it's clear of the tower.
            vx: (Math.random() - 0.5) * 3,
            vy: -15 - Math.random() * 6,
            born: performance.now(),
            dur: 2600 + Math.random() * 1200,
            size: 3,
          });
        }
        // The core, seen through the throat of the tower, and its bloom.
        // A slow breath with a fast flicker on top of it — a steady glow reads
        // as a light left on, and this is supposed to be a reaction.
        const pulse =
          (0.5 + 0.5 * Math.sin(t * 2.7 + idx * 1.3)) * (0.8 + 0.2 * fract(Math.sin(t * 37 + idx) * 4375.85));
        ctx.fillStyle = "#9dfbe0";
        ctx.globalAlpha = 0.1 + 0.1 * pulse;
        ctx.fillRect(x + 2, top + 3, w - 4, 6);
        ctx.globalAlpha = 0.2 + 0.22 * pulse;
        ctx.fillRect(x + 4, top + 4, w - 8, 4);
        ctx.globalAlpha = 0.5 + 0.5 * pulse;
        ctx.fillRect(x + 5, top + 5, 4, 2);
        // Hazard strobes on the rim, and the light the whole thing throws on
        // the ground it stands on.
        ctx.globalAlpha = 0.08 + 0.07 * pulse;
        ctx.fillRect(x - 1, top + h - 2, w + 2, 2);
        ctx.globalAlpha = 1;
        if ((t * 0.75 + idx * 0.4) % 1 < 0.14) {
          ctx.fillStyle = "#ff5b4a";
          ctx.fillRect(x + 1, top + 1, 1, 1);
          ctx.fillRect(x + w - 2, top + 1, 1, 1);
        }
        break;
      }
      default: {
        // Anything else that ends up back here keeps the old night shift: a
        // lit window and a wisp off the roof.
        if (this.chance(0.45)) this.puff(x + 2, top - 1, "steam");
        const beat = Math.sin(t * 1.4 + idx * 2.3);
        if (beat > 0.1) {
          ctx.fillStyle = beat > 0.75 ? "#fff0b8" : "#ffd782";
          ctx.fillRect(x + 2, top + 2, 2, 1);
        }
      }
    }
  }

  /** Cooling-tower steam: rises, spreads, thins out and is gone. */
  private drawPlumes(now: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = "#eef3f7";
    this.plumes = this.plumes.filter((p) => {
      const age = now - p.born;
      if (age > p.dur) return false;
      const f = age / p.dur;
      p.x += p.vx * this.dt;
      p.y += p.vy * this.dt;
      // It slows as it climbs and leans off downwind, like the real thing.
      p.vy *= 1 - this.dt * 0.35;
      p.vx += this.dt * 2.5;
      const size = p.size + Math.round(f * 4);
      ctx.globalAlpha = 0.6 * (1 - f * f);
      ctx.fillRect(Math.round(p.x), Math.round(p.y), size, Math.max(1, size - 1));
      ctx.globalAlpha = 1;
      return true;
    });
  }

  // --- The pipeline --------------------------------------------------------
  //
  // Everything on the back edge is a building, and a building doesn't carry
  // things. What it does is pipe them: one run along the foot of the sheds,
  // one riser down the west side of the field, and a spout over the yard. You
  // can see the potatoes moving inside it, which is the entire point — the
  // industrial half of the ladder used to prove it was working by lobbing
  // produce over the fence.

  /** Height of the pipe's run above the field, measured off the back baseline. */
  private pipeY(horizon: number): number {
    return horizon + 10;
  }

  private feedPipe(from: number): void {
    if (this.lumps.length >= MAX_LUMPS) return;
    this.lumps.push({ from: Math.max(8, Math.round(from)), d: 0 });
  }

  private drawPipeline(horizon: number, yardY: number, dt: number): void {
    const ctx = this.ctx;
    const y = this.pipeY(horizon);
    // The riser runs right down the west side of the yard to just above the
    // mound, because that's what it's filling. Stopping at the top of the yard
    // meant a chute pointed at forty pixels of empty dirt.
    const foot = Math.max(yardY + 12, this.station(0) - 30);
    const reach = this.lumps.reduce((m, l) => Math.max(m, l.from), this.pipeEnd);
    if (reach <= 0) return;

    // Everything the industrial half of the farm makes comes down this thing,
    // and for a long time it was a five pixel drainpipe. It's now built like it
    // carries the load: a nine-pixel trunk on trestles, a hopper where the
    // sheds tip into it, collars down the riser and a proper outfall over the
    // yard with the crop visibly falling out of it.
    const body = "#a8b0b8";
    const edge = "#7f8891";
    const dark = "#68707a";
    const W = 9; // outside width of the trunk
    const runTo = 2; // left edge of the riser
    const midY = y + 3; // where the potatoes ride inside the run

    // Trestles under the horizontal run, so it's carried rather than floating.
    ctx.fillStyle = dark;
    for (let px = 22; px < reach - 6; px += 26) {
      ctx.fillRect(px, y + W, 1, 5);
      ctx.fillRect(px + 4, y + W, 1, 5);
      ctx.fillRect(px - 1, y + W + 5, 7, 1);
    }

    // The run: dark rims top and bottom, lit body, and a highlight line along
    // the top so it reads as a tube and not a rectangle.
    ctx.fillStyle = edge;
    ctx.fillRect(1, y, reach, W);
    ctx.fillStyle = body;
    ctx.fillRect(1, y + 1, reach, W - 3);
    ctx.fillStyle = "#c3cad1";
    ctx.fillRect(1, y + 1, reach, 1);
    // Seams, every so often along the run.
    ctx.fillStyle = dark;
    for (let px = 14; px < reach - 2; px += 18) ctx.fillRect(px, y, 1, W);

    // The hopper at the far end, where the sheds tip in: a funnel wider than
    // the pipe, so the run has somewhere to have come from.
    const hx = Math.min(SCENE_W - 3, reach);
    ctx.fillStyle = dark;
    ctx.fillRect(hx - 10, y - 6, 12, 1);
    ctx.fillStyle = body;
    for (let i = 0; i < 5; i++) ctx.fillRect(hx - 9 + i, y - 5 + i, 11 - i * 2, 1);

    // The riser, with collars.
    ctx.fillStyle = edge;
    ctx.fillRect(runTo - 1, y, W, foot - y);
    ctx.fillStyle = body;
    ctx.fillRect(runTo, y, W - 2, foot - y);
    ctx.fillStyle = "#c3cad1";
    ctx.fillRect(runTo, y, 1, foot - y);
    ctx.fillStyle = dark;
    for (let cy = y + 14; cy < foot - 8; cy += 16) ctx.fillRect(runTo - 2, cy, W + 2, 2);

    // The outfall: a chute, angled the way the potatoes actually leave. It was
    // drawn as a right-angled box with a lip, and the crop came out of it on a
    // diagonal — the pipe was telling you one thing and the potatoes another.
    for (let i = 0; i < CHUTE_LEN; i++) {
      const cx = runTo + i;
      const cy = Math.round(foot - 4 + i * CHUTE_SLOPE);
      ctx.fillStyle = dark;
      ctx.fillRect(cx, cy, 1, 1);
      ctx.fillRect(cx, cy + 8, 1, 1);
      ctx.fillStyle = body;
      ctx.fillRect(cx, cy + 1, 1, 7);
      ctx.fillStyle = "#c3cad1";
      ctx.fillRect(cx, cy + 1, 1, 1);
      // A couple of bands across it, like the riser's collars.
      if (i === 5 || i === 10) {
        ctx.fillStyle = dark;
        ctx.fillRect(cx, cy, 1, 9);
      }
    }
    // The open end, squared off so it reads as a mouth and not a broken pipe.
    const endX = runTo + CHUTE_LEN;
    const endY = Math.round(foot - 4 + CHUTE_LEN * CHUTE_SLOPE);
    ctx.fillStyle = dark;
    ctx.fillRect(endX, endY, 1, 9);

    // Whole potatoes in the pipe, not tan squares: outlined, so a hundred of
    // them nose to tail still reads as a hundred potatoes rather than a stripe.
    const spud = artCanvas(POTATO_SPRITE);
    this.lumps = this.lumps.filter((lump) => {
      lump.d += PIPE_SPEED * dt;
      const across = lump.from - runTo;
      if (lump.d < across) {
        // Along the run, riding with a one pixel jog so the contents rattle
        // rather than slide.
        const px = Math.round(lump.from - lump.d);
        ctx.drawImage(spud.canvas, px, midY - 2 + (px % 5 === 0 ? 0 : 1));
        return true;
      }
      const down = y + 2 + (lump.d - across);
      if (down < foot - 3) {
        ctx.drawImage(spud.canvas, runTo, Math.round(down));
        return true;
      }
      // Down the chute and off the end onto the pile. It's already in the
      // yard's count — this is just the last thing you see it do.
      const out = down - (foot - 3);
      if (out > CHUTE_LEN + 6) {
        this.puff(runTo + CHUTE_LEN, endY + 8, "dust");
        return false;
      }
      ctx.drawImage(
        spud.canvas,
        runTo + Math.round(out),
        Math.round(foot - 3 + out * CHUTE_SLOPE),
      );
      return true;
    });
  }

  private drawField(t: number, now: number, horizon: number, yardY: number): void {
    const ctx = this.ctx;
    const rng = mulberry32(this.rngSeed);
    const top = horizon + 12;
    const depth = Math.max(20, yardY - top - 4);

    /** Ground-level y for a lane given as a fraction of the field's depth. */
    const lane = (f: number) => top + Math.round(depth * f);

    // The field.
    //
    // The land is all there from the first frame: five worked rows, full width,
    // waiting. Buying a Potato Plot plants one bed in it. Before, the rows were
    // sized to the crop and the crop was a log curve on the owned count, which
    // meant the field's shape was a readout — and a readout that spent most of
    // the game with the front half of the ground left as lawn. Empty furrows
    // are not dead space, they're the thing you're filling in, and one plot
    // buying one visible plant is a straighter line between the button and the
    // farm than any curve was.
    const stages = cropStages(this.mark("plot"));
    const plant = artCanvas(this.mark("plot"));
    const wiltShare = 1 - this.view.soil;
    const step = plant.w + 1;
    // Wide, but leaving a rig's width of headland at each end: the irrigation
    // stands off the ends of the rows it waters, and a row that runs to the
    // screen edge has nowhere to put it.
    const marginX = 16;
    const usable = SCENE_W - marginX * 2;
    const perRow = Math.max(3, Math.floor(usable / step));
    const slots = perRow * FIELD_ROWS;
    // One plot, one bed, until the land runs out — which it does at ninety
    // plots, deep into a run and well past the point where the field stopped
    // being the thing you're watching.
    const plants = Math.min(slots, this.view.working.plot ?? 0);
    const rowWidth = perRow * step - 1;
    const rowLeft = marginX + Math.round((usable - rowWidth) / 2);

    // Evenly through the band, the last row stopping short of the fence to
    // leave the headland the machines turn on.
    const rowGround = (r: number) => lane(0.08 + (r * 0.78) / (FIELD_ROWS - 1));

    // A little ambient green around the edges of the worked ground.
    const tuft = artCanvas(TUFT);
    const flowers = artCanvas(FLOWERS);
    for (let i = 0; i < 14; i++) {
      const sprite = rng() < 0.3 ? flowers : tuft;
      const x = Math.floor(rng() * (SCENE_W - sprite.w));
      ctx.drawImage(sprite.canvas, x, lane(rng()) - sprite.h);
    }

    this.beds.length = 0;
    this.rows.length = 0;
    this.drawTills(now);

    // The trough gets sited before anything is drawn into it, because the
    // machines above need to know where they're aiming.
    // Everything the field produces goes in the trough — the machines tip
    // sacks for the crew to carry over, and the crew's own pickings go in the
    // same place. So it's there as soon as anybody's working, not just when
    // there's a machine.
    const works =
      (this.view.working.tractor ?? 0) +
        (this.view.working.harvester ?? 0) +
        (this.view.working.hand ?? 0) >
        0 || this.troughFill > 0;
    this.troughBox = works ? { x: 26, w: 112, y: lane(0.99) } : null;

    for (let r = 0; r < FIELD_ROWS; r++) {
      const count = Math.max(0, Math.min(perRow, plants - r * perRow));
      const left = rowLeft;
      const ground = rowGround(r);
      this.rows.push({ y: ground, left, right: left + rowWidth });

      // Worked soil under the beds you own, and the rest of the row left as
      // grass with the furrow line still marked out across it. Ploughing the
      // whole row regardless made a new farm look like six enormous empty
      // planters; a marked-out line reads as the land being there and waiting,
      // which is what it is.
      const worked = count > 0 ? count * step + 1 : 0;
      ctx.fillStyle = this.view.soil < 0.7 ? "#8a7a3c" : DIRT;
      ctx.fillRect(left - 2, ground - 2, worked, 3);
      ctx.fillStyle = DIRT_DARK;
      ctx.fillRect(left - 2, ground + 1, worked, 1);
      ctx.fillStyle = GRASS_DARK;
      for (let c = count; c < perRow; c++) ctx.fillRect(left + c * step, ground, step - 2, 1);

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
    const sprinklers = shownCount(this.view.working.irrigation ?? 0, PLACEMENT.irrigation.cap, PLACEMENT.irrigation.spread);
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
      const n = shownCount(this.view.working[id] ?? 0, place.cap, place.spread);
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
        // Phase and pace are hashed per machine rather than dealt out evenly.
        // Evenly spaced starts at one shared speed drew two perfect diagonals
        // — the tractors going one way down the rows and the combines the
        // other — and a farm that renders a clean X across itself all day is
        // clearly a formula and not a place where work is happening.
        const h = fract(Math.sin((i + 1) * (id === "harvester" ? 63.7 : 21.3)) * 4375.85);
        const pace = place.speed! * (0.78 + 0.44 * fract(h * 7.13));
        const x = Math.floor((((t * pace + h * span) % span) + span) % span) - sprite.w;
        ctx.drawImage(sprite.canvas, x, ground - sprite.h);
        if (this.chance(2.5)) this.puff(x + 1, ground - 2, "dust");

        if (id === "tractor") {
          // A tractor ploughs. The furrow it leaves is the whole reason to
          // watch one cross a field.
          if (this.tills.length < 90 && this.chance(14)) {
            this.tills.push({ x: x + 1, y: ground - 1, born: now });
          }
        }

        // Both of them lift what's ready under the header as they pass, and
        // both of them unload the same way a real one does: an auger swung out
        // over the trough, with the crop visibly going down it.
        const reach = id === "harvester" ? 6 : 2;
        const key = `${id}${i}`;
        for (let b = 0; b < this.beds.length; b++) {
          const bed = this.beds[b]!;
          if (bed.dry || Math.abs(bed.y - (ground - 5)) > 3) continue;
          if (bed.x < x - reach || bed.x > x + sprite.w + reach) continue;
          if (this.ripeness(b, t) < 1) continue;
          this.lift(b, t);
          this.machineLoad.set(key, (this.machineLoad.get(key) ?? 0) + 1);
        }
        // Full up: tip it out at the end of the row it's working and carry on.
        // A sack on the headland is a job for somebody, which is the point —
        // the machines and the crew are the same operation now.
        if ((this.machineLoad.get(key) ?? 0) >= MACHINE_LOAD && this.sacks.length < MAX_SACKS) {
          this.machineLoad.set(key, 0);
          // Nobody to fetch it: a farm with machines and no crew tips straight
          // into the trough rather than leaving sacks out in the rain forever.
          if (this.hands.length === 0) {
            this.troughFill = Math.min(TROUGH_CAP, this.troughFill + SACK_WORTH);
            continue;
          }
          // Just inside the end of the row, not past it: a sack half off the
          // side of the screen is a sack nobody sees get fetched.
          const at = row
            ? clamp(row.right - 8, 4, SCENE_W - 14)
            : clamp(x + sprite.w, 4, SCENE_W - 14);
          this.sacks.push({
            id: this.sackId++,
            x: at + (this.sacks.length % 3) * 3,
            y: ground + 3,
            born: now,
          });
          this.puff(at + 4, ground + 2, "dust");
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
      const brokenN = shownCount(this.view.broken[id] ?? 0, place.cap, place.spread);
      for (let i = 0; i < brokenN; i++) {
        const dead = artTinted(this.mark(id), "#6b6b74", 0.62);
        if (deadX + dead.w > SCENE_W - 6) break;
        ctx.drawImage(dead.canvas, deadX, lane(0.99) - dead.h);
        deadX += dead.w + 3;
      }
    }

    // The sky tiers, above everything on the ground — and each of them doing
    // its own job to the field below rather than sliding past it.
    this.stepFlyers(
      shownCount(this.view.working.seeder ?? 0, PLACEMENT.seeder.cap, PLACEMENT.seeder.spread),
      artCanvas(this.mark("seeder")),
      t,
    );

    for (const id of ["orbital", "singularity"] as const) {
      const place = PLACEMENT[id];
      const n = shownCount(this.view.working[id] ?? 0, place.cap, place.spread);
      const sprite = artCanvas(this.mark(id));
      for (let i = 0; i < n; i++) {
        // Same problem the machines had: one shared speed and evenly dealt
        // starting positions is a formation, not traffic. Everything up here
        // gets its own pace, its own start, its own altitude and its own slow
        // wander off a hash, so no two of them ever line up for long.
        const h = fract(Math.sin((i + 1) * 47.3 + id.length * 13.1) * 4375.85);
        const h2 = fract(h * 137.7);
        const h3 = fract(h2 * 91.3);
        if (place.speed) {
          const span = SCENE_W + sprite.w;
          const pace = place.speed * (0.68 + 0.7 * h);
          const x = Math.floor((((t * pace + h2 * span) % span) + span) % span) - sprite.w;
          // Its own lane, plus a slow rise and fall across it — they drift
          // through each other's altitude rather than flying in a stack.
          const lane = 3 + Math.round(h3 * 26);
          const y = lane + Math.round(Math.sin(t * (0.25 + h2 * 0.4) + h * 9) * 4);
          ctx.drawImage(sprite.canvas, x, y);

          // The greenhouse runs a grow-light down onto the rows in sweeps.
          const cycle = (t * 0.14 + i * 0.37) % 1;
          if (cycle < 0.22) this.drawBeam(x + sprite.w / 2, y + sprite.h, t, cycle / 0.22);
        } else {
          // The singularity doesn't travel. It hangs there and breathes, and
          // what it makes goes into the same pipeline as everything else the
          // industrial half of the farm produces — it just doesn't need a shed
          // to do it from.
          // It hangs, but it doesn't hang still: a slow lissajous a few pixels
          // wide, on its own phase, so two of them never breathe together.
          const x = 14 + Math.round(h * 120) + Math.round(Math.sin(t * 0.31 + h2 * 6) * 4);
          const y = 8 + Math.round(h2 * 26) + Math.round(Math.sin(t * 0.43 + h3 * 6) * 3);
          this.drawPulse(x + sprite.w / 2, y + sprite.h / 2, t + i);
          ctx.drawImage(sprite.canvas, x, y);
          this.pipeEnd = Math.max(this.pipeEnd, x + Math.floor(sprite.w / 2));
          if (this.chance(1.4)) this.feedPipe(x + Math.floor(sprite.w / 2));
        }
      }
    }

    this.stepSeeds(t);
    this.stepTrough(now);
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

  /**
   * The seeders, flying. Each one dashes to a patch that needs bringing on,
   * stops over it, empties its hopper into it, and picks somewhere else.
   *
   * The dash eases in and out, which is what makes it read as a machine going
   * somewhere on purpose rather than a cloud being blown about: it leans on,
   * runs, and settles.
   */
  private stepFlyers(n: number, sprite: { w: number; h: number; canvas: CanvasImageSource }, t: number): void {
    const ctx = this.ctx;
    while (this.flyers.length < n) this.flyers.push(this.newFlyer(sprite.w));
    if (this.flyers.length > n) this.flyers.length = Math.max(0, n);

    for (const f of this.flyers) {
      if (f.hold > 0) {
        // Parked. It bobs on the spot and drips, and the drops are aimed at
        // whatever's underneath rather than halfway across the field.
        f.hold -= this.dt;
        f.drip -= this.dt;
        if (f.drip <= 0) {
          f.drip = 0.13 + Math.random() * 0.1;
          if (this.seeds.length < 24) this.dropSeedNear(f.x + sprite.w / 2, f.y + sprite.h);
        }
        if (f.hold <= 0) this.aimFlyer(f, sprite.w);
      } else {
        f.t += this.dt;
        const p = Math.min(1, f.t / f.dur);
        // Ease in and out of the dash.
        const e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
        f.x = f.x0 + (f.tx - f.x0) * e;
        f.y = f.y0 + (f.ty - f.y0) * e;
        if (p >= 1) {
          f.hold = 1.1 + Math.random() * 1.4;
          f.drip = 0.1;
        }
      }
      const bob = f.hold > 0 ? Math.round(Math.sin(t * 3.1 + f.x) * 1) : 0;
      ctx.drawImage(sprite.canvas, Math.round(f.x), Math.round(f.y) + bob);
    }
  }

  private newFlyer(w: number): Flyer {
    const x = Math.random() * (SCENE_W - w);
    const y = 3 + Math.random() * 24;
    const f: Flyer = { x, y, x0: x, y0: y, tx: x, ty: y, t: 0, dur: 1, hold: 0, drip: 0 };
    this.aimFlyer(f, w);
    return f;
  }

  /** Send a seeder somewhere worth going: over the patch that needs it most. */
  private aimFlyer(f: Flyer, w: number): void {
    let tx = Math.random() * (SCENE_W - w);
    if (this.beds.length > 0) {
      let pick = Math.floor(Math.random() * this.beds.length);
      for (let i = 0; i < 5; i++) {
        const other = Math.floor(Math.random() * this.beds.length);
        if ((this.planted[other] ?? 0) > (this.planted[pick] ?? 0)) pick = other;
      }
      tx = clamp((this.beds[pick]?.x ?? tx) - w / 2, 0, SCENE_W - w);
    }
    f.x0 = f.x;
    f.y0 = f.y;
    f.tx = tx;
    // A new altitude every time, so they cross each other's lanes instead of
    // filing along one.
    f.ty = 2 + Math.random() * 26;
    f.t = 0;
    f.hold = 0;
    f.dur = Math.max(0.55, Math.hypot(f.tx - f.x, f.ty - f.y) / FLY_SPEED);
  }

  /**
   * Aim a seed at a plant that could use one, near where it was dropped: a
   * seeder that stopped somewhere on purpose drops on what it's standing over.
   * A hovering machine whose seeds all sail off to the far side of the field is
   * a machine that didn't need to stop.
   */
  private dropSeedNear(x: number, y: number): void {
    if (this.beds.length === 0) return;
    let pick = -1;
    let best = Infinity;
    for (let i = 0; i < 8; i++) {
      const other = Math.floor(Math.random() * this.beds.length);
      const bed = this.beds[other];
      if (!bed) continue;
      // Nearest to the nozzle, with a nudge towards the ones furthest behind.
      const score = Math.abs(bed.x + 3 - x) - (this.clock - (this.planted[other] ?? 0)) * 0.4;
      if (score < best) {
        best = score;
        pick = other;
      }
    }
    if (pick < 0) return;
    this.seeds.push({ x, y, vy: 30 + Math.random() * 12, crop: pick });
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

    this.ambleYard(now);

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
      const arrives = this.sendPorter(prop, sprite.w, foot, born, up);
      if (!up || this.bundles.length > 24) continue;
      // What the porter tips in when they get there. Three potatoes over the
      // lip is enough to read as "that pile went in there" without burying the
      // thing that just arrived.
      const drop = prop.x + Math.floor(sprite.w / 2);
      for (let n = 0; n < 3; n++) {
        this.bundles.push({
          art: POTATO_SPRITE,
          x0: drop - 8,
          y0: foot - 12,
          x1: drop - 3 + n * 2,
          y1: foot - sprite.h + 2,
          born: arrives + n * 90,
          dur: 380,
          poof: false,
        });
      }
    }
  }

  /**
   * Send somebody out with a sack, and say when they'll get there.
   *
   * Going up they set off from the mound and come back for another; going down
   * they come out of whatever's being taken apart and carry it off the right
   * hand edge, which is where the yard's gate is as far as anyone watching is
   * concerned. Either way the load is only ever on screen once.
   */
  private sendPorter(prop: Prop, w: number, foot: number, born: number, up: boolean): number {
    const at = this.doorstep(prop, w, foot);
    const yard = this.station(0);
    const mound = { x: HEAP_W - 2, y: yard };
    const gate = { x: SCENE_W + 4, y: yard };
    return up ? this.pushPorter(mound, at, born, true) : this.pushPorter(at, gate, born, false);
  }

  /** Where you'd stand to load something: at its feet, a little to the left. */
  private doorstep(prop: Prop, w: number, foot: number): { x: number; y: number } {
    return { x: prop.x + Math.floor(w / 2) - 10, y: foot };
  }

  private pushPorter(
    start: { x: number; y: number },
    end: { x: number; y: number },
    born: number,
    home: boolean,
  ): number {
    if (this.porters.length > 5) return born;
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    const walk = Math.max(500, Math.min(2400, (dist / PORTER_SPEED) * 1000));
    this.porters.push({ x0: start.x, y0: start.y, x1: end.x, y1: end.y, born, walk, home });
    return born + walk;
  }

  /**
   * The yard, being kept. Every so often somebody shifts a sack from one store
   * to another — nothing to do with the count, which doesn't move a potato
   * either way. It's just that a yard where the only thing that ever happens is
   * a threshold being crossed is a yard nobody works in.
   */
  private ambleYard(now: number): void {
    if (this.porters.length > 0 || !this.chance(0.06)) return;
    const standing: Prop[] = [];
    for (let s = 0; s <= this.shownLayout.stage && s < YARD.length; s++) {
      const prop = YARD[s]?.add;
      if (prop) standing.push(prop);
    }
    if (standing.length < 2) return;
    const i = Math.floor(Math.random() * standing.length);
    let j = Math.floor(Math.random() * (standing.length - 1));
    if (j >= i) j++;
    const from = standing[i]!;
    const to = standing[j]!;
    const a = this.doorstep(from, artCanvas(from.art).w, this.propFoot(from));
    const b = this.doorstep(to, artCanvas(to.art).w, this.propFoot(to));
    this.pushPorter(a, b, now, true);
  }

  /**
   * The yard crew, walking. Drawn like the field hands — same sprite, same
   * one-pixel bob — because they are the field hands: this is the same farm at
   * the other end of the same day.
   */
  private drawPorters(now: number): void {
    const ctx = this.ctx;
    const sprite = artCanvas(this.mark("hand"));
    const sack = artCanvas(SACK);
    this.porters = this.porters.filter((porter) => {
      const age = now - porter.born;
      if (age < 0) return true;
      const total = porter.home ? porter.walk * 2 + PORTER_TIP : porter.walk;
      if (age > total) return false;

      // Out loaded, a beat to heave the sack in, then back empty. A load that's
      // leaving skips both: it walks the one leg and goes out of shot with it.
      let f: number;
      let load = true;
      if (age < porter.walk) {
        f = age / porter.walk;
      } else if (age < porter.walk + PORTER_TIP) {
        f = 1;
        load = age < porter.walk + PORTER_TIP / 2;
      } else {
        f = 1 - (age - porter.walk - PORTER_TIP) / porter.walk;
        load = false;
      }

      const x = Math.round(porter.x0 + (porter.x1 - porter.x0) * f);
      const y = Math.round(porter.y0 + (porter.y1 - porter.y0) * f);
      const walking = age < porter.walk || age > porter.walk + PORTER_TIP;
      // Stooped while they're heaving the sack off the shoulder.
      const bob = walking ? Math.floor(now / 190) % 2 : 2;
      const top = y - sprite.h + bob;
      if (!porter.home) ctx.globalAlpha = Math.max(0, Math.min(1, (SCENE_W + 2 - x) / 12));
      ctx.drawImage(sprite.canvas, x, top);
      if (load) ctx.drawImage(sack.canvas, x - 2, top - sack.h + 3);
      ctx.globalAlpha = 1;
      return true;
    });
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
      ctx.drawImage(spud.canvas, HEAP_X + 4, baseline - spud.h);
      ctx.drawImage(spud.canvas, HEAP_X + 12, baseline - spud.h + 1);
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
    const foot = this.propFoot(prop);
    const top = foot - sprite.h;
    if (!run) {
      this.propShadow(prop.x, foot, sprite.w);
      ctx.drawImage(sprite.canvas, prop.x, top);
      this.propLife(prop, top);
      return;
    }

    const hidden = buildHidden(now - run.born, run.up, sprite.h);
    if (hidden >= sprite.h) return;
    this.propShadow(prop.x, foot, sprite.w);
    ctx.save();
    ctx.beginPath();
    ctx.rect(prop.x, top, sprite.w, sprite.h);
    ctx.clip();
    ctx.drawImage(sprite.canvas, prop.x, top + hidden);
    ctx.restore();
  }

  /**
   * The lights on the things in the yard that are big enough to have them. The
   * yard is where you look when nothing else is happening, and a shed with a
   * lamp over the door is a shed somebody works in.
   */
  private propLife(prop: Prop, top: number): void {
    const ctx = this.ctx;
    const t = this.clock;
    if (prop.art === SHED) {
      // A lamp either side of the door, on a slow flicker.
      const lit = 0.7 + 0.3 * Math.sin(t * 2.1 + prop.x);
      for (const c of [2, 24]) {
        ctx.globalAlpha = lit;
        ctx.fillStyle = "#ffd782";
        ctx.fillRect(prop.x + c, top + 6, 1, 1);
        ctx.globalAlpha = 0.16 * lit;
        ctx.fillRect(prop.x + c - 1, top + 5, 3, 3);
      }
      ctx.globalAlpha = 1;
    } else if (prop.art === ELEVATOR && (t * 0.5 + prop.x * 0.02) % 1 < 0.18) {
      // A beacon on the head house: it's the tallest thing you own.
      ctx.fillStyle = "#ff5b4a";
      ctx.fillRect(prop.x + 9, top + 1, 1, 1);
      ctx.globalAlpha = 0.28;
      ctx.fillRect(prop.x + 8, top, 3, 3);
      ctx.globalAlpha = 1;
    }
  }

  /**
   * A pool of shade under something's feet. Two pixels of it, tucked in at the
   * ends — with a dozen things standing on the same flat brown, this is the
   * only thing telling you which of them are near and which are far.
   */
  private propShadow(x: number, foot: number, w: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = INK;
    ctx.fillRect(x, foot - 1, w, 1);
    ctx.fillRect(x + 2, foot, w - 4, 1);
    ctx.globalAlpha = 1;
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

  // --- The trough ----------------------------------------------------------
  //
  // The field machines' answer to "where does it go". A tractor and a combine
  // are the two things out there big enough to be carrying a load, and the
  // load has to end up somewhere you can see: a trough across the headland,
  // filled by auger from whatever's working the rows above it, emptying down a
  // spout through the fence into the yard.

  /**
   * Where a hand goes after it's tipped its load in: back up the headland,
   * towards the work.
   *
   * Not on down into the yard. The yard is where the potatoes are kept, not
   * where the people are, and a crew that carries every load down past the
   * trough and then wanders about among the crates spends most of the day
   * walking away from the field it's supposed to be picking.
   */
  private turnAround(hand: Hand, yardY: number): { x: number; y: number } {
    return {
      x: clamp(hand.x + (Math.random() - 0.5) * 22, 4, SCENE_W - 10),
      y: clamp(hand.y - 6 - Math.random() * 12, this.fieldTop() + 14, yardY - 2),
    };
  }

  /** The nearest sack nobody's already walking to. */
  private claimSack(hand: Hand): number {
    let best = -1;
    let bestD = Infinity;
    for (const sack of this.sacks) {
      if (this.hands.some((h) => h.sack === sack.id)) continue;
      const d = Math.hypot(sack.x - hand.x, sack.y - hand.y);
      if (d < bestD) {
        bestD = d;
        best = sack.id;
      }
    }
    return best;
  }

  /** The sacks waiting at the headland, dropping the last inch as they land. */
  private drawSacks(now: number): void {
    const sprite = artCanvas(SACK);
    for (const sack of this.sacks) {
      const age = now - sack.born;
      const drop = age < 220 ? Math.round(4 * (1 - age / 220)) : 0;
      this.ctx.drawImage(sprite.canvas, Math.round(sack.x), Math.round(sack.y) - sprite.h - drop);
    }
  }

  /** Drain a full trough into the yard, and draw the thing either way. */
  private stepTrough(now: number): void {
    const box = this.troughBox;
    if (!box) return;
    this.drawTrough(box);

    this.troughClock += this.dt;
    const interval = TROUGH_DRAIN * (1 - 0.75 * (this.troughFill / TROUGH_CAP));
    while (this.troughClock >= interval) {
      this.troughClock -= interval;
      if (this.troughFill <= 0) {
        this.troughClock = 0;
        break;
      }
      this.troughFill--;
      if (this.hauls.length >= MAX_HAULS) continue;
      // Down the middle of the slide, and off the end into the pile.
      const run = this.spout(box);
      const mid = (FarmScene.SPOUT_W - 7) / 2;
      this.hauls.push({
        x0: run.x0 + mid,
        y0: run.y0 - 4,
        x1: run.x1 + mid,
        y1: run.y1 + 3,
        born: now,
        dur: 620,
        slide: true,
      });
    }
  }

  private drawTrough(box: { x: number; w: number; y: number }): void {
    const ctx = this.ctx;
    const { x, w, y } = box;
    const top = y - 9;

    // Open-topped, so what's in it is the readable part. Walls and floor in
    // the outline ink, planking inside, and two stubby legs under it.
    ctx.fillStyle = "#5e3e29";
    ctx.fillRect(x + 4, y - 2, 3, 3);
    ctx.fillRect(x + w - 7, y - 2, 3, 3);
    ctx.fillStyle = INK;
    ctx.fillRect(x, top, 2, 9);
    ctx.fillRect(x + w - 2, top, 2, 9);
    ctx.fillRect(x, y - 2, w, 2);
    // Lit planking with dark staves. A trough in the yard's own dark wood
    // disappeared into the fence behind it and read as a bench.
    ctx.fillStyle = "#a97a52";
    ctx.fillRect(x + 2, top, w - 4, 7);
    ctx.fillStyle = "#7a5237";
    ctx.fillRect(x + 2, top, w - 4, 1);
    ctx.fillStyle = "#5e3e29";
    for (let sx = x + 8; sx < x + w - 6; sx += 14) ctx.fillRect(sx, top, 1, 7);

    const depth = Math.min(6, Math.ceil((this.troughFill / TROUGH_CAP) * 6));
    if (depth > 0) {
      ctx.fillStyle = "#c98b4b";
      ctx.fillRect(x + 2, y - 2 - depth, w - 4, depth);
      ctx.fillStyle = "#e2b077";
      for (let sx = x + 2; sx < x + w - 3; sx += 3) ctx.fillRect(sx, y - 2 - depth, 2, 1);
    }

  }

  /**
   * Where the trough's outfall runs: a gate in the floor a little along from
   * the low end, then down over the fence to a mouth that hangs above the
   * mound. Both ends in one place, because the potatoes on it have to agree
   * with the woodwork under them.
   */
  private spout(box: { x: number; w: number; y: number }): {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } {
    const x0 = box.x + 22;
    const y0 = box.y - 2;
    // Ends over the crown of the mound and stops just above a full one, so
    // it's tipping onto the pile rather than buried in it or pointing at the
    // dirt beside it. It leans back the other way from the pipeline's outfall,
    // so the yard's two arrivals aren't the same line drawn twice.
    return {
      x0,
      y0,
      x1: HEAP_X + 20,
      y1: Math.max(y0 + 16, this.station(0) - 29),
    };
  }

  /** How wide the boards are, and what a potato rides down the middle of. */
  private static SPOUT_W = 9;

  /**
   * The slide, drawn as a channel: a side board down each edge with the run
   * between them, lit on the high side and shaded on the low one, and an open
   * mouth over the pile.
   *
   * It used to be a line of two-pixel dots from the trough to the mound, which
   * is a perfectly good way to describe a path and a terrible way to draw a
   * chute — the crop came out of the trough and went down a piece of string.
   * The first go at fixing it put battens across the run and made a ladder, so
   * everything here reads *along* the fall: rails, a highlight and a floor.
   */
  private drawSpout(box: { x: number; w: number; y: number }): void {
    const ctx = this.ctx;
    const { x0, y0, x1, y1 } = this.spout(box);
    const W = FarmScene.SPOUT_W;
    const fall = y1 - y0;

    // The throat: a collar under the trough floor, so the slide is fed by the
    // trough rather than just touching it.
    ctx.fillStyle = "#5e3e29";
    ctx.fillRect(x0, y0 - 3, W, 3);

    for (let i = 0; i <= fall; i++) {
      const sx = Math.round(x0 + ((x1 - x0) * i) / fall);
      const sy = y0 + i;
      // Low side: a side board standing proud of the floor, so the channel has
      // a visible near edge holding the crop in.
      ctx.fillStyle = INK;
      ctx.fillRect(sx, sy, 1, 1);
      ctx.fillStyle = "#5e3e29";
      ctx.fillRect(sx + 1, sy, 1, 1);
      // The floor, in trough wood, and the far rail catching the light.
      ctx.fillStyle = "#8a5c3c";
      ctx.fillRect(sx + 2, sy, W - 4, 1);
      ctx.fillStyle = "#a97a52";
      ctx.fillRect(sx + W - 2, sy, 1, 1);
      ctx.fillStyle = "#c39466";
      ctx.fillRect(sx + W - 1, sy, 1, 1);
    }

    // The mouth: open, with the floor's shadow under the lip. This is the last
    // thing the potato is inside before it's on the pile.
    ctx.fillStyle = "#c39466";
    ctx.fillRect(x1, y1, W, 1);
    ctx.fillStyle = INK;
    ctx.fillRect(x1 - 1, y1 + 1, W + 2, 2);
  }

  /** Potatoes on an auger or a spout: straight line, constant speed, no arc. */
  private drawHauls(now: number): void {
    const ctx = this.ctx;
    const sprite = artCanvas(POTATO_SPRITE);
    this.hauls = this.hauls.filter((h) => {
      const p = (now - h.born) / h.dur;
      if (p > 1) {
        if (h.slide) this.puff(h.x1 + 3, h.y1 + 4, "dust", (Math.random() - 0.5) * 20);
        return false;
      }
      if (p < 0) return true;
      // A slide accelerates, and the last stretch is the potato leaving the
      // mouth — so it rides the boards, then drops the last few pixels.
      const f = h.slide ? p * p * 0.7 + p * 0.3 : p;
      ctx.drawImage(
        sprite.canvas,
        Math.round(h.x0 + (h.x1 - h.x0) * f),
        Math.round(h.y0 + (h.y1 - h.y0) * f),
      );
      return true;
    });
  }

  /** What your own digging turns up: out of the soil, held a beat, gone. */
  private drawDug(now: number): void {
    const ctx = this.ctx;
    const sprite = artCanvas(POTATO_SPRITE);
    this.dug = this.dug.filter((d) => {
      const age = now - d.born;
      if (age > DUG_MS) return false;
      const p = age / DUG_MS;
      const lift = Math.round(5 * Math.min(1, p * 6));
      ctx.globalAlpha = p > 0.6 ? Math.max(0, 1 - (p - 0.6) / 0.4) : 1;
      ctx.drawImage(sprite.canvas, d.x, d.y - sprite.h - lift);
      ctx.globalAlpha = 1;
      return true;
    });
  }
}
