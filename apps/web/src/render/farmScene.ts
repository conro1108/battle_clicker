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
  CLOUD,
  CRATE,
  FENCE,
  cropStages,
  FLOWERS,
  POTATO_SPRITE,
  PRODUCER_MARKS,
  SACK,
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
// The hoard's denominations
// ---------------------------------------------------------------------------

/**
 * The yard reads the hoard the way you'd count out money: three denominations
 * side by side, each holding 0-9 of itself, each worth ten of the one to its
 * right. Loose potatoes on the right, then sacks, then crates, then silos.
 *
 * That's the whole reason for the rework. The old yard drew one denomination
 * bunched into the bottom-right corner, so a hoard that had grown tenfold
 * looked about the same as one that hadn't. Digits move: every tenth potato
 * gets *bundled* into a sack in front of you, and every potato you spend comes
 * back out of one.
 *
 * The ladder only has four rungs, so past a point the yard stops changing what
 * it's made of and starts changing what a sack is worth (`exp`). The numbers in
 * the HUD are there for anyone who wants the exact figure.
 */
const HOARD_LADDER: Art[] = [POTATO_SPRITE, SACK, CRATE, SILO];

interface HoardLayout {
  /** Potatoes per unit of the smallest drawn denomination: 10^exp. */
  exp: number;
  /** Ladder index of the smallest drawn denomination. */
  base: number;
  /** 0-9 per denomination, smallest first. */
  digits: [number, number, number];
}

function hoardLayout(amount: number): HoardLayout {
  const a = Math.max(0, amount);
  // Three digits of mantissa, so the yard always shows the top three orders of
  // magnitude and the small cluster still ticks over at a rate you can watch.
  const exp = a < 1000 ? 0 : Math.floor(Math.log10(a)) - 2;
  const m = Math.floor(a / 10 ** exp);
  // Two configurations only: potato/sack/crate up to 10k, sack/crate/silo above.
  const base = Math.min(HOARD_LADDER.length - 3, Math.floor(exp / 2));
  return { exp, base, digits: [m % 10, Math.floor(m / 10) % 10, Math.floor(m / 100) % 10] };
}

function sameLayout(a: HoardLayout, b: HoardLayout): boolean {
  return (
    a.exp === b.exp &&
    a.base === b.base &&
    a.digits[0] === b.digits[0] &&
    a.digits[1] === b.digits[1] &&
    a.digits[2] === b.digits[2]
  );
}

/** Where each denomination stands, as a fraction of the buffer's width. */
const HOARD_BANDS: [number, number][] = [
  [0.75, 0.98], // smallest, right
  [0.45, 0.75],
  [0.01, 0.45], // largest, left — the widest, because its sprites are the widest
];

/**
 * One potato leaving the ones column and being carried into a sack, or the
 * reverse when you spend. Short-lived, purely cosmetic, and the only thing on
 * this canvas that interpolates a position — it still lands on whole pixels.
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
 * Where the 0-9 of one denomination stand inside their band. One course while
 * there are few, two once the row would have to overlap itself to fit — and
 * only if the yard is actually deep enough to stack that high, which on a short
 * screen it isn't.
 */
function hoardSlots(
  n: number,
  sprite: { w: number; h: number },
  x0: number,
  x1: number,
  baseline: number,
  depth: number,
): { x: number; y: number }[] {
  const slots: { x: number; y: number }[] = [];
  if (n <= 0) return slots;
  const width = x1 - x0;
  const twoCourse = n > 4 && sprite.h * 2 - 3 <= depth;
  const bottomN = twoCourse ? Math.ceil(n * 0.62) : n;
  const courses: [number, number][] = twoCourse
    ? [
        [bottomN, 0],
        [n - bottomN, 1],
      ]
    : [[n, 0]];

  for (const [count, course] of courses) {
    if (count <= 0) continue;
    const step =
      count > 1 ? Math.max(2, Math.min(sprite.w + 1, Math.floor((width - sprite.w) / (count - 1)))) : 0;
    const span = sprite.w + step * (count - 1);
    const left = x0 + Math.max(0, Math.floor((width - span) / 2));
    const y = baseline - sprite.h - course * Math.max(3, sprite.h - 3);
    for (let i = 0; i < count; i++) {
      // Loose potatoes sit unevenly; anything crated does not.
      const jitter = sprite.h <= 6 ? i % 2 : 0;
      slots.push({ x: left + i * step, y: y - jitter });
    }
  }
  return slots;
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
  plot: { band: "field", cap: 40, spread: 5.5 },
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

/** A bed, as drawn this frame. Ground point, not top-left. */
interface Bed {
  x: number;
  y: number;
  /** Wilted beds are skipped: nothing there is worth walking out for. */
  dry: boolean;
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
  /** The beds as laid out this frame. Deterministic, so an index is a place. */
  private beds: Bed[] = [];
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
  private shownLayout = hoardLayout(0);
  private bundles: Bundle[] = [];
  private lastBundleAt = 0;

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

  private puff(x: number, y: number, kind: "dust" | "steam" | "water"): void {
    if (this.puffs.length >= MAX_PUFFS) return;
    const spec = {
      dust: { color: "#b79a72", vx: -6, vy: -5, dur: 620, size: 2 },
      steam: { color: "#e8ecf0", vx: 3, vy: -13, dur: 900, size: 2 },
      water: { color: "#8ec9e6", vx: 0, vy: 4, dur: 460, size: 1 },
    }[kind];
    this.puffs.push({
      x,
      y,
      vx: spec.vx + (Math.random() - 0.5) * 8,
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
    this.drawField(t, horizon, yardY);
    this.drawPuffs(now, dt);
    this.drawFence(yardY);
    this.drawHoard();
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
    for (const item of queue) {
      const sprite = item.dead ? artTinted(item.art, "#6b6b74", 0.6) : artCanvas(item.art);
      if (x + sprite.w > right) break;
      ctx.drawImage(sprite.canvas, x, baseline - sprite.h);
      if (!item.dead) {
        // The stack runs, which is how you tell it from a dead one at a glance
        // without reading the colour.
        if (this.chance(0.45)) this.puff(x + 2, baseline - sprite.h - 1, "steam");
        // And every so often — rarely — something it made is walked down to the
        // yard. A trickle, not a conveyor: the back fence should read as a
        // place that's busy, not as a number going up.
        if (this.chance(0.05)) {
          this.launch(x + Math.floor(sprite.w / 2), baseline - 4, 14 + Math.random() * (SCENE_W - 28), 30);
        }
      }
      x += sprite.w + 2;
    }
  }

  private drawField(t: number, horizon: number, yardY: number): void {
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

    // Crops next — everything else works on top of them.
    //
    // Every bed runs its own slow clock: seedling, coming up, grown, ready to
    // lift. Left ready too long and the farm gets to it without you, which is
    // what keeps a field with nobody working it from freezing solid.
    const plots = shownCount(this.view.working.plot ?? 0, PLACEMENT.plot.cap, PLACEMENT.plot.spread);
    const stages = cropStages(this.mark("plot"));
    const plant = artCanvas(this.mark("plot"));
    const wiltShare = 1 - this.view.soil;
    // Laid out as an actual field: rows of beds at a fixed spacing, each row
    // centred, filling in row by row as you buy more land. The old grid ran
    // four deep before it started a second column, so a farm with seven beds
    // put them all in the left-hand corner and left you looking at grass.
    const bedRows = Math.min(4, Math.max(1, Math.ceil(plots / 8)));
    const perBedRow = Math.ceil(plots / bedRows);
    const span = SCENE_W - 14 - plant.w;
    const gap =
      perBedRow > 1
        ? Math.max(plant.w + 2, Math.min(plant.w + 9, Math.floor(span / (perBedRow - 1))))
        : 0;
    const runLeft = 7 + Math.round((span - gap * (perBedRow - 1)) / 2);
    this.beds.length = 0;
    for (let i = 0; i < plots; i++) {
      const row = Math.floor(i / perBedRow);
      const col = i % perBedRow;
      const x = runLeft + col * gap + Math.floor(rng() * 3) - 1;
      const y = lane(0.06 + row * 0.2) + Math.floor(rng() * 3);
      const dry = rng() < wiltShare;
      if (x + plant.w > SCENE_W - 4) continue;

      // Beds are bottom-aligned to where a full-grown plant used to stand, so
      // the shorter stages grow up out of the soil instead of down from the air.
      const ground = y + plant.h;
      const index = this.beds.length;
      this.beds.push({ x, y: ground, dry });

      // Every bed is a worked patch of soil whatever's standing on it. Without
      // this the field goes back to being lawn every time a crop is lifted —
      // the land you bought should be visible as land, not only as plants.
      ctx.fillStyle = dry ? "#8a7a3c" : DIRT;
      ctx.fillRect(x - 1, ground - 2, plant.w + 2, 3);
      ctx.fillStyle = DIRT_DARK;
      ctx.fillRect(x - 1, ground + 1, plant.w + 2, 1);
      // Staggered on first sight, so a farm doesn't come up as one green wave.
      // `Math.random` rather than the seeded stream: consuming that here would
      // shift every layout decision after it on the frame this bed first drew.
      this.planted[index] ??= t - Math.random() * GROW_SECONDS;

      const age = t - this.planted[index]!;
      const stage = age >= GROW_SECONDS ? 3 : age >= GROW_SECONDS * 0.6 ? 2 : age >= GROW_SECONDS * 0.25 ? 1 : 0;
      // Wilt keeps the mark's silhouette and loses its colour, so an upgraded
      // bed still reads as an upgraded bed while it's struggling.
      const art = stages[stage]!;
      const sprite = artCanvas(dry ? withered(art) : art);
      // A 1px sway on a slow sine, offset per plant — enough that the field
      // isn't a still photograph, cheap enough to run at 60fps.
      const sway = Math.sin(t * 1.3 + i) > 0.6 ? 1 : 0;
      ctx.drawImage(sprite.canvas, x + sway, ground - sprite.h);

      if (!dry && age > GROW_SECONDS + RIPE_SECONDS) this.lift(index, t);
    }

    // Standing kit: sprinklers, planted in the rows.
    const sprinklers = shownCount(this.view.working.irrigation ?? 0, PLACEMENT.irrigation.cap);
    const sprinkler = artCanvas(this.mark("irrigation"));
    for (let i = 0; i < sprinklers; i++) {
      const x = 14 + i * 42;
      if (x + sprinkler.w > SCENE_W - 6) break;
      const y = lane(0.2) - sprinkler.h;
      ctx.drawImage(sprinkler.canvas, x, y);
      // A rig that isn't throwing water is a pole. Droplets sweep with a slow
      // sine, so the arc reads as one head turning rather than a static spray.
      if (this.chance(3.5)) {
        const swing = Math.sin(t * 0.9 + i) * 7;
        this.puff(x + 6 + swing, y + 2, "water");
      }
    }

    // Machines drive; that's the difference between owning one and it working.
    for (const [id, at] of [
      ["tractor", 0.44],
      ["harvester", 0.66],
    ] as const) {
      const place = PLACEMENT[id];
      const n = shownCount(this.view.working[id] ?? 0, place.cap);
      const sprite = artCanvas(this.mark(id));
      const span = SCENE_W + sprite.w;
      for (let i = 0; i < n; i++) {
        const x =
          Math.floor((((t * place.speed! + (i * span) / n) % span) + span) % span) - sprite.w;
        const ground = lane(at);
        ctx.drawImage(sprite.canvas, x, ground - sprite.h);
        // Dust off the back wheels. A machine that leaves nothing behind it is
        // a machine parked in a field.
        if (this.chance(2.5)) this.puff(x + 1, ground - 2, "dust");
        // And it works what it drives over: any ripe bed under the header comes
        // up as it passes. That's the difference between a tractor crossing a
        // field and a tractor farming one.
        for (let b = 0; b < this.beds.length; b++) {
          const bed = this.beds[b]!;
          if (bed.dry || Math.abs(bed.y - ground) > 10) continue;
          if (bed.x < x || bed.x > x + sprite.w) continue;
          if (this.ripeness(b, t) >= 1) this.lift(b, t);
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

    // The sky tiers, above everything on the ground.
    for (const id of ["seeder", "orbital", "singularity"] as const) {
      const place = PLACEMENT[id];
      const n = shownCount(this.view.working[id] ?? 0, place.cap);
      const sprite = artCanvas(this.mark(id));
      for (let i = 0; i < n; i++) {
        if (place.speed) {
          const span = SCENE_W + sprite.w;
          const x =
            Math.floor((((t * place.speed + i * 80) % span) + span) % span) - sprite.w;
          ctx.drawImage(sprite.canvas, x, 6 + i * 14);
        } else {
          // The singularity doesn't travel. It hangs there and breathes.
          const y = 10 + i * 20 + (Math.sin(t * 0.9 + i) > 0 ? 1 : 0);
          ctx.drawImage(sprite.canvas, 20 + i * 44, y);
        }
      }
    }
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
      this.shownLayout = hoardLayout(target);
      return;
    }

    const k = 1 - Math.exp(-dt * 3.2);
    const gap = target - this.shown;
    this.shown += gap * k;
    // Snap once it's close, so the digits settle instead of creeping forever.
    if (Math.abs(gap) < Math.max(0.5, target * 1e-4)) this.shown = target;

    const next = hoardLayout(this.shown);
    if (!sameLayout(next, this.shownLayout)) {
      this.fireBundles(this.shownLayout, next, now);
      this.shownLayout = next;
    }

    const cutoff = now - 900;
    if (this.bundles.length > 0) this.bundles = this.bundles.filter((b) => b.born + b.dur > cutoff);
  }

  /**
   * What changed between two readings of the yard, staged as sprites in motion.
   * A tens digit going up means ten of the smaller unit just got bundled; going
   * down means one got broken open to pay for something.
   */
  private fireBundles(from: HoardLayout, to: HoardLayout, now: number): void {
    if (now - this.lastBundleAt < 160 || this.bundles.length > 40) return;
    this.lastBundleAt = now;

    const rescaled = from.exp !== to.exp || from.base !== to.base;
    const baseline = this.sh - 4;
    const anchor = (i: number, layout: HoardLayout) => {
      const art = HOARD_LADDER[layout.base + i] ?? HOARD_LADDER[HOARD_LADDER.length - 1]!;
      const sprite = artCanvas(art);
      const [a, b] = HOARD_BANDS[i]!;
      return {
        art,
        x: Math.round(((a + b) / 2) * SCENE_W - sprite.w / 2),
        y: baseline - sprite.h,
      };
    };

    // Changing scale is the loudest thing the yard ever does — everything you
    // were looking at just became worth ten times less, so send a carry all the
    // way up the ladder.
    const pairs: [number, number][] = rescaled
      ? [
          [0, 1],
          [1, 2],
        ]
      : [];
    if (!rescaled) {
      for (let i = 0; i < 2; i++) {
        if (to.digits[i + 1]! > from.digits[i + 1]!) pairs.push([i, i + 1]);
        else if (to.digits[i + 1]! < from.digits[i + 1]!) pairs.push([i + 1, i]);
      }
    }

    for (const [src, dst] of pairs) {
      const a = anchor(src, from);
      const b = anchor(dst, to);
      const count = src < dst ? 4 : 3;
      for (let i = 0; i < count; i++) {
        this.bundles.push({
          art: a.art,
          x0: a.x + (i - 1) * 4,
          y0: a.y - (i % 2) * 3,
          x1: b.x + (i % 3) * 2,
          y1: b.y + 2,
          born: now + i * 45,
          dur: 380,
          poof: false,
        });
      }
    }

    // Spending that doesn't carry still ought to cost you something visible.
    if (pairs.length === 0 && to.digits[0]! < from.digits[0]!) {
      const a = anchor(0, to);
      for (let i = 0; i < 2; i++) {
        this.bundles.push({
          art: a.art,
          x0: a.x + i * 6 - 3,
          y0: a.y,
          x1: a.x + i * 6 - 3,
          y1: a.y - 9,
          born: now + i * 60,
          dur: 320,
          poof: true,
        });
      }
    }
  }

  /**
   * The yard: three columns of denominations, laid out left to right largest
   * first, filling the width instead of huddling in one corner.
   */
  private drawHoard(): void {
    const ctx = this.ctx;
    const baseline = this.sh - 4;
    const layout = this.shownLayout;

    if (this.shown < 1) {
      // Empty yard, but not an empty frame — a couple of strays in the dirt.
      const spud = artCanvas(POTATO_SPRITE);
      ctx.drawImage(spud.canvas, SCENE_W - 22, baseline - spud.h);
      ctx.drawImage(spud.canvas, SCENE_W - 14, baseline - spud.h + 1);
      return;
    }

    // Largest first so the smaller columns overlap it rather than being hidden
    // behind it if a wide sprite runs past its band.
    const depth = this.sh - this.yardTop() - 4;
    for (let i = 2; i >= 0; i--) {
      const art = HOARD_LADDER[layout.base + i] ?? HOARD_LADDER[HOARD_LADDER.length - 1]!;
      const sprite = artCanvas(art);
      const [a, b] = HOARD_BANDS[i]!;
      const x0 = Math.round(a * SCENE_W) + 2;
      const x1 = Math.round(b * SCENE_W) - 2;
      for (const slot of hoardSlots(layout.digits[i]!, sprite, x0, x1, baseline, depth)) {
        ctx.drawImage(sprite.canvas, slot.x, slot.y);
      }
    }
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
