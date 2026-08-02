/**
 * The inside of the potato, drawn as a descent.
 *
 * A second scene, not a variant of the first. `farmScene.ts` is a homestead:
 * sky, hills, a field of crop, a fence, a yard. None of that survives the
 * Convergence except the yard, and reskinning a field of potato plants in ochre
 * would have said "the same farm, at sunset" — which is the one thing the fold
 * must not read as.
 *
 * The two scenes share the buffer conventions and nothing else. Same width,
 * same rule: every blit is integer-aligned and unscaled, animation is
 * translation only. At this size a fractional transform resamples the art off
 * the pixel grid and 1px outlines double or vanish.
 *
 * ---
 *
 * ## What went wrong the first time, because it will be tempting again
 *
 * The first inside was a room: a ceiling band being ploughed upside down, a far
 * wall with doors cut in it, a starch plain underfoot, the yard at the front.
 * Five horizontal bands with hard rules between them. It was wrong in five ways
 * and they were all the same way — **it had no depth model.**
 *
 *  1. **Five stripes is a cross-section diagram, not a place.** The outside farm
 *     is sky → hills → field → fence → yard, which is a perspective the eye
 *     already knows, so the bands read as *distance* without being told. Roof /
 *     hollow / wall / floor / yard is a list of surfaces, and the only thing
 *     separating them was a 1px line.
 *  2. **Every colour in the file was the same hue.** Ochre at 30-40° top to
 *     bottom. Outside, blue → green → brown separates the bands before any line
 *     has to; inside, nothing did, which is exactly why it read as strata. On an
 *     empty farm the floor and the yard were the same colour with a rule between
 *     them and you could not tell where the room stopped.
 *  3. **The vessel network was a wiring diagram.** Every tier got its own branch,
 *     routed with right-angle bends, in a pale pink with no shadow and no ground
 *     contact, crossing everything else in the picture. The outside keeps the
 *     same promise — you can watch a potato reach the pile — with *one* machine
 *     on *one* edge.
 *  4. **Nothing was a familiar noun.** Starch Seam, Phloem Vein, Periderm Gate.
 *     When art has to draw an abstraction it draws an abstract shape, which is
 *     how five Periderm Gates ended up as five identical white rectangles in a
 *     row, like paintings hung in a gallery.
 *  5. **Progression was a taxonomy.** Each tier pinned to a band height, so
 *     buying more meant denser overlap at the same scale rather than the place
 *     growing.
 *
 * The founding instinct — "a second scene, not a variant" — was right about the
 * *nouns* and wrong about the *grammar*. This keeps every noun new and takes the
 * grammar back: a spatial model your eye already has, colour doing the depth
 * work, one transport spine, and progression that builds the place out.
 *
 * ## The shaft
 *
 * You are cutting down through a potato, and the picture is the cutaway. Top of
 * the buffer is the lid you came in through; bottom is the sump you have to
 * stand in. Between them are the strata you've opened, in order, **shallow at
 * the top and deep at the bottom** — which is the one arrangement where "further
 * down the shop" and "further down the screen" are the same direction.
 *
 * Four zones of two rungs each (`ZONES`), and a zone only exists once you own
 * something that works it. So a farm one purchase into the inside is a lid, one
 * thin stratum, and a sump; a finished one is four strata deep, each with its own
 * material and its own light. Buying into a new zone breaks the floor open —
 * three more reveals across an endgame that previously had none after the fold.
 *
 * **Colour is the depth model.** Pale gold at the lid, ochre through the cortex,
 * then the picture leaves the potato palette entirely: the vascular ring is
 * magenta-shadowed and the core is nearly black-red. That vertical run is doing
 * the job aerial perspective does outside, and it's the single biggest reason
 * this reads as somewhere rather than as a stack of bands.
 *
 * **The bore is the spine.** One open channel down the left, where the outside
 * farm's elevator runs, widening as you own more. Everything you cut rolls along
 * its own ledge to the lip, tips in, falls the whole height of the picture, and
 * slides into the mound. That's the entire logistics layer: no vessels, no
 * porters, no branch per tier. Gravity is the conveyor, one continuous motion
 * carries the eye from the deepest thing you own to the pile you're spending, and
 * the crop is the only thing crossing the strata — which is what makes the strata
 * legible instead of crowded.
 *
 * The mound stays in the bottom-left corner it occupies outside, because it is
 * the same potatoes and the fold doesn't take your money off you.
 */

import type { solo } from "@battle/sim";

import {
  HOIST_CAGE,
  POTATO_SPRITE,
  PRODUCER_MARKS,
  SHAFT_CREW,
  SHAFT_CREW_UP,
} from "./art.js";
import {
  EMPTY_VIEW,
  SCENE_W,
  clamp,
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
// The ladder, and how deep each rung is
// ---------------------------------------------------------------------------

type InsideId = Extract<
  solo.SoloProducerId,
  "bruise" | "eyes" | "quarry" | "well" | "ring" | "chorus" | "heart" | "second"
>;

/** Ladder order, shallowest first, which is also top-of-screen first. */
export const ORDER: InsideId[] = [
  "bruise",
  "eyes",
  "quarry",
  "well",
  "ring",
  "chorus",
  "heart",
  "second",
];

export interface Zone {
  id: string;
  /** The two rungs that work this stratum, shallower one first. */
  tiers: [InsideId, InsideId];
  /** Top of the band, catching light off the cut above it. */
  lit: string;
  /** The body of the material. */
  flesh: string;
  /** The bottom of the band, in its own shadow. */
  deep: string;
  /** The one colour in the stratum that isn't the material — sprouts, sap, embers. */
  accent: string;
  /**
   * Share of the shaft's height, before normalising over however many zones are
   * open. Deeper zones get slightly more, so the working face you just bought
   * into has room and the ones you've cut past compress — which is what a worked
   * seam does anyway.
   */
  weight: number;
}

/**
 * Four strata, and the colour run that is the whole point.
 *
 * `hollow` and `cortex` are potato colours. `ring` and `core` deliberately are
 * not: the moment the picture stops being ochre is the moment it stops reading
 * as a stack of bands, and it should happen at the depth where the fiction says
 * you've reached something that is more organ than food. Anything that keeps all
 * four zones inside one hue family puts the original bug straight back.
 */
export const ZONES: readonly Zone[] = [
  {
    id: "hollow",
    tiers: ["bruise", "eyes"],
    lit: "#e8cf9a",
    flesh: "#d0b078",
    deep: "#a8814a",
    accent: "#a8f07a",
    weight: 1,
  },
  {
    id: "cortex",
    tiers: ["quarry", "well"],
    lit: "#cfa068",
    flesh: "#b07f4a",
    deep: "#7d5330",
    accent: "#fff4e0",
    weight: 1.15,
  },
  {
    id: "ring",
    tiers: ["ring", "chorus"],
    lit: "#a8636a",
    flesh: "#84454f",
    deep: "#4e2833",
    accent: "#e0a8dc",
    weight: 1.3,
  },
  {
    id: "core",
    tiers: ["heart", "second"],
    // Nearly black, and a long way below the ring's darkest value. Drawn any
    // closer and the bottom two strata merge into one maroon mass — which is the
    // same "everything is one hue" bug the old scene had, just relocated.
    lit: "#4a1f31",
    flesh: "#301324",
    deep: "#180a14",
    accent: "#ffb454",
    weight: 1.5,
  },
];

const ZONE_OF: Record<InsideId, number> = (() => {
  const out = {} as Record<InsideId, number>;
  ZONES.forEach((z, i) => z.tiers.forEach((t) => (out[t] = i)));
  return out;
})();

export function zoneOf(id: InsideId): number {
  return ZONE_OF[id];
}

/**
 * How many strata are open, which is the deepest rung you own plus one.
 *
 * A prefix rather than a set: you cannot own a Hollow Heart without having cut
 * through the cortex to reach it, so a farm that skipped a rung still gets the
 * band it must have passed through. Zero only for a farm that owns nothing
 * inside at all, which is what the first moment after the fold looks like.
 */
export function openZones(working: Partial<Record<string, number>>): number {
  let deepest = -1;
  for (const id of ORDER) {
    if ((working[id] ?? 0) > 0) deepest = Math.max(deepest, ZONE_OF[id]);
  }
  return deepest + 1;
}

/** What a hundred-owned tier throws light in. Same rule the outside farm uses. */
const PRIME_GLOW: Record<InsideId, string> = {
  bruise: "#ffd8e0",
  eyes: "#a8f07a",
  quarry: "#fff4e0",
  well: "#ff9a3c",
  ring: "#e0a8dc",
  chorus: "#fff4c0",
  heart: "#ff7a6a",
  second: "#ffd166",
};

// ---------------------------------------------------------------------------
// The place
// ---------------------------------------------------------------------------

/** The lid: the underside of what closed over you, still the brightest thing. */
const LID_LIT = "#f2e0b4";
const LID_DEEP = "#c9a05c";

/** The sump floor, at the bottom of everything. Dark, so the hoard reads on it. */
const SUMP_DEEP = "#2c1620";
const SUMP_FLOOR = "#7a5648";
const SUMP_SPOIL = "#a88c5c";

/** The void in the bore, which is the only true dark in the picture. */
const VOID = "#160c12";

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
const GLOOM = 0.26;

/** The lid's share of the buffer, clamped so it's a lip and never a ceiling. */
const LID_MIN = 11;
const LID_MAX = 20;
const LID_SHARE = 0.08;

/** The sump's share. It holds the mound, the broken kit and the cysts. */
const SUMP_MIN = 34;
const SUMP_SHARE = 0.21;

/** Nothing thinner than this is a stratum you can put a machine on. */
const BAND_MIN = 15;

/** The lid. */
export const LID = -1;
/** The sump, at the bottom, with the mound in it. */
export const SUMP = -2;
/** Potato you haven't cut into yet, between the deepest workings and the sump. */
export const UNDUG = -3;

export interface Band {
  /** Index into `ZONES`, or one of `LID` / `SUMP` / `UNDUG`. */
  zone: number;
  top: number;
  bottom: number;
}

/**
 * Where the strata break, given a buffer height and how many are open.
 *
 * **Every zone gets the same share of the shaft whether or not the ones below
 * it are open**, and whatever's left over is solid undug potato. That's the
 * single most important line in the file's layout and it was wrong first time
 * round: the first pass divided the shaft *among the open zones*, so a farm one
 * purchase into the inside got one stratum stretched over the entire screen —
 * two hundred pixels of flat ochre with a row of sprites along the bottom. The
 * same failure the old scene had with its empty hollow, in a different colour.
 *
 * Sized this way, a new farm is a lid, one thin working, and a great mass of
 * potato it hasn't touched. Which is the correct read in both directions: there
 * is obviously a long way down, and every zone you open visibly eats into it
 * until the last one closes the gap and the shaft is worked out top to bottom.
 *
 * `openF` is fractional on purpose: a zone arriving eases its own share in from
 * zero, so the floor above it gives way and the undug below recedes, rather than
 * the whole picture jumping a band. See `drawBreak`.
 */
export function bandsFor(sh: number, openF: number): Band[] {
  const lidH = clamp(Math.round(sh * LID_SHARE), LID_MIN, LID_MAX);
  const sumpH = Math.max(SUMP_MIN, Math.round(sh * SUMP_SHARE));
  const open = Math.max(0, Math.min(ZONES.length, openF));
  const whole = Math.ceil(open);
  const bands: Band[] = [{ zone: LID, top: 0, bottom: lidH }];

  // Never less than one readable stratum per open zone, however short the buffer.
  const body = Math.max(BAND_MIN * whole, sh - lidH - sumpH);
  const total = ZONES.reduce((a, z) => a + z.weight, 0);

  let y = lidH;
  for (let i = 0; i < whole; i++) {
    // The arriving band is scaled by how far in it is; the rest are at full size
    // already, which is what makes the reveal open a floor rather than re-lay
    // the picture.
    const part = i === whole - 1 ? open - (whole - 1) : 1;
    const full = Math.max(BAND_MIN, Math.round((ZONES[i]!.weight / total) * body));
    const h = Math.max(1, Math.round(full * part));
    bands.push({ zone: i, top: y, bottom: y + h });
    y += h;
  }

  const sumpTop = Math.max(y, sh - sumpH);
  if (sumpTop > y) bands.push({ zone: UNDUG, top: y, bottom: sumpTop });
  bands.push({ zone: SUMP, top: sumpTop, bottom: Math.max(sumpTop + 8, sh) });
  return bands;
}

/**
 * How wide the bore is, given everything you own inside.
 *
 * The one measure in the scene that reads the whole farm rather than one tier,
 * because the shaft is the whole farm's throat: a first purchase gets a crack
 * you can drop a potato down, a finished ladder gets a working shaft. Log, like
 * every other count that has to survive running into the hundreds.
 */
export function boreWidth(total: number): number {
  return Math.round(territory(total, 11, 30));
}

/** Where the bore's left edge sits. Under the mound, which is the point. */
const BORE_X = 7;

// ---------------------------------------------------------------------------
// Counts, ground and traffic
// ---------------------------------------------------------------------------

/**
 * How many of a tier to actually draw. Counts run to hundreds and a stratum
 * holds a handful of things before it's soup, so the mapping is logarithmic: the
 * first few are one-for-one and after that it takes a doubling to add another
 * silhouette. Same curve the outside farm reads its field with.
 */
export function shownCount(owned: number, cap: number, spread = 2.4): number {
  if (owned <= 0) return 0;
  if (owned <= 4) return Math.min(owned, cap);
  return Math.min(cap, 4 + Math.floor(Math.log2(owned / 4) * spread));
}

/** How many of each tier ever appear on its ledge, however many you own. */
const CAP: Record<InsideId, number> = {
  bruise: 5,
  eyes: 6,
  quarry: 5,
  well: 4,
  ring: 5,
  chorus: 6,
  heart: 4,
  second: 2,
};

/**
 * How big a tier's *ground* is, given how many of it you own.
 *
 * The outside farm answers "how much of this do I have" by building the lot
 * further back up the hill. Down here it's how far along its stratum the tier
 * has cut: how wide the worked face runs, and how much of the band's width its
 * units are spread across.
 *
 * Log, and pinned at both ends: one of something is always visibly *some*
 * ground, and a hundred and twenty-eight of it is all the ground there is.
 */
export function territory(owned: number, min: number, max: number): number {
  if (owned <= 0) return 0;
  const k = Math.min(1, Math.log2(owned) / Math.log2(128));
  return min + (max - min) * k;
}

/**
 * How often a tier with `n` units drawn turns something up, per second.
 *
 * Not tied to the actual rate. The real one crosses twenty orders of magnitude
 * over a run and any honest mapping of it is either nothing at all or a solid
 * wall of potatoes; this is tied to the count you can *see*, so more of a thing
 * visibly makes more of them, which is the promise that matters.
 *
 * Sub-linear and capped. Everything now funnels down one bore rather than eight
 * separate vessels, so the cap matters more than it used to: overfeed it and the
 * shaft is a solid column of potatoes, which reads as a texture rather than as
 * traffic.
 */
export function flow(n: number): number {
  return Math.min(1.1, 0.24 + n * 0.1);
}

// ---------------------------------------------------------------------------
// Loose things
// ---------------------------------------------------------------------------

/** Starch dust, drifting up the bore. The ambient motion in a room with no weather. */
interface Mote {
  x: number;
  y: number;
  rise: number;
  sway: number;
  phase: number;
  bright: boolean;
}

const MOTES = 30;

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
 * A potato on its way to the mound, which is the only journey in the scene.
 *
 * Three phases and no branching: roll left along the ledge you were cut onto,
 * tip into the bore and fall the height of the picture, then slide across the
 * sump into the pile. That's the whole logistics layer, and it replaces a
 * network of per-tier vessels, intakes, rolling loose crop and porters that
 * between them were most of the old file and all of the visual noise.
 */
interface Crop {
  phase: "roll" | "fall" | "slide";
  x: number;
  y: number;
  /** Fall speed, and the spin it's carrying while it does. */
  vy: number;
  spin: number;
  /** Which tier cut it, for the tint on the puff it lands in. */
  from: InsideId;
}

/**
 * One of the shaft crew, and the reason the place stops looking abandoned.
 *
 * The outside farm has hands walking crop down to the yard, and dropping them on
 * the way in here is most of why the inside read as machinery running in an
 * empty building. These do the same job the hands do — give the picture
 * something with intent in it — with the descent's own set of verbs: work a
 * face, walk the bench, wait at the shaft, ride the cage to another level.
 *
 * `post` is which bench they're on, as a zone index and which of its two rungs.
 * Everything else is where they are on it and what they're in the middle of.
 */
interface Crew {
  x: number;
  y: number;
  post: { zone: number; first: boolean };
  state: "walk" | "work" | "wait" | "ride" | "mingle";
  /** Where they're heading along the bench. */
  tx: number;
  /** Scene-clock time the current state runs out. */
  until: number;
  /** Where they're going when the cage comes, while waiting or riding. */
  bound: { zone: number; first: boolean } | null;
  facing: 1 | -1;
  /** Phase for the walk bob, so a line of them isn't in lockstep. */
  phase: number;
}

/** How long a unit stays visibly in the middle of having made something. */
const WORK_BEAT_S = 0.45;

const CREW_SPEED = 13;
const MAX_CREW = 9;

/**
 * The hoist: one cage on a rope, running the shaft and stopping at every bench.
 *
 * Crop goes *down* by gravity and always will — that's the scene's spine. So the
 * cage carries the only thing that has any reason to go up, which is people, and
 * the two motions don't compete: potatoes fall past a cage climbing, which is
 * exactly the traffic a working shaft has.
 */
interface Hoist {
  y: number;
  dir: 1 | -1;
  /** Scene-clock time it starts moving again, if it's stopped at a level. */
  restUntil: number;
  riders: Crew[];
}

const HOIST_SPEED = 19;
const HOIST_REST_S = 1.3;
const HOIST_SEATS = 2;

const MAX_CROP = 26;
/** Buffer pixels a second. A potato rolling itself along a ledge is unhurried. */
const ROLL_SPEED = 26;
/** Buffer pixels a second squared. Gentler than real gravity: it's a deep hole. */
const FALL_G = 190;
const SLIDE_SPEED = 34;

// ---------------------------------------------------------------------------
// The hoard
// ---------------------------------------------------------------------------

/**
 * The hoard, as a mound.
 *
 * Deliberately the same pile in the same corner as the outside yard's, because
 * it is the same potatoes — the fold doesn't take your money off you, and the
 * one thing that should carry between the two pictures unchanged is the number
 * you're spending. The build-out around it doesn't carry: sheds and silos are
 * things you put up on a farm, and there's nothing to build them out of down
 * here. What the sump gets instead is the flesh growing storage for you.
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

/** Where a sliding potato is aiming, and where the pile's shoulder is. */
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

/** How long the floor takes to give way when a new stratum opens. */
const REVEAL_S = 1.9;

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
  private crop: Crop[] = [];
  private crew: Crew[] = [];
  private hoist: Hoist = { y: 40, dir: 1, restUntil: 0, riders: [] };
  /**
   * When each drawn unit last turned something up, keyed `id:index`.
   *
   * Production used to be a potato appearing next to a machine that never moved,
   * which reads as the potato having nothing to do with the machine. A unit that
   * has just worked bobs and throws a spark for a moment, so the thing you bought
   * is visibly the thing making the number go up.
   */
  private worked = new Map<string, number>();
  private sawView = false;
  /**
   * How many strata are drawn open, which chases how many *are*.
   *
   * Snapped on the first view and eased after it, on the same rule the fold
   * animates by: a farm that was already four deep when the tab opened renders
   * four deep, because replaying a reveal on every reload spends it. `revealAt`
   * is when the current one started, or null if nothing is opening.
   */
  private openShown = 0;
  private revealAt: number | null = null;
  /**
   * The hoard the sump is currently showing, which chases the real one rather
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
      // A restore, a hand-down or a plough-under all open at their true depth.
      this.openShown = openZones(view.working);
      this.revealAt = null;
    } else if (openZones(view.working) > Math.ceil(this.openShown) && this.revealAt === null) {
      this.revealAt = this.clock;
    }
    this.sawView = true;
  }

  /** A different tuber entirely: handed down, or ploughed under. */
  private clearOut(): void {
    this.motes = [];
    this.dug = [];
    this.puffs = [];
    this.crop = [];
    this.crew = [];
    this.hoist = { y: 40, dir: 1, restUntil: 0, riders: [] };
    this.worked.clear();
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
    const bands = this.bands();
    const sump = bands[bands.length - 1]!;
    const x = at
      ? Math.max(3, Math.min(SCENE_W - 8, Math.round(at.x)))
      : 30 + Math.random() * (SCENE_W - 70);
    const y = at
      ? Math.max(bands[0]!.bottom, Math.min(this.sh - 8, Math.round(at.y)))
      : sump.top + 4 + Math.random() * 12;
    this.dug.push({ x: Math.round(x), y: Math.round(y), born: performance.now() });
    this.puff(x, y, -10);
    this.puff(x + 3, y, 10);
  }

  // --- Where things are ------------------------------------------------------

  /** How far through the current reveal, 0..1, eased. */
  private revealK(): number {
    if (this.revealAt === null) return 1;
    const k = clamp((this.clock - this.revealAt) / REVEAL_S, 0, 1);
    // Slow out of the break and fast into the settle: the floor gives, then the
    // stratum drops into place.
    return k * k * (3 - 2 * k);
  }

  private bands(): Band[] {
    const target = openZones(this.view.working);
    if (this.revealAt !== null) {
      const k = this.revealK();
      const from = Math.ceil(this.openShown);
      const openF = from + (target - from) * k;
      if (k >= 1) {
        this.openShown = target;
        this.revealAt = null;
      }
      return bandsFor(this.sh, openF);
    }
    this.openShown = target;
    return bandsFor(this.sh, target);
  }

  /** The bore's right edge. Its left edge is `BORE_X`. */
  private boreRight(): number {
    let total = 0;
    for (const id of ORDER) total += this.owned(id);
    return BORE_X + boreWidth(total);
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
    return shownCount(this.owned(id), CAP[id]);
  }

  /** Per-frame odds for something that should happen `perSec` times a second. */
  private chance(perSec: number): boolean {
    return Math.random() < perSec * this.dt;
  }

  /**
   * Where a tier's units stand along its stratum.
   *
   * The two rungs of a zone get **their own half of the ledge and their own
   * bench**, not opposite ends of one line. Two things went wrong before that:
   * growing them toward each other produced an alternating bruise/eye/bruise/eye
   * stripe the moment both were well bought, and standing everything on the
   * band's floor left each stratum an empty rectangle with a shelf of
   * merchandise along the bottom of it. Cutting the shallower rung a bench
   * half-way up fills the band, separates the two tiers by more than position,
   * and is what a worked seam actually looks like.
   *
   * Within its half, a tier spreads by `territory` and every unit is jittered off
   * the line. Evenly spaced identical sprites at a constant y is a shelf of
   * merchandise; a couple of pixels of scatter is a worked seam, and that is the
   * entire difference.
   */
  private slots(id: InsideId, band: Band): { x: number; y: number }[] {
    const n = this.working(id);
    if (n <= 0) return [];
    const art = artCanvas(this.mark(id));
    const left = this.boreRight() + 3;
    const right = SCENE_W - 3;
    const mid = Math.round((left + right) / 2);
    const first = ZONES[band.zone]!.tiers[0] === id;
    const from = first ? left : mid + 2;
    const to = first ? mid - 2 : right;
    const foot = this.benchY(band, first);

    const room = Math.max(art.w, to - from);
    // Never tighter than the units are wide. `territory` alone is a *how much
    // ground* number and says nothing about how many things are standing on it,
    // so a well-bought tier whose ground hadn't caught up drew six sprites into
    // four sprites' worth of ledge and came out as a heap of rubble.
    const spread = clamp(territory(this.owned(id), art.w + 2, room), n * (art.w + 1), room);
    // Seeded off the tier, so a farm's scatter is the same every frame and the
    // same on every reload. Jitter that re-rolls per frame is a vibrating farm.
    const rng = mulberry32(hashSeed(id) ^ 0x51e);
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : i / (n - 1);
      const along = k * Math.max(0, spread - art.w);
      const x = Math.round(from + along + (rng() - 0.5) * 5);
      out.push({
        x: clamp(x, this.boreRight() + 1, SCENE_W - art.w - 1),
        // Bedded a pixel or two into their own bench, at slightly different
        // depths, so the row has a ragged bottom edge instead of a ruled one.
        y: foot - art.h + Math.round(rng() * 2),
      });
    }
    return out;
  }

  /**
   * The line a tier's units stand on: the band's own floor for the deeper rung,
   * a bench cut half-way up it for the shallower one.
   *
   * Clamped so the bench can't ride up into the cut above it on a thin band —
   * a short buffer squeezes every stratum, and the first thing to go wrong is a
   * machine standing on the ceiling of its own seam.
   */
  private benchY(band: Band, first: boolean): number {
    if (!first) return band.bottom - 1;
    const h = band.bottom - band.top;
    return band.top + clamp(Math.round(h * 0.52), 11, Math.max(11, h - 12));
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
    const bands = this.bands();
    const sump = bands[bands.length - 1]!;

    ctx.clearRect(0, 0, SCENE_W, this.sh);

    // The place first, then the dark over it, then everything you built on top
    // of the dark. That order is the whole reason a primed tier reads as a light
    // source down here rather than as a bright sprite: there's no sun inside a
    // potato, so the only thing lighting the picture is kit you paid for.
    this.drawLid(bands[0]!);
    for (const band of bands) {
      if (band.zone >= 0) this.drawStratum(band, t);
      else if (band.zone === UNDUG) this.drawUndug(band, bands);
    }
    this.drawSump(sump);
    this.drawBore(bands, t);
    this.drawGloom(bands[0]!.bottom, sump.top);

    // Everything standing in the strata, deepest first so the near ledges
    // overlap the far ones where a sprite overhangs its cut.
    for (let i = bands.length - 1; i >= 0; i--) {
      const band = bands[i]!;
      if (band.zone >= 0) this.drawTiers(band, t);
    }

    this.stepHoist(bands, t);
    this.stepCrew(bands, t);
    this.drawHoist(bands);
    this.drawCrew();

    this.drawMotes(bands[0]!.bottom, sump.top, t);
    this.drawHoard(sump.top);
    this.stepCrop(bands, sump.top);
    this.drawCrop();
    this.drawBroken(sump.top);
    this.drawDug(now);
    this.drawPuffs(now);
    this.drawBreak(bands, t);

    this.emit(bands, t);
  }

  /**
   * The lid: the underside of what closed over you.
   *
   * The one warm, bright thing in the picture, and it's above everything — so
   * the eye enters at the top, where you came in, and travels down the shaft
   * with the crop. Two wavy vascular lines and nothing else: it's a lip, not a
   * ceiling, and the first draft of this scene proved that giving the roof real
   * estate just costs the half of the screen that has things in it.
   */
  private drawLid(lid: Band): void {
    const ctx = this.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, lid.bottom);
    grad.addColorStop(0, LID_LIT);
    grad.addColorStop(1, LID_DEEP);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCENE_W, lid.bottom);

    const rng = mulberry32(0x11d);
    for (let i = 0; i < 22; i++) {
      const y = Math.round(rng() * (lid.bottom - 2)) + 1;
      const x = Math.round(rng() * SCENE_W);
      const w = 3 + Math.round(rng() * 11);
      ctx.fillStyle = rgba(rng() > 0.6 ? "#f7ecd0" : "#b0854a", 0.22);
      ctx.fillRect(x, y, w, 1);
    }
    // Two vascular rings running the width of it, and eyes sprouting downward
    // out of the underside. Carried over from the ceiling the fold used to leave
    // you under: it's the only thing in this scene the player has seen before,
    // and it's what stops the lid being a blank bar at the top of the screen.
    for (let i = 0; i < 2; i++) {
      const base = Math.round(lid.bottom * (0.42 + i * 0.3));
      ctx.fillStyle = rgba("#a8703c", 0.35);
      for (let x = 0; x < SCENE_W; x++) {
        ctx.fillRect(x, base + Math.round(Math.sin(x * 0.09 + i * 2) * 1.6), 1, 1);
      }
    }
    for (let i = 0; i < 4; i++) {
      const x = 14 + Math.round(rng() * (SCENE_W - 28));
      const y = lid.bottom - 4;
      ctx.fillStyle = rgba("#8a5a2c", 0.6);
      ctx.fillRect(x, y, 3, 2);
      ctx.fillStyle = rgba("#f2e0b4", 0.5);
      ctx.fillRect(x, y - 1, 3, 1);
      // Pale stems, not green: a potato sprouting in the dark etiolates, and the
      // pale also keeps the one growing thing up there from reading as crop.
      ctx.fillStyle = rgba("#e6dcc0", 0.55);
      ctx.fillRect(x + 1, y + 2, 1, 2 + Math.round(rng() * 2));
    }
    // The cut where the lid stops and the potato starts.
    ctx.fillStyle = INK;
    ctx.fillRect(0, lid.bottom - 1, SCENE_W, 1);
  }

  /**
   * One stratum: its material, its marbling, its worked face and its floor.
   *
   * The gradient inside each band runs lit → deep, so every band is brighter at
   * the top than the one above it is at the bottom. That saw-tooth is what makes
   * a stack of bands read as cut steps going down rather than as stripes: each
   * floor throws a little light onto the material below it.
   */
  private drawStratum(band: Band, t: number): void {
    const ctx = this.ctx;
    const zone = ZONES[band.zone]!;
    const h = band.bottom - band.top;
    if (h <= 0) return;

    const grad = ctx.createLinearGradient(0, band.top, 0, band.bottom);
    grad.addColorStop(0, zone.lit);
    grad.addColorStop(0.45, zone.flesh);
    grad.addColorStop(1, zone.deep);
    ctx.fillStyle = grad;
    ctx.fillRect(0, band.top, SCENE_W, h);

    // Marbling. Low contrast on purpose — anything with an edge on it up here
    // starts competing with the kit standing in front of it.
    const rng = mulberry32(0x5a1 + band.zone * 977);
    const veins = Math.round(h * 0.55);
    for (let i = 0; i < veins; i++) {
      const y = band.top + 1 + Math.round(rng() * Math.max(1, h - 2));
      const x = Math.round(rng() * SCENE_W);
      const w = 4 + Math.round(rng() * 16);
      ctx.fillStyle = rgba(rng() > 0.5 ? zone.lit : zone.deep, 0.22);
      ctx.fillRect(x, y, w, 1);
    }

    // The worked face: a paler bite cut back into the wall at the far end of the
    // ledge, as wide as the two rungs of this zone have cut between them. This is
    // where "owning more takes over more of the place" lives now that there's no
    // hill to build into.
    //
    // Scored *vertically*. The first pass terraced it with horizontal steps, on
    // the theory that steps say "cut" — and eight horizontal lines across a tan
    // rectangle say "wooden panelling" far louder, in every band at once. A face
    // you've worked back into is cut top to bottom, so the tool marks run that
    // way too, and the band's own gradient is left to do the lighting.
    const cut = this.faceWidth(band.zone);
    if (cut > 0) {
      const x0 = SCENE_W - cut;
      const face = mix(zone.lit, "#f7f1dc", 0.3);
      const rock = mulberry32(0x77 + band.zone * 313);
      for (let y = band.top + 1; y < band.bottom - 1; y++) {
        const jag = Math.round(Math.sin(y * 0.9 + band.zone * 3) * 2 + (rock() - 0.5) * 2);
        ctx.fillStyle = rgba(face, 0.42);
        ctx.fillRect(x0 + jag, y, SCENE_W - x0 - jag, 1);
      }
      for (let i = 0; i < Math.round(cut / 5); i++) {
        const x = x0 + 3 + Math.round(rock() * Math.max(1, cut - 4));
        const y = band.top + 2 + Math.round(rock() * Math.max(1, h - 6));
        ctx.fillStyle = rgba(zone.deep, 0.3);
        ctx.fillRect(x, y, 1, 2 + Math.round(rock() * 4));
      }
    }

    // Whatever this stratum is made of that isn't flesh: sprouts in the hollow,
    // sap beading in the ring, embers in the core. One accent per zone, moving.
    this.drawAccent(band, t);

    // The floor. The one hard line in the band, and it's a cut, so it's earned.
    //
    // Three pixels rather than two, and the bright one is *bright*: the ring and
    // the core are close enough in value that a subtle cut between them let the
    // bottom half of the picture pool into one dark mass. A cut face catches
    // light along its lip — leaning on that is what keeps four strata reading as
    // four when two of them are nearly black.
    ctx.fillStyle = rgba(mix(zone.lit, "#ffffff", 0.55), 0.75);
    ctx.fillRect(0, band.bottom - 3, SCENE_W, 1);
    ctx.fillStyle = rgba(mix(zone.lit, "#ffffff", 0.2), 0.5);
    ctx.fillRect(0, band.bottom - 2, SCENE_W, 1);
    ctx.fillStyle = INK;
    ctx.fillRect(0, band.bottom - 1, SCENE_W, 1);
  }

  /**
   * The potato you haven't cut into yet.
   *
   * Denser and darker than anything you've opened, and deliberately featureless
   * next to the strata: what makes a worked band look worked is having unworked
   * material to sit against. It's also the endgame's only remaining sense of
   * scale — on a farm one rung in, this is most of the screen, and the read is
   * "there is a very long way down", which is exactly what the ladder is about
   * to charge you for.
   *
   * Tinted a little toward whatever zone comes next, so what's under your feet
   * is a hint rather than a wall. Not more than a hint: naming the next stratum
   * before you've bought into it spends the reveal.
   */
  private drawUndug(band: Band, bands: Band[]): void {
    const ctx = this.ctx;
    const h = band.bottom - band.top;
    if (h <= 0) return;
    const nextZone = ZONES[bands.filter((b) => b.zone >= 0).length] ?? ZONES[ZONES.length - 1]!;
    const near = mix(nextZone.deep, "#241220", 0.5);
    const far = mix(nextZone.deep, "#140a12", 0.78);

    const grad = ctx.createLinearGradient(0, band.top, 0, band.bottom);
    grad.addColorStop(0, near);
    grad.addColorStop(1, far);
    ctx.fillStyle = grad;
    ctx.fillRect(0, band.top, SCENE_W, h);

    // Dense, close-packed mottle: solid material, not a surface. This is most of
    // the screen on a farm that's one rung in, so it has to hold up as something
    // to look at rather than as a brown rectangle waiting to be replaced.
    const rng = mulberry32(0x3f0d);
    for (let i = 0; i < Math.round(h * 5); i++) {
      const x = Math.round(rng() * SCENE_W);
      const y = band.top + Math.round(rng() * h);
      ctx.fillStyle = rgba(rng() > 0.55 ? near : "#0e0710", 0.22 + rng() * 0.3);
      ctx.fillRect(x, y, 1 + Math.round(rng() * 3), 1);
    }
    // Starch nodules: lumps of the pale stuff still locked in the flesh, which
    // is the one thing down here that says the mass is worth cutting into.
    for (let i = 0; i < Math.round(h / 7); i++) {
      const x = 3 + Math.round(rng() * (SCENE_W - 8));
      const y = band.top + 2 + Math.round(rng() * Math.max(1, h - 5));
      const w = 2 + Math.round(rng() * 3);
      ctx.fillStyle = rgba(SUMP_SPOIL, 0.28);
      ctx.fillRect(x, y, w, 1);
      ctx.fillStyle = rgba("#e6dcc0", 0.16);
      ctx.fillRect(x + 1, y - 1, Math.max(1, w - 2), 1);
    }
    // And a few fissures, running off the shaft — the flesh is under its own
    // weight down here, which the stulls in the bore are the answer to.
    for (let i = 0; i < Math.round(h / 22) + 1; i++) {
      let x = Math.round(rng() * SCENE_W);
      let y = band.top + Math.round(rng() * Math.max(1, h - 12));
      const len = 6 + Math.round(rng() * 18);
      const lean = rng() > 0.5 ? 1 : -1;
      for (let s = 0; s < len; s++) {
        ctx.fillStyle = rgba("#0a050a", 0.4);
        ctx.fillRect(x, y, 1, 1);
        y += 1;
        if (rng() > 0.6) x += lean;
        if (y >= band.bottom - 1) break;
      }
    }
  }

  /** How far the worked face is cut back into a zone's wall. */
  private faceWidth(zone: number): number {
    const owned = ZONES[zone]!.tiers.reduce((sum, id) => sum + this.owned(id), 0);
    return Math.round(territory(owned, 0, 62));
  }

  /**
   * The one thing in each stratum that isn't the material it's made of.
   *
   * Small and moving, and it carries most of what tells the four zones apart at
   * a glance once they're all open — the gradients do it at rest, but a picture
   * this dark needs something with a highlight on it in each band or the deep
   * two go to mush.
   */
  private drawAccent(band: Band, t: number): void {
    const ctx = this.ctx;
    const zone = ZONES[band.zone]!;
    const h = band.bottom - band.top;
    const rng = mulberry32(0x9e3 + band.zone * 131);
    const n = 5 + band.zone;
    for (let i = 0; i < n; i++) {
      const x = Math.round(rng() * (SCENE_W - 8)) + 4;
      const y = band.top + 2 + Math.round(rng() * Math.max(1, h - 6));
      const pulse = 0.35 + 0.3 * Math.sin(t * 0.9 + i * 1.9);
      if (band.zone === 0) {
        // Pale stems: a potato sprouting in the dark etiolates, and keeping them
        // off green is also what stops the one growing thing down here reading
        // as crop.
        ctx.fillStyle = rgba(mix(zone.accent, "#f7f1dc", 0.55), 0.5);
        ctx.fillRect(x, y, 1, 3);
        ctx.fillRect(x + 1, y - 1, 1, 1);
      } else if (band.zone === 1) {
        ctx.fillStyle = rgba(zone.accent, 0.3);
        ctx.fillRect(x, y, 2, 1);
      } else if (band.zone === 2) {
        // Sap, beading and running. The colour that says this is an organ.
        const run = Math.round((t * 6 + i * 13) % Math.max(4, h - 4));
        ctx.fillStyle = rgba(zone.accent, 0.55 * pulse + 0.2);
        ctx.fillRect(x, band.top + 2 + run, 1, 2);
      } else {
        ctx.fillStyle = rgba(zone.accent, 0.22 * pulse);
        ctx.fillRect(x, y, 1, 1);
        this.glow(x, y, 5, zone.accent, 0.1 * pulse);
      }
    }
  }

  /** Everything of yours standing on one stratum, on its two benches. */
  private drawTiers(band: Band, t: number): void {
    const ctx = this.ctx;
    const zone = ZONES[band.zone]!;
    zone.tiers.forEach((id, ti) => {
      const slots = this.slots(id, band);
      if (slots.length === 0) return;
      const art = artCanvas(this.mark(id));

      // The bench under the shallower rung, cut only as far as that rung has
      // worked. The deeper rung stands on the band's own floor, which is already
      // drawn — cutting a second full-width line for it would put two hard rules
      // a few pixels apart and undo the whole reason the floors are legible.
      if (ti === 0) {
        const foot = this.benchY(band, true);
        const x0 = Math.max(this.boreRight(), slots[0]!.x - 3);
        const x1 = Math.min(SCENE_W, slots[slots.length - 1]!.x + art.w + 3);
        ctx.fillStyle = rgba(mix(zone.lit, "#ffffff", 0.45), 0.6);
        ctx.fillRect(x0, foot - 1, x1 - x0, 1);
        ctx.fillStyle = INK;
        ctx.fillRect(x0, foot, x1 - x0, 1);
        // The undercut, so the bench is a shelf of material rather than a line
        // ruled across the band.
        ctx.fillStyle = rgba(zone.deep, 0.5);
        ctx.fillRect(x0 + 1, foot + 1, x1 - x0 - 2, 2);
      }

      slots.forEach((slot, i) => {
        // The work beat: a unit that just turned something up drops a pixel and
        // comes back, and throws a spark off its face. It's two pixels of motion
        // and it's the difference between "a potato appeared near that thing" and
        // "that thing made a potato".
        const since = t - (this.worked.get(`${id}:${i}`) ?? -99);
        const beat = since < WORK_BEAT_S ? 1 - since / WORK_BEAT_S : 0;
        const drop = Math.round(Math.sin(beat * Math.PI) * 2);
        this.primeGlow(id, slot.x, slot.y, art.w, art.h, t, i);
        ctx.drawImage(art.canvas, slot.x, slot.y + drop);
        if (beat > 0.55) {
          ctx.fillStyle = rgba("#fff4c0", (beat - 0.55) * 2);
          ctx.fillRect(slot.x + art.w - 2, slot.y + drop + 2, 2, 1);
          ctx.fillRect(slot.x + art.w, slot.y + drop + 1, 1, 1);
        }
      });
    });
  }

  /**
   * The bore: the open shaft everything falls down, and the spine of the picture.
   *
   * Drawn over the strata rather than between them, because it's a hole cut
   * through all of them — the same hole, continuous top to bottom, which is the
   * thing that makes four separate bands add up to one place. Its edges catch
   * the light of whatever band they're passing through, so the shaft reads as
   * going *through* the potato instead of being painted on it.
   */
  private drawBore(bands: Band[], t: number): void {
    const ctx = this.ctx;
    const right = this.boreRight();
    const top = bands[0]!.bottom;
    const floor = bands[bands.length - 1]!.top;
    if (right <= BORE_X || floor <= top) return;

    const grad = ctx.createLinearGradient(0, top, 0, floor);
    grad.addColorStop(0, mix(VOID, LID_DEEP, 0.28));
    grad.addColorStop(1, VOID);
    ctx.fillStyle = grad;
    ctx.fillRect(BORE_X, top, right - BORE_X, floor - top);

    // The two walls, lit per band, and a cut lip where each stratum's floor meets
    // the shaft — the ledges the crop rolls along to get here. The bore runs the
    // *whole* height including the undug, because sinking it is how you got to
    // the sump at all; the strata are worked sideways off it one at a time.
    for (const band of bands) {
      const h = band.bottom - band.top;
      if (h <= 0 || band.zone === LID || band.zone === SUMP) continue;
      const zone = band.zone >= 0 ? ZONES[band.zone]! : null;
      ctx.fillStyle = rgba(zone ? mix(zone.lit, "#ffffff", 0.3) : "#8a6a58", 0.6);
      ctx.fillRect(BORE_X, band.top, 1, h);
      ctx.fillStyle = rgba(zone ? zone.deep : "#0e0710", 0.6);
      ctx.fillRect(right - 1, band.top, 1, h);
      if (!zone) continue;
      ctx.fillStyle = rgba(mix(zone.lit, "#ffffff", 0.5), 0.7);
      ctx.fillRect(BORE_X, band.bottom - 2, right - BORE_X, 1);
      ctx.fillStyle = INK;
      ctx.fillRect(BORE_X, band.bottom - 1, right - BORE_X, 1);
    }

    // Stulls across the shaft: the one piece of kit in the picture holding the
    // place open. They're what stops a tall black rectangle reading as a gap in
    // the art rather than as a hole somebody dug.
    for (let y = top + 9; y < floor - 4; y += 13) {
      ctx.fillStyle = rgba("#4d4148", 0.85);
      ctx.fillRect(BORE_X + 1, y, right - BORE_X - 2, 1);
      ctx.fillStyle = rgba("#8a6a58", 0.5);
      ctx.fillRect(BORE_X + 1, y - 1, right - BORE_X - 2, 1);
    }

    // A slow breath of light down it, so the shaft is never completely static
    // even on a farm that isn't producing.
    const drift = ((t * 9) % (floor - top + 40)) - 20;
    this.glow(BORE_X + (right - BORE_X) / 2, top + drift, 14, "#f0c68c", 0.07);
  }

  /**
   * The sump: the floor of the workings, where everything ends up.
   *
   * Dark, and that's a decision rather than an accident of being deepest — the
   * mound is the one thing on the canvas the player is actually spending, and a
   * pile of warm ochre potatoes needs something dark under it to read against.
   * Outside, the yard gets that from being dirt in shadow.
   */
  private drawSump(sump: Band): void {
    const ctx = this.ctx;
    const h = this.sh - sump.top;
    const grad = ctx.createLinearGradient(0, sump.top, 0, this.sh);
    grad.addColorStop(0, SUMP_FLOOR);
    grad.addColorStop(0.35, mix(SUMP_FLOOR, SUMP_DEEP, 0.55));
    grad.addColorStop(1, SUMP_DEEP);
    ctx.fillStyle = grad;
    ctx.fillRect(0, sump.top, SCENE_W, h);

    // Spoil: what's been cut and hasn't been picked up, banked against the back.
    const rng = mulberry32(0x2c0);
    for (let i = 0; i < 26; i++) {
      const x = Math.round(rng() * SCENE_W);
      const y = sump.top + Math.round(rng() * Math.min(6, h));
      ctx.fillStyle = rgba(SUMP_SPOIL, 0.25 + rng() * 0.25);
      ctx.fillRect(x, y, 1 + Math.round(rng() * 3), 1);
    }
    ctx.fillStyle = INK;
    ctx.fillRect(0, sump.top, SCENE_W, 1);
    ctx.fillStyle = rgba(SUMP_SPOIL, 0.5);
    ctx.fillRect(0, sump.top + 1, SCENE_W, 1);
  }

  /** Starch dust, rising up the shaft. It falls up in here. */
  private drawMotes(top: number, floor: number, t: number): void {
    const ctx = this.ctx;
    if (this.motes.length === 0) {
      for (let i = 0; i < MOTES; i++) {
        this.motes.push({
          x: this.rng() * SCENE_W,
          y: top + this.rng() * Math.max(1, floor - top),
          rise: 3 + this.rng() * 7,
          sway: 2 + this.rng() * 5,
          phase: this.rng() * 6.28,
          bright: this.rng() > 0.7,
        });
      }
    }
    for (const m of this.motes) {
      m.y -= m.rise * this.dt;
      if (m.y < top) {
        m.y = floor;
        m.x = this.rng() * SCENE_W;
      }
      const x = Math.round(m.x + Math.sin(t * 0.5 + m.phase) * m.sway);
      ctx.fillStyle = rgba("#e6dcc0", m.bright ? 0.4 : 0.18);
      ctx.fillRect(x, Math.round(m.y), 1, 1);
    }
  }

  // --- The crop, going down --------------------------------------------------

  /**
   * Every tier turns something up, on the count you can see rather than the rate.
   *
   * This is the promise the first inside failed hardest: eight sprites standing
   * in the dark doing nothing read as the afterlife rather than as a farm. A
   * potato appearing at a machine and visibly ending up in your pile is the
   * whole of what makes it a farm, and it's now the same three-phase journey for
   * every rung on the ladder.
   */
  private emit(bands: Band[], t: number): void {
    for (const band of bands) {
      if (band.zone < 0) continue;
      ZONES[band.zone]!.tiers.forEach((id, ti) => {
        const n = this.working(id);
        if (n <= 0 || !this.chance(flow(n))) return;
        const slots = this.slots(id, band);
        const pick = Math.floor(Math.random() * slots.length);
        const from = slots[pick];
        if (!from) return;
        this.worked.set(`${id}:${pick}`, t);
        const art = artCanvas(this.mark(id));
        // Off the bench it was cut on, not off the band's floor — a potato that
        // appears a bench below the machine that made it breaks the one link the
        // whole scene is trying to draw.
        this.cut(from.x + art.w / 2, this.benchY(band, ti === 0) - 4, id);
      });
    }
    // The Second Potato is the one rung that fruits rather than being worked, so
    // it drops straight into the bore instead of rolling to it. Nothing else in
    // the picture ignores the ledges.
    if (this.owned("second") > 0 && this.chance(0.2)) {
      this.puff(this.boreRight() + 2, bands[bands.length - 1]!.top - 6, -4);
    }
  }

  private cut(x: number, y: number, from: InsideId): void {
    if (this.crop.length >= MAX_CROP) return;
    this.crop.push({ phase: "roll", x, y, vy: 0, spin: Math.random() * 6.28, from });
    this.puff(x, y, Math.random() > 0.5 ? 6 : -6);
  }

  private stepCrop(bands: Band[], sumpTop: number): void {
    const lip = this.boreRight() - 2;
    const floor = sumpTop - 2;
    const kept: Crop[] = [];
    for (const c of this.crop) {
      if (c.phase === "roll") {
        c.x -= ROLL_SPEED * this.dt;
        if (c.x <= lip) {
          c.phase = "fall";
          c.x = BORE_X + 2 + Math.random() * Math.max(1, lip - BORE_X - 3);
        }
      } else if (c.phase === "fall") {
        c.vy += FALL_G * this.dt;
        c.y += c.vy * this.dt;
        c.spin += this.dt * 9;
        if (c.y >= floor) {
          c.y = floor;
          c.phase = "slide";
          this.puff(c.x, c.y + 3, -8, -4);
          this.puff(c.x + 2, c.y + 3, 8, -4);
        }
      } else {
        c.x -= SLIDE_SPEED * this.dt;
        // Into the pile, and gone. The hoard number is already climbing; this is
        // the picture agreeing with it.
        if (c.x <= HEAP_CROWN_X + 6) {
          this.puff(c.x, c.y, -4);
          continue;
        }
      }
      kept.push(c);
    }
    this.crop = kept;
    void bands;
  }

  private drawCrop(): void {
    const ctx = this.ctx;
    const potato = artCanvas(POTATO_SPRITE);
    for (const c of this.crop) {
      // A falling potato gets a pixel of wobble rather than a rotation: rotating
      // the blit resamples it off the grid and the outline doubles.
      const wob = c.phase === "fall" ? Math.round(Math.sin(c.spin) * 1) : 0;
      ctx.drawImage(potato.canvas, Math.round(c.x) + wob, Math.round(c.y));
    }
  }

  // --- The crew and the hoist ------------------------------------------------

  /** How many bodies a farm this size puts underground. Log, like everything. */
  private crewSize(bands: Band[]): number {
    const posts = bands.filter((b) => b.zone >= 0).length * 2;
    if (posts === 0) return 0;
    let total = 0;
    for (const id of ORDER) total += this.owned(id);
    return Math.max(1, Math.min(MAX_CREW, posts, shownCount(total, MAX_CREW, 1.5)));
  }

  /** Which benches exist to stand on, as `(zone, first)` pairs. */
  private posts(bands: Band[]): { zone: number; first: boolean }[] {
    const out: { zone: number; first: boolean }[] = [];
    for (const b of bands) {
      if (b.zone < 0) continue;
      for (const first of [true, false]) {
        if (this.working(ZONES[b.zone]!.tiers[first ? 0 : 1]) > 0) out.push({ zone: b.zone, first });
      }
    }
    return out;
  }

  private postY(bands: Band[], post: { zone: number; first: boolean }): number {
    const band = bands.find((b) => b.zone === post.zone);
    return band ? this.benchY(band, post.first) : bands[bands.length - 1]!.top;
  }

  /**
   * The crew, going about it.
   *
   * Nothing here is fast and nothing here is synchronised, which is the same rule
   * the outside hands run on: a farm where everyone starts and stops together
   * reads as a machine, and a farm where they don't reads as a place people work.
   */
  private stepCrew(bands: Band[], t: number): void {
    const posts = this.posts(bands);
    if (posts.length === 0) {
      this.crew = [];
      this.hoist.riders = [];
      return;
    }
    const want = this.crewSize(bands);
    while (this.crew.length > want) this.crew.pop();
    while (this.crew.length < want) {
      const post = posts[this.crew.length % posts.length]!;
      this.crew.push({
        x: this.boreRight() + 6 + this.rng() * 40,
        y: this.postY(bands, post),
        post,
        state: "walk",
        tx: this.boreRight() + 10 + this.rng() * 60,
        until: 0,
        bound: null,
        facing: 1,
        phase: this.rng() * 6.28,
      });
    }

    const head = this.boreRight() - 4;
    for (const c of this.crew) {
      // A bench that stopped existing — the tier was sold or the farm was wiped —
      // puts whoever was standing on it back on a bench that does.
      if (!posts.some((p) => p.zone === c.post.zone && p.first === c.post.first)) {
        c.post = posts[Math.floor(this.rng() * posts.length)]!;
        c.state = "walk";
      }
      if (c.state !== "ride") c.y = this.postY(bands, c.post);

      switch (c.state) {
        case "walk": {
          const d = c.tx - c.x;
          c.facing = d >= 0 ? 1 : -1;
          if (Math.abs(d) <= 1) {
            c.x = c.tx;
            if (c.tx <= head + 2 && c.bound) {
              c.state = "wait";
            } else {
              // Most of the time, go and lean on a machine. Sometimes go and
              // stand next to whoever else is on this bench instead.
              const near = this.crew.find(
                (o) =>
                  o !== c &&
                  o.post.zone === c.post.zone &&
                  o.post.first === c.post.first &&
                  o.state === "work",
              );
              if (near && this.rng() < 0.35) {
                c.state = "mingle";
                c.until = t + 2 + this.rng() * 3;
                c.facing = near.x > c.x ? 1 : -1;
              } else {
                c.state = "work";
                c.until = t + 1.6 + this.rng() * 3.4;
              }
            }
          } else {
            c.x += Math.sign(d) * CREW_SPEED * this.dt;
          }
          break;
        }
        case "work":
        case "mingle": {
          if (t < c.until) break;
          c.state = "walk";
          // Every so often, change levels. That's what the cage is for, and it's
          // the only thing that makes the shaft feel connected to the benches
          // rather than a hole they happen to stand next to.
          if (posts.length > 1 && this.rng() < 0.3) {
            let to = posts[Math.floor(this.rng() * posts.length)]!;
            if (to.zone === c.post.zone && to.first === c.post.first) {
              to = posts[(posts.indexOf(c.post) + 1) % posts.length] ?? to;
            }
            c.bound = to;
            c.tx = head;
          } else {
            c.bound = null;
            c.tx = this.wanderTo(c, bands);
          }
          break;
        }
        case "wait": {
          const at = this.postY(bands, c.post);
          if (
            this.hoist.riders.length < HOIST_SEATS &&
            Math.abs(this.hoist.y - at) <= 3 &&
            t < this.hoist.restUntil
          ) {
            c.state = "ride";
            this.hoist.riders.push(c);
          }
          break;
        }
        case "ride": {
          c.x = BORE_X + 1 + this.hoist.riders.indexOf(c) * 4;
          c.y = this.hoist.y + 9;
          const to = c.bound;
          if (to && Math.abs(this.hoist.y - this.postY(bands, to)) <= 3 && t < this.hoist.restUntil) {
            this.hoist.riders = this.hoist.riders.filter((r) => r !== c);
            c.post = to;
            c.bound = null;
            c.state = "walk";
            c.x = head;
            c.tx = this.wanderTo(c, bands);
          }
          break;
        }
      }
    }
  }

  /** Somewhere on this bench worth walking to — usually a machine on it. */
  private wanderTo(c: Crew, bands: Band[]): number {
    const band = bands.find((b) => b.zone === c.post.zone);
    if (!band) return c.x;
    const id = ZONES[c.post.zone]!.tiers[c.post.first ? 0 : 1];
    const slots = this.slots(id, band);
    if (slots.length > 0 && this.rng() < 0.8) {
      const slot = slots[Math.floor(this.rng() * slots.length)]!;
      return clamp(slot.x - 5, this.boreRight() + 2, SCENE_W - 8);
    }
    return this.boreRight() + 4 + this.rng() * (SCENE_W - this.boreRight() - 14);
  }

  private stepHoist(bands: Band[], t: number): void {
    const top = bands[0]!.bottom + 4;
    const floor = bands[bands.length - 1]!.top - 12;
    if (floor <= top) return;
    if (t < this.hoist.restUntil) return;

    this.hoist.y += this.hoist.dir * HOIST_SPEED * this.dt;
    if (this.hoist.y >= floor) {
      this.hoist.y = floor;
      this.hoist.dir = -1;
      this.hoist.restUntil = t + HOIST_REST_S;
    } else if (this.hoist.y <= top) {
      this.hoist.y = top;
      this.hoist.dir = 1;
      this.hoist.restUntil = t + HOIST_REST_S;
    }
    // Stop at every bench on the way past, whether or not anyone's waiting. A
    // cage that only stops when it's needed reads as teleporting.
    for (const post of this.posts(bands)) {
      const at = this.postY(bands, post);
      if (Math.abs(this.hoist.y - at) <= 2) {
        this.hoist.y = at;
        this.hoist.restUntil = t + HOIST_REST_S;
        break;
      }
    }
  }

  private drawHoist(bands: Band[]): void {
    const ctx = this.ctx;
    const cage = artCanvas(HOIST_CAGE);
    const x = BORE_X + 1;
    const top = bands[0]!.bottom;
    // The rope, all the way up to the head. It's what says the cage is hung
    // rather than hovering.
    ctx.fillStyle = rgba("#b8c0c8", 0.75);
    ctx.fillRect(x + 4, top, 1, Math.max(0, Math.round(this.hoist.y) - top));
    // Lit from inside, so a steel box in a black shaft is something you can find
    // without hunting for it — same reason the crew carry lamps.
    this.glow(x + 4, Math.round(this.hoist.y) + 6, 13, "#ffe6a0", 0.16);
    ctx.drawImage(cage.canvas, x, Math.round(this.hoist.y));
  }

  private drawCrew(): void {
    const ctx = this.ctx;
    for (const c of this.crew) {
      // Arms up on the ladder and at the face; down while walking or standing
      // about. Two poses is the whole animation budget at eleven pixels, and it's
      // enough as long as which one you see means something.
      const up = c.state === "ride" || c.state === "work";
      const art = artCanvas(up ? SHAFT_CREW_UP : SHAFT_CREW);
      const bob = c.state === "walk" ? Math.round(Math.sin(this.clock * 7 + c.phase) * 0.5) : 0;
      const x = Math.round(c.x);
      const y = Math.round(c.y) - art.h + bob;
      // The lamp, which is what makes them findable in the deep strata at all.
      this.glow(x + 3, y + 2, 9, "#ffe6a0", 0.22);
      ctx.drawImage(art.canvas, x, y);
    }
  }

  // --- The sump --------------------------------------------------------------

  /**
   * The hoard: a mound of potatoes at the front, with the flesh swelling up
   * around it into cysts as you get richer.
   *
   * The mound chases the real number rather than snapping to it, which is what
   * makes spending look like spending — buy a rung and you watch the pile come
   * down.
   */
  private drawHoard(sumpTop: number): void {
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
    for (let i = 0; i < cysts; i++) this.drawCyst(CYST_SLOTS[i]!, sumpTop, i);

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
   * A cyst is the one thing in either scene whose size is a *variable* — it's how
   * much of your hoard the tuber has grown around — so it's built from courses
   * rather than being ten sprites.
   *
   * It was a plain dome for a long time and it was the least legible object on
   * the canvas: a smooth pale blob with an outline, ten of them scattered across
   * an empty floor, holding nothing and never moving. Outside, a silo reads as
   * storage because you already know what a silo is; a dome has no such luck and
   * has to earn it. Three things do that here, and they're the parts to keep:
   *
   *  - **You can see the crop through it.** Potatoes packed inside, showing as
   *    dark rounds under a translucent skin. A container you can see into is a
   *    container. This is the whole fix; the rest is polish.
   *  - **It breathes.** A slow swell on a phase taken from its own slot, so a
   *    bank of them isn't pulsing in lockstep. Nothing else in the sump moves,
   *    and something that never moves reads as scenery.
   *  - **It's lit from the shaft**, like everything else down here, with a wet
   *    highlight — flesh rather than a UI shape sitting on top of the picture.
   */
  private drawCyst(slot: { x: number; row: number; w: number }, sumpTop: number, i: number): void {
    const ctx = this.ctx;
    const breathe = Math.sin(this.clock * 0.8 + i * 1.7);
    const base = sumpTop + 6 + slot.row * 6;
    const w = slot.w + (breathe > 0.6 ? 1 : 0);
    const courses = Math.max(2, Math.round(w / 2.4));
    const skin = mix(SUMP_SPOIL, "#e6dcc0", 0.4);

    // The skin, opaque. Drawing it translucent over the crop was the obvious way
    // round and it was wrong: a pale film at 60% over a dark sump comes out grey,
    // and a bank of grey blobs is less legible than the plain domes were. Opaque
    // skin first keeps the silhouette warm, and the crop goes *on* it — dimmed,
    // which reads as "under the surface" without spending the colour.
    for (let c = 0; c < courses; c++) {
      // Narrows faster near the crown, which is what makes it a dome and not a
      // ziggurat. Whole pixels: no rounding fudge on a 176-wide buffer.
      const inset = Math.round(Math.pow(c / courses, 1.5) * (w / 2));
      const span = w - inset * 2;
      if (span <= 0) break;
      const y = base - c;
      ctx.fillStyle = INK;
      ctx.fillRect(slot.x + inset - 1, y, span + 2, 1);
      ctx.fillStyle = c === courses - 1 ? mix(skin, "#f7f1dc", 0.55) : skin;
      ctx.fillRect(slot.x + inset, y, span, 1);
    }

    // What it's holding, showing through: packed rounds of crop, in the potato's
    // own colour so there's no doubt what's in there.
    const rng = mulberry32(0x9c + i * 71);
    for (let c = 1; c < courses - 1; c += 2) {
      const inset = Math.round(Math.pow(c / courses, 1.5) * (w / 2)) + 2;
      for (let x = slot.x + inset; x < slot.x + w - inset - 1; x += 4) {
        if (rng() < 0.2) continue;
        ctx.fillStyle = rgba("#8a5a24", 0.5);
        ctx.fillRect(x, base - c - 1, 3, 2);
        ctx.fillStyle = rgba("#c98b4b", 0.45);
        ctx.fillRect(x, base - c - 1, 2, 1);
      }
    }

    ctx.fillStyle = INK;
    ctx.fillRect(slot.x - 1, base + 1, w + 2, 1);
    // The wet highlight down its shaft-facing shoulder.
    ctx.fillStyle = rgba("#fff4e0", 0.55 + breathe * 0.15);
    ctx.fillRect(slot.x + 2, base - courses + 2, 1, Math.max(1, courses - 3));
    ctx.fillRect(slot.x + 3, base - courses + 1, 1, 1);
  }

  /**
   * What the tuber closed around, left where it stands in a strip along the
   * front. One strip of dead kit is a thing you notice from across the room;
   * the same units scattered among the working ones is not.
   *
   * It starts clear of the left corner, which is where the bore comes down into
   * the sump — the one thing down here that has to stay legible.
   */
  private drawBroken(sumpTop: number): void {
    const ctx = this.ctx;
    let x = Math.max(24, this.boreRight() + 6);
    for (const id of ORDER) {
      const n = shownCount(this.view.broken[id] ?? 0, CAP[id]);
      for (let i = 0; i < n; i++) {
        const dead = artTinted(this.mark(id), "#6b6b74", 0.62);
        if (x + dead.w > SCENE_W - 6) return;
        ctx.drawImage(dead.canvas, x, sumpTop - dead.h + 2);
        x += dead.w + 3;
      }
    }
  }

  // --- The reveal ------------------------------------------------------------

  /**
   * The floor giving way when a new stratum opens.
   *
   * Three of these across the endgame, which previously had no beats in it at
   * all after the fold — you bought eight rungs and the picture got denser. The
   * whole effect is a crack down the floor that was the bottom of the workings,
   * plus a lot of starch coming off it, over the same window `bandsFor` is easing
   * the new band in through. Cheap on purpose: the fold is the set piece, and
   * this must not try to compete with it.
   */
  private drawBreak(bands: Band[], t: number): void {
    if (this.revealAt === null) return;
    const ctx = this.ctx;
    const k = clamp((this.clock - this.revealAt) / REVEAL_S, 0, 1);
    const opening = bands.find((b) => b.zone === Math.ceil(this.openShown) - 1);
    const y = opening ? opening.bottom : bands[bands.length - 1]!.top;

    // The crack runs out from the bore, because that's where the cutting is.
    const reach = Math.round(k * SCENE_W * 1.15);
    for (let x = BORE_X; x < Math.min(SCENE_W, BORE_X + reach); x++) {
      const jag = Math.round(Math.sin(x * 0.7 + t) * 1.6);
      ctx.fillStyle = rgba(VOID, 0.85 * (1 - k * 0.4));
      ctx.fillRect(x, y - 2 + jag, 1, 3);
      if (Math.random() < 0.06) this.puff(x, y, (Math.random() - 0.5) * 20, -14);
    }
    // A flare along the break as it lets go.
    const flash = Math.max(0, 1 - Math.abs(k - 0.35) * 5);
    if (flash > 0) {
      ctx.fillStyle = rgba("#f7f1dc", 0.5 * flash);
      ctx.fillRect(0, y - 3, SCENE_W, 4);
    }
  }

  // --- Small things ----------------------------------------------------------

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

  /** The dark the shaft is in before anything of yours is standing in it. */
  private drawGloom(top: number, sumpTop: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = rgba("#140a10", GLOOM);
    ctx.fillRect(0, top, SCENE_W, this.sh - top);
    // The lid takes less: it's the closest thing to a source in the picture.
    ctx.fillStyle = rgba("#140a10", GLOOM * 0.35);
    ctx.fillRect(0, 0, SCENE_W, top);
    // And the sump is warmed rather than dimmed, because the hoard is the thing
    // you came back to look at.
    ctx.fillStyle = rgba("#f0c68c", 0.07);
    ctx.fillRect(0, sumpTop, SCENE_W, this.sh - sumpTop);
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
   * unit's index — a whole stratum of them pulsing in lockstep reads as a shader.
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
