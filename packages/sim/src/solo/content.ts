/**
 * Content for the solo homestead — a farm you keep, not a match you finish.
 *
 * Deliberately separate from the versus content set. That ladder is tuned so a
 * five-minute match can climb the whole thing; this one is tuned for a run that
 * goes for days and gets reset on purpose. Sharing one table would mean every
 * balance change to either mode silently retunes the other.
 */

import { P, type Potatoes } from "../numbers.js";

export type SoloProducerId =
  | "plot"
  | "hand"
  | "irrigation"
  | "tractor"
  | "harvester"
  | "lab"
  | "refinery"
  | "tower"
  | "seeder"
  | "reactor"
  | "orbital"
  | "singularity";

export interface SoloProducer {
  id: SoloProducerId;
  name: string;
  blurb: string;
  /** Potatoes per second, per unit owned, before any multipliers. */
  baseRate: number;
  baseCost: Potatoes;
  /** Cost of the Nth unit is baseCost * growth^N. */
  growth: number;
}

/**
 * Twelve rungs, each roughly 8x the output and 10x the price of the one below.
 * Payback climbs from ~15s at the bottom to ~6 minutes at the top, so the cheap
 * rungs stay buyable filler while the expensive ones are things you save for.
 * `solo.test.ts` is the check on that curve — retune here, run that.
 */
export const SOLO_PRODUCERS: readonly SoloProducer[] = [
  {
    id: "plot",
    name: "Potato Plot",
    blurb: "A patch of dirt. It does what dirt does.",
    baseRate: 1,
    baseCost: P.of(15),
    growth: 1.15,
  },
  {
    id: "hand",
    name: "Farmhand",
    blurb: "Pays for themselves. Eventually.",
    baseRate: 8,
    baseCost: P.of(160),
    growth: 1.15,
  },
  {
    id: "irrigation",
    name: "Irrigation Rig",
    blurb: "Water, on purpose, at the right time.",
    baseRate: 60,
    baseCost: P.of(1_600),
    growth: 1.15,
  },
  {
    id: "tractor",
    name: "Tractor",
    blurb: "Diesel-powered crop math.",
    baseRate: 450,
    baseCost: P.of(16_000),
    growth: 1.15,
  },
  {
    id: "harvester",
    name: "Combine Harvester",
    blurb: "Eats a field for breakfast.",
    baseRate: 3_400,
    baseCost: P.of(160_000),
    growth: 1.15,
  },
  {
    id: "lab",
    name: "Tuber Lab",
    blurb: "The potatoes are asking questions now.",
    baseRate: 26_000,
    baseCost: P.of(1_650_000),
    growth: 1.15,
  },
  {
    id: "refinery",
    name: "Starch Refinery",
    blurb: "Potatoes in one end, more potatoes out the other. Don't ask.",
    baseRate: 200_000,
    baseCost: P.of(17_000_000),
    growth: 1.15,
  },
  {
    id: "tower",
    name: "Hydroponic Tower",
    blurb: "Forty floors of dirt-free ambition.",
    baseRate: 1_500_000,
    baseCost: P.of(170_000_000),
    growth: 1.15,
  },
  {
    id: "seeder",
    name: "Cloud Seeder",
    blurb: "The weather works for you now. Mostly.",
    baseRate: 12_000_000,
    baseCost: P.of(1_800_000_000),
    growth: 1.15,
  },
  {
    id: "reactor",
    name: "Spud Fusion Reactor",
    blurb: "Binds four small potatoes into one enormous one.",
    baseRate: 90_000_000,
    baseCost: P.of(18_000_000_000),
    growth: 1.15,
  },
  {
    id: "orbital",
    name: "Orbital Greenhouse",
    blurb: "No frost in low earth orbit. Different problems up there.",
    baseRate: 700_000_000,
    baseCost: P.of(190_000_000_000),
    growth: 1.15,
  },
  {
    id: "singularity",
    name: "Tuber Singularity",
    blurb: "Grows potatoes that have always already been grown.",
    baseRate: 5_500_000_000,
    baseCost: P.of(2_000_000_000_000),
    growth: 1.15,
  },
];

export const SOLO_PRODUCER_BY_ID: Record<SoloProducerId, SoloProducer> = Object.fromEntries(
  SOLO_PRODUCERS.map((p) => [p.id, p]),
) as Record<SoloProducerId, SoloProducer>;

// ---------------------------------------------------------------------------
// Upgrades — one-time buys, gated on how much of a producer you own.
// ---------------------------------------------------------------------------

export type SoloUpgradeEffect =
  | { kind: "click_mult"; factor: number }
  | { kind: "global_mult"; factor: number }
  | { kind: "producer_mult"; producer: SoloProducerId; factor: number }
  /**
   * Ties digging to the farm you've built: a dig is worth this many seconds of
   * production. Without it, clicking is dead weight within the first hour and
   * the game stops having a verb.
   */
  | { kind: "click_from_rate"; seconds: number };

export interface SoloUpgrade {
  id: string;
  name: string;
  blurb: string;
  cost: Potatoes;
  effect: SoloUpgradeEffect;
  /** Hidden until the player owns this many of the producer. */
  requires?: { producer: SoloProducerId; count: number };
}

/** Two doublings per tier: one when you have a few, one when you're deep in. */
function tierUpgrades(): SoloUpgrade[] {
  // Priced against roughly 12 and 60 units owned of that tier — enough that a
  // doubling is a real chunk of your rate rather than rounding error.
  const naming: Record<SoloProducerId, [string, string]> = {
    plot: ["Raised Beds", "Terraced Slopes"],
    hand: ["Overtime Pay", "Profit Sharing"],
    irrigation: ["Drip Lines", "Aquifer Rights"],
    tractor: ["Turbo Diesel", "Autosteer"],
    harvester: ["Wider Header", "Night Shift Cab"],
    lab: ["Peer Review", "Tenure"],
    refinery: ["Catalytic Cracking", "Continuous Flow"],
    tower: ["Full Spectrum LEDs", "Nutrient Telemetry"],
    seeder: ["Silver Iodide", "Jet Stream Permit"],
    reactor: ["Magnetic Confinement", "Tritium Blanket"],
    orbital: ["Solar Sails", "Second Ring"],
    singularity: ["Closed Timelike Furrow", "Retroactive Yield"],
  };
  const out: SoloUpgrade[] = [];
  for (const prod of SOLO_PRODUCERS) {
    const [first, second] = naming[prod.id];
    out.push({
      id: `${prod.id}_x2a`,
      name: first,
      blurb: `${prod.name}s produce twice as much.`,
      cost: P.of(Math.ceil(prod.baseCost * 12)),
      effect: { kind: "producer_mult", producer: prod.id, factor: 2 },
      requires: { producer: prod.id, count: 10 },
    });
    out.push({
      id: `${prod.id}_x2b`,
      name: second,
      blurb: `${prod.name}s produce twice as much again.`,
      cost: P.of(Math.ceil(prod.baseCost * 400)),
      effect: { kind: "producer_mult", producer: prod.id, factor: 2 },
      requires: { producer: prod.id, count: 50 },
    });
  }
  return out;
}

const CLICK_UPGRADES: SoloUpgrade[] = [
  {
    id: "spade",
    name: "Sharpened Spade",
    blurb: "Digging, but with intent. Digs x3.",
    cost: P.of(100),
    effect: { kind: "click_mult", factor: 3 },
  },
  {
    id: "two_hand_spade",
    name: "Two-Handed Spade",
    blurb: "Both hands. Digs x5.",
    cost: P.of(3_000),
    effect: { kind: "click_mult", factor: 5 },
    requires: { producer: "hand", count: 5 },
  },
  {
    id: "gold_spade",
    name: "Ceremonial Gold Spade",
    blurb: "Impractical. Effective. Digs x8.",
    cost: P.of(150_000),
    effect: { kind: "click_mult", factor: 8 },
    requires: { producer: "tractor", count: 10 },
  },
  {
    id: "trowel",
    name: "Prospector's Trowel",
    blurb: "Each dig is also worth 1 second of production.",
    cost: P.of(2_000_000),
    effect: { kind: "click_from_rate", seconds: 1 },
    requires: { producer: "lab", count: 1 },
  },
  {
    id: "backhoe",
    name: "Pocket Backhoe",
    blurb: "Each dig is worth 5 more seconds of production.",
    cost: P.of(150_000_000),
    effect: { kind: "click_from_rate", seconds: 5 },
    requires: { producer: "tower", count: 10 },
  },
  {
    id: "hands_of_god",
    name: "The Big Hands",
    blurb: "Each dig is worth 30 more seconds of production.",
    cost: P.of(20_000_000_000),
    effect: { kind: "click_from_rate", seconds: 30 },
    requires: { producer: "orbital", count: 10 },
  },
];

const GLOBAL_UPGRADES: SoloUpgrade[] = [
  {
    id: "fertilizer",
    name: "Fertilizer",
    blurb: "Everything produces +50%.",
    cost: P.of(20_000),
    effect: { kind: "global_mult", factor: 1.5 },
    requires: { producer: "hand", count: 15 },
  },
  {
    id: "crop_rotation",
    name: "Crop Rotation",
    blurb: "Everything produces +50%.",
    cost: P.of(400_000),
    effect: { kind: "global_mult", factor: 1.5 },
    requires: { producer: "irrigation", count: 25 },
  },
  {
    id: "gmo_seed",
    name: "GMO Seed Stock",
    blurb: "Everything produces x2. Don't read the label.",
    cost: P.of(9_000_000),
    effect: { kind: "global_mult", factor: 2 },
    requires: { producer: "harvester", count: 20 },
  },
  {
    id: "co_op",
    name: "Growers' Co-op",
    blurb: "Everything produces x2.",
    cost: P.of(250_000_000),
    effect: { kind: "global_mult", factor: 2 },
    requires: { producer: "refinery", count: 25 },
  },
  {
    id: "subsidy",
    name: "Agricultural Subsidy",
    blurb: "Everything produces x2. Paperwork was involved.",
    cost: P.of(6_000_000_000),
    effect: { kind: "global_mult", factor: 2 },
    requires: { producer: "seeder", count: 25 },
  },
  {
    id: "monopoly",
    name: "Vertical Integration",
    blurb: "Everything produces x3.",
    cost: P.of(120_000_000_000),
    effect: { kind: "global_mult", factor: 3 },
    requires: { producer: "reactor", count: 25 },
  },
  {
    id: "terraform",
    name: "Terraforming Charter",
    blurb: "Everything produces x3.",
    cost: P.of(2_500_000_000_000),
    effect: { kind: "global_mult", factor: 3 },
    requires: { producer: "orbital", count: 25 },
  },
  {
    id: "ur_potato",
    name: "The Ur-Potato",
    blurb: "The first potato. Everything produces x5.",
    cost: P.of(60_000_000_000_000),
    effect: { kind: "global_mult", factor: 5 },
    requires: { producer: "singularity", count: 25 },
  },
];

export const SOLO_UPGRADES: readonly SoloUpgrade[] = [
  ...CLICK_UPGRADES,
  ...tierUpgrades(),
  ...GLOBAL_UPGRADES,
];

export const SOLO_UPGRADE_BY_ID: Record<string, SoloUpgrade> = Object.fromEntries(
  SOLO_UPGRADES.map((u) => [u.id, u]),
);

// ---------------------------------------------------------------------------
// Land — permanent infrastructure against the weather.
//
// The versus mode's defenses are timed absorb pools, which is the right shape
// for a five-minute fight you're watching. It's the wrong shape here: most
// weather lands while the tab is closed, so a shield with a 90-second window
// would protect nothing. These are levelled buildings that just keep working.
// ---------------------------------------------------------------------------

export type LandId = "windbreak" | "drainage" | "pest_control" | "insurance";

export type LandRole =
  /** Cuts how many units a disaster knocks offline. */
  | "breakage"
  /** Cuts how much soil health a disaster costs you. */
  | "soil"
  /** Stretches the gap between disasters. */
  | "frequency"
  /** Pays out potatoes when something goes wrong. */
  | "payout";

export interface Land {
  id: LandId;
  name: string;
  blurb: string;
  role: LandRole;
  /**
   * Per-level effectiveness. Levels compound as 1-(1-perLevel)^level, so they
   * stack with diminishing returns and never reach 1 — the weather is a cost of
   * doing business, not something you can buy your way out of.
   */
  perLevel: number;
  baseCost: Potatoes;
  growth: number;
}

export const LANDS: readonly Land[] = [
  {
    id: "windbreak",
    name: "Windbreak",
    blurb: "A wall of poplars. Storms take less of the kit.",
    role: "breakage",
    perLevel: 0.14,
    baseCost: P.of(600),
    growth: 1.9,
  },
  {
    id: "drainage",
    name: "Drainage Ditches",
    blurb: "Water leaves instead of sitting there taking your topsoil.",
    role: "soil",
    perLevel: 0.14,
    baseCost: P.of(2_500),
    growth: 1.9,
  },
  {
    id: "pest_control",
    name: "Pest Control Contract",
    blurb: "Someone else's problem now. Trouble comes around less often.",
    role: "frequency",
    perLevel: 0.1,
    baseCost: P.of(9_000),
    growth: 2.1,
  },
  {
    id: "insurance",
    name: "Crop Insurance",
    blurb: "Doesn't stop anything. Does cut you a cheque afterwards.",
    role: "payout",
    perLevel: 0.12,
    baseCost: P.of(40_000),
    growth: 1.9,
  },
];

export const LAND_BY_ID: Record<LandId, Land> = Object.fromEntries(
  LANDS.map((l) => [l.id, l]),
) as Record<LandId, Land>;

/** However much land you buy, weather still gets through this much. */
export const MAX_MITIGATION = 0.85;

// ---------------------------------------------------------------------------
// Soil, damage, and the cost of putting things right.
// ---------------------------------------------------------------------------

/** Base potatoes per dig, before any multipliers. */
export const SOLO_BASE_CLICK = P.of(1);

/**
 * Soil health multiplies your whole farm and only ever goes down on its own.
 * Nothing brings it back but spending — that's the "force of nature" bargain:
 * the land degrades, and staying productive means paying to hold it steady.
 */
export const MAX_SOIL = 1;

/** Floor on soil health, so a long time away is a setback and never a wipe. */
export const MIN_SOIL = 0.25;

/**
 * Restoring soil is priced against your production rate rather than a fixed
 * table, so it stays a real decision at every scale instead of becoming free
 * the moment you out-grow it.
 *
 * The number is a payback time: fixing the dirt buys back its own price in this
 * many seconds. It has to sit in the same league as `REPAIR_SECONDS`, or the
 * two halves of the same mechanic quote wildly different prices for the same
 * lost potato. At two hours it was never the right buy at any scale — the
 * weather's soil half was a tax with no move attached.
 */
export const SOIL_RESTORE_SECONDS = 1_200;

/** Discount on the quoted repair price. See `repairCost` for what's quoted. */
export const SOLO_REPAIR_COST_FRACTION = 0.7;

/**
 * Repairs are billed as this many seconds of the production they give back.
 * The single knob for how much weather actually costs — raise it and damage
 * bites harder without touching how often anything breaks.
 */
export const REPAIR_SECONDS = 600;

/** No single disaster can break more than this share of a producer type. */
export const SOLO_MAX_BROKEN_SHARE = 0.5;
