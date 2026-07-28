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
  COMBINE,
  CRATE,
  FARMHAND,
  FENCE,
  FLOWERS,
  LAB,
  PLANT,
  PLANT_TIRED,
  POTATO_SPRITE,
  REACTOR,
  REFINERY,
  SACK,
  SATELLITE,
  SEEDER,
  SILO,
  SINGULARITY,
  SPRINKLER,
  TOWER,
  TRACTOR,
  TREE,
  TUFT,
} from "./art.js";
import { artCanvas, artTinted, type Art } from "./pixel.js";

export const SCENE_W = 176;

const YARD_SHARE = 0.19; // the hoard yard, front band
const FIELD_SHARE = 0.5; // the working field
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
 * A pile of potatoes stops reading as a pile somewhere around a thousand, so
 * the yard changes unit as it fills: loose potatoes, then sacks, then crates,
 * then silos. `decades` is how many orders of magnitude that unit is asked to
 * cover before the next one takes over, which is what keeps the pile visibly
 * growing early instead of saturating in the first minute.
 */
interface HoardTier {
  art: Art;
  min: number;
  decades: number;
  max: number;
  gap: number;
}

const HOARD_TIERS: HoardTier[] = [
  { art: SILO, min: 1e9, decades: 6, max: 5, gap: 3 },
  { art: CRATE, min: 1e5, decades: 4, max: 6, gap: 2 },
  { art: SACK, min: 1e2, decades: 3, max: 6, gap: 2 },
  { art: POTATO_SPRITE, min: 1, decades: 2, max: 10, gap: 1 },
];

function hoardCount(tier: HoardTier, amount: number): number {
  const decades = Math.log10(Math.max(1, amount) / tier.min);
  const n = 1 + Math.floor((decades / tier.decades) * (tier.max - 1));
  return Math.max(1, Math.min(tier.max, n));
}

// ---------------------------------------------------------------------------
// Producer placement
// ---------------------------------------------------------------------------

/** A producer flying, driving or standing somewhere specific. */
type Band = "sky" | "back" | "field" | "walk";

interface Placement {
  art: Art;
  band: Band;
  /** How many of the thing ever appear, however many you own. */
  cap: number;
  /** Drives across the field rather than standing in it. */
  speed?: number;
}

const PLACEMENT: Record<solo.SoloProducerId, Placement> = {
  plot: { art: PLANT, band: "field", cap: 30 },
  hand: { art: FARMHAND, band: "walk", cap: 6 },
  irrigation: { art: SPRINKLER, band: "field", cap: 4 },
  tractor: { art: TRACTOR, band: "field", cap: 3, speed: 11 },
  harvester: { art: COMBINE, band: "field", cap: 2, speed: 8 },
  lab: { art: LAB, band: "back", cap: 3 },
  refinery: { art: REFINERY, band: "back", cap: 2 },
  tower: { art: TOWER, band: "back", cap: 4 },
  seeder: { art: SEEDER, band: "sky", cap: 3, speed: 5 },
  reactor: { art: REACTOR, band: "back", cap: 2 },
  orbital: { art: SATELLITE, band: "sky", cap: 2, speed: 14 },
  singularity: { art: SINGULARITY, band: "sky", cap: 2 },
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
function shownCount(owned: number, cap: number): number {
  if (owned <= 0) return 0;
  if (owned <= 4) return Math.min(owned, cap);
  return Math.min(cap, 4 + Math.floor(Math.log2(owned / 4) * 2.4));
}

// ---------------------------------------------------------------------------

interface Flying {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
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

  /** A dig: a potato pops out of the field and lands on the pile. */
  dig(): void {
    if (this.flying.length > 24) return;
    const rng = Math.random;
    this.flying.push({
      x: 30 + rng() * (SCENE_W - 70),
      y: this.fieldTop() + 20 + rng() * 30,
      vx: 26 + rng() * 22,
      vy: -46 - rng() * 26,
      born: performance.now(),
    });
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
    return this.sh - Math.max(28, Math.round(this.sh * YARD_SHARE));
  }

  private fieldTop(): number {
    return Math.max(MIN_SKY, this.yardTop() - Math.max(40, Math.round(this.sh * FIELD_SHARE)));
  }

  // --- Drawing -------------------------------------------------------------

  private draw(now: number): void {
    const ctx = this.ctx;
    const t = (now - this.t0) / 1000;
    const phase = phaseNow();
    const horizon = this.fieldTop();
    const yardY = this.yardTop();

    this.drawSky(phase, t, horizon);
    this.drawHills(phase, horizon);
    this.drawGround(horizon, yardY);
    this.drawBack(t, horizon, phase);
    this.drawField(t, horizon, yardY);
    this.drawFence(yardY);
    this.drawHoard(yardY);
    this.drawFlying(now);

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
    const queue: { art: Art; dead: boolean }[] = [];
    for (const id of ORDER) {
      const place = PLACEMENT[id];
      if (place.band !== "back") continue;
      const n = shownCount(this.view.working[id] ?? 0, place.cap);
      const brokenN = shownCount(this.view.broken[id] ?? 0, place.cap);
      for (let i = 0; i < n; i++) queue.push({ art: place.art, dead: false });
      for (let i = 0; i < brokenN; i++) queue.push({ art: place.art, dead: true });
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
    const plots = shownCount(this.view.working.plot ?? 0, PLACEMENT.plot.cap);
    const plant = artCanvas(PLANT);
    const wilted = artCanvas(PLANT_TIRED);
    const wiltShare = 1 - this.view.soil;
    const perRow = Math.max(4, Math.floor((SCENE_W - 12) / 15));
    for (let i = 0; i < plots; i++) {
      const row = i % 4;
      const col = Math.floor(i / 4);
      const x = 6 + (col % perRow) * 15 + (row % 2) * 7 + Math.floor(rng() * 3);
      const y = lane(0.04 + row * 0.2) + Math.floor(rng() * 3);
      if (x + plant.w > SCENE_W - 4) continue;
      const sprite = rng() < wiltShare ? wilted : plant;
      // A 1px sway on a slow sine, offset per plant — enough that the field
      // isn't a still photograph, cheap enough to run at 60fps.
      const sway = Math.sin(t * 1.3 + i) > 0.6 ? 1 : 0;
      ctx.drawImage(sprite.canvas, x + sway, y);
    }

    // Standing kit: sprinklers, planted in the rows.
    const sprinklers = shownCount(this.view.working.irrigation ?? 0, PLACEMENT.irrigation.cap);
    const sprinkler = artCanvas(SPRINKLER);
    for (let i = 0; i < sprinklers; i++) {
      const x = 14 + i * 42;
      if (x + sprinkler.w > SCENE_W - 6) break;
      ctx.drawImage(sprinkler.canvas, x, lane(0.2) - sprinkler.h);
    }

    // Machines drive; that's the difference between owning one and it working.
    for (const [id, at] of [
      ["tractor", 0.44],
      ["harvester", 0.66],
    ] as const) {
      const place = PLACEMENT[id];
      const n = shownCount(this.view.working[id] ?? 0, place.cap);
      const sprite = artCanvas(place.art);
      const span = SCENE_W + sprite.w;
      for (let i = 0; i < n; i++) {
        const x =
          Math.floor((((t * place.speed! + (i * span) / n) % span) + span) % span) - sprite.w;
        ctx.drawImage(sprite.canvas, x, lane(at) - sprite.h);
      }
    }

    // Farmhands wander between the rows.
    const hands = shownCount(this.view.working.hand ?? 0, PLACEMENT.hand.cap);
    const hand = artCanvas(FARMHAND);
    for (let i = 0; i < hands; i++) {
      const home = 16 + i * 27;
      const x = Math.round(home + Math.sin(t * 0.5 + i * 1.7) * 12);
      const bob = Math.floor(t * 3 + i) % 2;
      ctx.drawImage(hand.canvas, x, lane(0.84) - hand.h + bob);
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
        const dead = artTinted(place.art, "#6b6b74", 0.62);
        if (deadX + dead.w > SCENE_W - 6) break;
        ctx.drawImage(dead.canvas, deadX, lane(0.99) - dead.h);
        deadX += dead.w + 3;
      }
    }

    // The sky tiers, above everything on the ground.
    for (const id of ["seeder", "orbital", "singularity"] as const) {
      const place = PLACEMENT[id];
      const n = shownCount(this.view.working[id] ?? 0, place.cap);
      const sprite = artCanvas(place.art);
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

  private drawFence(yardY: number): void {
    const ctx = this.ctx;
    const fence = artCanvas(FENCE);
    for (let x = 0; x < SCENE_W; x += fence.w) {
      ctx.drawImage(fence.canvas, x, yardY - fence.h + 1);
    }
  }

  /**
   * The pile. Right-aligned and built from the biggest denomination the hoard
   * has earned, with a scatter of the next one down in front so the yard never
   * looks like a single lonely silo.
   */
  private drawHoard(yardY: number): void {
    const ctx = this.ctx;
    const amount = this.view.hoard;
    const baseline = this.sh - 4;

    if (amount < 1) {
      // Empty yard, but not an empty frame — a few stray potatoes in the dirt.
      const spud = artCanvas(POTATO_SPRITE);
      ctx.drawImage(spud.canvas, SCENE_W - 22, baseline - spud.h);
      ctx.drawImage(spud.canvas, SCENE_W - 14, baseline - spud.h + 1);
      return;
    }

    const tierIndex = Math.max(
      0,
      HOARD_TIERS.findIndex((t) => amount >= t.min),
    );
    const tier = HOARD_TIERS[tierIndex] ?? HOARD_TIERS[HOARD_TIERS.length - 1]!;
    const n = hoardCount(tier, amount);

    if (tier.art === POTATO_SPRITE) {
      this.drawPile(POTATO_SPRITE, n, SCENE_W - 8, baseline);
    } else {
      const sprite = artCanvas(tier.art);
      // Silos stand in a row; sacks and crates get stacked two deep, because a
      // single line of them stops reading as "a lot" long before the row runs
      // out of yard.
      const bottom = tier.art === SILO ? n : Math.ceil(n * 0.6);
      const step = sprite.w + tier.gap;
      let x = SCENE_W - 4 - sprite.w;
      for (let i = 0; i < bottom && x >= 4; i++, x -= step) {
        ctx.drawImage(sprite.canvas, x, baseline - sprite.h);
      }
      // The upper course sits in the valleys of the lower one.
      let upX = SCENE_W - 4 - sprite.w - Math.floor(step / 2);
      for (let i = bottom; i < n && upX >= 4; i++, upX -= step) {
        ctx.drawImage(sprite.canvas, upX, baseline - sprite.h * 2 + 1);
      }
      // Garnish from one rung down, spilled in front of the stack.
      const under = HOARD_TIERS[tierIndex + 1];
      if (under) this.drawPile(under.art, 4, Math.max(20, x + step + 6), baseline);
    }
  }

  /** A rough triangular heap, laid right-to-left from `rightX`. */
  private drawPile(art: Art, n: number, rightX: number, baseline: number): void {
    const ctx = this.ctx;
    const sprite = artCanvas(art);
    let placed = 0;
    let row = 0;
    while (placed < n) {
      const inRow = Math.max(1, Math.ceil(Math.sqrt(n)) - row);
      for (let i = 0; i < inRow && placed < n; i++, placed++) {
        const x = rightX - sprite.w - i * (sprite.w - 1) - row * 2;
        const y = baseline - sprite.h - row * (sprite.h - 1);
        if (x < 2) return;
        ctx.drawImage(sprite.canvas, x, y);
      }
      row++;
      if (row > 4) return;
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
