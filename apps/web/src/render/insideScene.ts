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
 * black stripe with nothing in it, because five of the eight rungs stand on the
 * ground. The hollow reads as tall enough from the *ceiling*: give the roof less
 * and the floor more, and the room is the same shape with the space spent on the
 * half that has things in it.
 */
const ROOF_SHARE = 0.19;
const HOLLOW_SHARE = 0.29;
const FLOOR_SHARE = 0.32;
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
function shownCount(owned: number, cap: number, spread = 2.4): number {
  if (owned <= 0) return 0;
  if (owned <= 4) return Math.min(owned, cap);
  return Math.min(cap, 4 + Math.floor(Math.log2(owned / 4) * spread));
}

// ---------------------------------------------------------------------------
// Loose things
// ---------------------------------------------------------------------------

/** Starch dust, drifting. The only ambient motion in a room with no weather. */
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
    const wiped = view.seed !== this.view.seed || view.generation !== this.view.generation;
    this.view = view;
    if (wiped) {
      this.rng = mulberry32(hashSeed(view.seed));
      this.motes = [];
      this.dug = [];
      this.puffs = [];
      this.shown = Math.max(0, view.hoard);
    }
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

  private working(id: InsideId): number {
    const place = PLACEMENT[id];
    return shownCount(this.view.working[id] ?? 0, place.cap, place.spread);
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
    this.drawWall(floor, t);
    this.drawRoof(roof, t);
    this.drawPlain(floor, yard);
    this.drawGloom(roof, yard);

    this.drawGates(floor, t);
    this.drawFurrows(roof, t);
    this.drawVeins(roof, floor, t);
    this.drawSeconds(roof, t);
    this.drawMotes(roof, floor, t);
    this.drawSeams(floor, yard, t);
    this.drawEyes(floor, yard, t);
    this.drawChorus(floor, yard, t);
    this.drawHoard(yard);
    this.drawTaps(yard, t);
    this.drawBroken(yard);
    this.drawDug(now);
    this.drawPuffs(now);
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
   * The far wall. Fibre running down it, and a slow swell — the whole room
   * breathes, because the alternative is a cave and this is supposed to be
   * something's inside.
   */
  private drawWall(floor: number, t: number): void {
    const ctx = this.ctx;
    const breathe = Math.sin(t * 0.4) * 0.5 + 0.5;
    for (let x = 0; x < SCENE_W; x += 3) {
      const h = fract(Math.sin(x * 12.9898) * 43758.5453);
      const top = floor - Math.round(10 + h * 26 + breathe * 3);
      ctx.fillStyle = rgba(mix(FLESH_DEEP, HOLLOW_BOTTOM, 0.35 + h * 0.35), 0.85);
      ctx.fillRect(x, top, 2, floor - top);
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
    const span = SCENE_W - 16;
    for (let i = 0; i < n; i++) {
      const x = Math.round(8 + (span / Math.max(1, n)) * (i + 0.5) - sprite.w / 2);
      const y = floor - sprite.h - 1;
      // Whatever's through there isn't steady.
      const flicker = 0.16 + 0.06 * Math.sin(t * 1.1 + i * 2.1);
      this.glow(x + sprite.w / 2, y + sprite.h / 2, sprite.w * 1.6, "#ffe8b0", flicker);
      this.primeGlow("skin", x, y, sprite.w, sprite.h, t, i);
      ctx.drawImage(sprite.canvas, x, y);
    }
  }

  /**
   * The ceiling. Flesh, lit from nothing in particular, with the fibre of it
   * running across rather than down — it's the same tissue as the wall seen from
   * the other side, and that turn is most of what says you're underneath it.
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
    for (let i = 0; i < n; i++) {
      const h = fract(Math.sin((i + 1) * 33.7) * 4375.85);
      const pace = place.speed! * (0.75 + 0.5 * fract(h * 7.13));
      const dir = i % 2 === 0 ? 1 : -1;
      const raw = (t * pace + h * span) % span;
      const along = dir > 0 ? raw : span - raw;
      const x = Math.floor(((along % span) + span) % span) - sprite.w;
      // Its coulters ride in the flesh, so the sprite is pinned just under the
      // ceiling rather than floating in the band.
      const y = 1 + Math.round(h * Math.max(1, roof * 0.35));
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
    const drop = Math.max(6, (floor - roof) * 0.55);
    for (let i = 0; i < n; i++) {
      const h = fract(Math.sin((i + 1) * 91.3) * 4375.85);
      const x = Math.round(10 + h * (SCENE_W - 24));
      const y = roof + 3 + Math.round(fract(h * 13.7) * drop) + Math.round(Math.sin(t * 0.6 + h * 7));
      // The vessel it hangs off, running up out of the picture.
      ctx.fillStyle = "#5c3b58";
      ctx.fillRect(x + 2, roof - 4, 2, y - roof + 6);
      this.primeGlow("vein", x, y, sprite.w, sprite.h, t, i);
      ctx.drawImage(sprite.canvas, x, y);
      // A bead of sap working its way down the vessel.
      const bead = (t * 0.4 + h) % 1;
      ctx.fillStyle = "#e0a8dc";
      ctx.fillRect(x + 2, y + sprite.h - 2 + Math.round(bead * 8), 2, 1);
    }
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
      const h = fract(Math.sin((i + 1) * 71.9) * 4375.85);
      const x = SCENE_W - 38 - i * 34 + Math.round(Math.sin(t * 0.21 + h * 6) * 2);
      const y = roof + 6 + Math.round(h * 12) + Math.round(Math.sin(t * 0.29 + h * 9) * 2);
      this.glow(x + sprite.w / 2, y + sprite.h / 2, sprite.w * 1.3, "#f0c68c", 0.14 + 0.05 * Math.sin(t * 0.8 + i));
      this.primeGlow("second", x, y, sprite.w, sprite.h, t, i);
      ctx.drawImage(sprite.canvas, x, y);
    }
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
   * The plain: starch underfoot, going grey as the soil does.
   *
   * Soil is the same number it always was and it does the same job — it's what
   * the tuber's own damage is billed against — so the ground reading it is the
   * one habit worth carrying over from the field.
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

    // Seams in the plain, running with the perspective. Deterministic, so the
    // ground under your farm is your farm's ground.
    const rng = mulberry32(hashSeed(this.view.seed) ^ 0x51ed);
    for (let i = 0; i < 18; i++) {
      const y = floor + Math.round(rng() * (this.sh - floor));
      const x = Math.round(rng() * SCENE_W);
      const w = 8 + Math.round(rng() * 30);
      ctx.fillStyle = rgba(STARCH_DARK, 0.2 + rng() * 0.2);
      ctx.fillRect(x, y, w, 1);
    }

    // The wall's shadow across the back of the plain. Without it the two bands
    // meet on a ruled line and the plain reads as a desert with a cliff behind
    // it rather than as the floor of the room the cliff is a wall of.
    const shade = Math.round((this.sh - floor) * 0.14);
    for (let d = 0; d < shade; d++) {
      ctx.fillStyle = rgba(HOLLOW_BOTTOM, 0.5 * (1 - d / shade));
      ctx.fillRect(0, floor + d, SCENE_W, 1);
    }

    // Where the plain stops being the farm and starts being the yard.
    ctx.fillStyle = rgba(INK, 0.25);
    ctx.fillRect(0, yard, SCENE_W, 1);
  }

  /**
   * The Starch Seams, quarried out of the back of the plain. Drawn first of the
   * floor tiers and furthest back, because they're the only rung down here that
   * is a hole in the ground rather than a thing standing on it.
   */
  private drawSeams(floor: number, yard: number, t: number): void {
    const ctx = this.ctx;
    const n = this.working("starch");
    if (n === 0) return;
    const sprite = artCanvas(this.mark("starch"));
    const lane = floor + Math.round((yard - floor) * 0.16);
    for (let i = 0; i < n; i++) {
      const h = fract(Math.sin((i + 1) * 23.1) * 4375.85);
      const x = Math.round(2 + h * (SCENE_W - sprite.w - 4));
      const y = lane + Math.round(fract(h * 51.7) * 6) - sprite.h;
      this.primeGlow("starch", x, y, sprite.w, sprite.h, t, i);
      ctx.drawImage(sprite.canvas, x, y);
      if (this.chance(1.5)) this.puff(x + sprite.w / 2, y + sprite.h, (Math.random() - 0.5) * 12, -4);
    }
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
    const top = floor + Math.round((yard - floor) * 0.3);
    const band = Math.max(4, yard - top - 4);
    for (let i = 0; i < n; i++) {
      const h = fract(Math.sin((i + 1) * 41.7) * 4375.85);
      const h2 = fract(h * 137.7);
      const x = Math.round(4 + h * (SCENE_W - sprite.w - 8));
      const ground = Math.round(top + h2 * band);
      // The sprout leans. Whole pixels, on a long slow cycle, so a field of them
      // sways out of step rather than in time.
      const lean = Math.sin(t * 0.6 + h * 6) > 0.35 ? 1 : 0;
      this.primeGlow("eyes", x, ground - sprite.h, sprite.w, sprite.h, t, i);
      ctx.drawImage(sprite.canvas, x + lean, ground - sprite.h);
    }
  }

  /**
   * The Chorus: the other yous, working a plain nobody assigned them.
   *
   * How many stand there leans on `generation` as well as on how many you own,
   * because that's the mechanic — every farm you handed down is still working —
   * and it's the only thing on either canvas that makes the meta-layer visible.
   */
  private drawChorus(floor: number, yard: number, t: number): void {
    const ctx = this.ctx;
    const owned = this.view.working.chorus ?? 0;
    if (owned <= 0) return;
    const place = PLACEMENT.chorus;
    const n = Math.min(
      place.cap,
      shownCount(owned, place.cap, place.spread) + Math.min(3, this.view.generation - 1),
    );
    const sprite = artCanvas(this.mark("chorus"));
    const top = floor + Math.round((yard - floor) * 0.35);
    const band = Math.max(4, yard - top - 3);
    for (let i = 0; i < n; i++) {
      const h = fract(Math.sin((i + 1) * 57.1) * 4375.85);
      const h2 = fract(h * 137.7);
      // They drift along their line rather than crossing the plain: near enough
      // to still, far enough that you catch it out of the corner of your eye.
      const x = Math.round(6 + h * (SCENE_W - 20) + Math.sin(t * 0.19 + h2 * 6) * 9);
      const ground = Math.round(top + h2 * band);
      const stoop = Math.sin(t * 0.7 + h * 5) > 0.7 ? 2 : 0;
      this.primeGlow("chorus", x, ground - sprite.h + stoop, sprite.w, sprite.h, t, i);
      ctx.globalAlpha = 0.72;
      ctx.drawImage(sprite.canvas, x, ground - sprite.h + stoop);
      ctx.globalAlpha = 1;
    }
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
   */
  private drawBroken(yard: number): void {
    const ctx = this.ctx;
    let x = 6;
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
