import { P, seconds, type Potatoes } from "./numbers.js";

export type ProducerId =
  | "plot"
  | "hand"
  | "irrigation"
  | "tractor"
  | "harvester"
  | "lab";

export interface Producer {
  id: ProducerId;
  name: string;
  blurb: string;
  /** Potatoes per second, per unit owned, before multipliers. */
  baseRate: number;
  baseCost: Potatoes;
  /** Cost of the Nth unit is baseCost * growth^N. */
  growth: number;
}

export const PRODUCERS: readonly Producer[] = [
  {
    id: "plot",
    name: "Potato Plot",
    blurb: "A patch of dirt. It does what dirt does.",
    baseRate: 0.2,
    baseCost: P.of(15),
    growth: 1.15,
  },
  {
    id: "hand",
    name: "Farmhand",
    blurb: "Pays for themselves. Eventually.",
    baseRate: 1.5,
    baseCost: P.of(120),
    growth: 1.15,
  },
  {
    id: "irrigation",
    name: "Irrigation Rig",
    blurb: "Water, on purpose, at the right time.",
    baseRate: 9,
    baseCost: P.of(1_400),
    growth: 1.15,
  },
  {
    id: "tractor",
    name: "Tractor",
    blurb: "Diesel-powered crop math.",
    baseRate: 55,
    baseCost: P.of(18_000),
    growth: 1.15,
  },
  {
    id: "harvester",
    name: "Combine Harvester",
    blurb: "Eats a field for breakfast.",
    baseRate: 340,
    baseCost: P.of(220_000),
    growth: 1.15,
  },
  {
    id: "lab",
    name: "Tuber Lab",
    blurb: "The potatoes are asking questions now.",
    baseRate: 2_000,
    baseCost: P.of(3_000_000),
    growth: 1.15,
  },
];

export const PRODUCER_BY_ID: Record<ProducerId, Producer> = Object.fromEntries(
  PRODUCERS.map((p) => [p.id, p]),
) as Record<ProducerId, Producer>;

// ---------------------------------------------------------------------------
// Production upgrades — one-time buys, the classic ladder.
// ---------------------------------------------------------------------------

export type UpgradeId =
  | "spade"
  | "two_hand_spade"
  | "gold_spade"
  | "fertilizer"
  | "crop_rotation"
  | "gmo_seed"
  | "raised_beds"
  | "overtime_pay"
  | "drip_lines"
  | "turbo_diesel";

export type UpgradeEffect =
  | { kind: "click_mult"; factor: number }
  | { kind: "global_mult"; factor: number }
  | { kind: "producer_mult"; producer: ProducerId; factor: number };

export interface Upgrade {
  id: UpgradeId;
  name: string;
  blurb: string;
  cost: Potatoes;
  effect: UpgradeEffect;
  /** Hidden until the player owns this many of the producer. */
  requires?: { producer: ProducerId; count: number };
}

export const UPGRADES: readonly Upgrade[] = [
  {
    id: "spade",
    name: "Sharpened Spade",
    blurb: "Digging, but with intent. Clicks x3.",
    cost: P.of(150),
    effect: { kind: "click_mult", factor: 3 },
  },
  {
    id: "two_hand_spade",
    name: "Two-Handed Spade",
    blurb: "Both hands. Clicks x5.",
    cost: P.of(9_000),
    effect: { kind: "click_mult", factor: 5 },
    requires: { producer: "hand", count: 5 },
  },
  {
    id: "gold_spade",
    name: "Ceremonial Gold Spade",
    blurb: "Impractical. Effective. Clicks x8.",
    cost: P.of(750_000),
    effect: { kind: "click_mult", factor: 8 },
    requires: { producer: "tractor", count: 10 },
  },
  {
    id: "raised_beds",
    name: "Raised Beds",
    blurb: "Plots produce twice as much.",
    cost: P.of(600),
    effect: { kind: "producer_mult", producer: "plot", factor: 2 },
    requires: { producer: "plot", count: 10 },
  },
  {
    id: "overtime_pay",
    name: "Overtime Pay",
    blurb: "Farmhands produce twice as much.",
    cost: P.of(4_500),
    effect: { kind: "producer_mult", producer: "hand", factor: 2 },
    requires: { producer: "hand", count: 10 },
  },
  {
    id: "fertilizer",
    name: "Fertilizer",
    blurb: "All producers +50%.",
    cost: P.of(12_000),
    effect: { kind: "global_mult", factor: 1.5 },
    requires: { producer: "hand", count: 15 },
  },
  {
    id: "drip_lines",
    name: "Drip Lines",
    blurb: "Irrigation rigs produce twice as much.",
    cost: P.of(40_000),
    effect: { kind: "producer_mult", producer: "irrigation", factor: 2 },
    requires: { producer: "irrigation", count: 10 },
  },
  {
    id: "crop_rotation",
    name: "Crop Rotation",
    blurb: "All producers +50%.",
    cost: P.of(180_000),
    effect: { kind: "global_mult", factor: 1.5 },
    requires: { producer: "irrigation", count: 15 },
  },
  {
    id: "turbo_diesel",
    name: "Turbo Diesel",
    blurb: "Tractors produce twice as much.",
    cost: P.of(500_000),
    effect: { kind: "producer_mult", producer: "tractor", factor: 2 },
    requires: { producer: "tractor", count: 10 },
  },
  {
    id: "gmo_seed",
    name: "GMO Seed Stock",
    blurb: "All producers x2. Don't read the label.",
    cost: P.of(4_000_000),
    effect: { kind: "global_mult", factor: 2 },
    requires: { producer: "harvester", count: 10 },
  },
];

export const UPGRADE_BY_ID: Record<UpgradeId, Upgrade> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
) as Record<UpgradeId, Upgrade>;

// ---------------------------------------------------------------------------
// Sabotage. `power` is what gets weighed against a defender's shield pool —
// a defense with at least this much left absorbs the attack outright.
// ---------------------------------------------------------------------------

export type AttackId = "moles" | "blight" | "drought" | "soil_rot" | "locusts";

export type AttackEffect =
  /** Takes potatoes off the pile. Never touches lifetime harvested. */
  | { kind: "steal"; minPct: number; maxPct: number }
  /** Cuts total output by `cut` (0..1) for a while. */
  | { kind: "slow"; cut: number; durationMs: number }
  /** Shuts off the target's single biggest earner. */
  | { kind: "disable"; durationMs: number };

export interface Attack {
  id: AttackId;
  name: string;
  blurb: string;
  power: number;
  baseCost: Potatoes;
  /** Repeat use gets pricier — this is the only thing pacing sabotage. */
  growth: number;
  effect: AttackEffect;
}

export const ATTACKS: readonly Attack[] = [
  {
    id: "moles",
    name: "Moles",
    blurb: "Skims potatoes off their pile. Cheap, rude.",
    power: 40,
    baseCost: P.of(250),
    growth: 1.4,
    effect: { kind: "steal", minPct: 0.08, maxPct: 0.16 },
  },
  {
    id: "blight",
    name: "Potato Blight",
    blurb: "-35% output for 45s.",
    power: 110,
    baseCost: P.of(3_000),
    growth: 1.4,
    effect: { kind: "slow", cut: 0.35, durationMs: seconds(45) },
  },
  {
    id: "drought",
    name: "Drought",
    blurb: "-60% output for 30s.",
    power: 260,
    baseCost: P.of(35_000),
    growth: 1.4,
    effect: { kind: "slow", cut: 0.6, durationMs: seconds(30) },
  },
  {
    id: "soil_rot",
    name: "Ruined Soil",
    blurb: "Shuts down their best producer for 40s.",
    power: 420,
    baseCost: P.of(300_000),
    growth: 1.45,
    effect: { kind: "disable", durationMs: seconds(40) },
  },
  {
    id: "locusts",
    name: "Locust Swarm",
    blurb: "-75% output for 60s. They'll feel this one.",
    power: 750,
    baseCost: P.of(2_500_000),
    growth: 1.45,
    effect: { kind: "slow", cut: 0.75, durationMs: seconds(60) },
  },
];

export const ATTACK_BY_ID: Record<AttackId, Attack> = Object.fromEntries(
  ATTACKS.map((a) => [a.id, a]),
) as Record<AttackId, Attack>;

// ---------------------------------------------------------------------------
// Defense. `power` is an absorb pool, not a flag: it soaks incoming attack
// power until it runs dry or the window closes.
// ---------------------------------------------------------------------------

export type DefenseId = "scarecrow" | "fence" | "greenhouse" | "insurance";

export interface Defense {
  id: DefenseId;
  name: string;
  blurb: string;
  power: number;
  durationMs: number;
  baseCost: Potatoes;
  growth: number;
}

export const DEFENSES: readonly Defense[] = [
  {
    id: "scarecrow",
    name: "Scarecrow",
    blurb: "Absorbs 60 power for 90s.",
    power: 60,
    durationMs: seconds(90),
    baseCost: P.of(350),
    growth: 1.35,
  },
  {
    id: "fence",
    name: "Electric Fence",
    blurb: "Absorbs 200 power for 2m.",
    power: 200,
    durationMs: seconds(120),
    baseCost: P.of(5_000),
    growth: 1.35,
  },
  {
    id: "greenhouse",
    name: "Greenhouse",
    blurb: "Absorbs 550 power for 2m30s.",
    power: 550,
    durationMs: seconds(150),
    baseCost: P.of(75_000),
    growth: 1.4,
  },
  {
    id: "insurance",
    name: "Crop Insurance",
    blurb: "Absorbs 1400 power for 3m.",
    power: 1_400,
    durationMs: seconds(180),
    baseCost: P.of(800_000),
    growth: 1.4,
  },
];

export const DEFENSE_BY_ID: Record<DefenseId, Defense> = Object.fromEntries(
  DEFENSES.map((d) => [d.id, d]),
) as Record<DefenseId, Defense>;

// ---------------------------------------------------------------------------

/** Base potatoes per click, before click multipliers. */
export const BASE_CLICK = P.of(1);

/**
 * No knockouts (VISION.md): stacked sabotage can never take a farm below this
 * fraction of its clean rate.
 */
export const MIN_RATE_MULTIPLIER = 0.15;

/** And a single steal can never take more than this share of the pile. */
export const MAX_STEAL_PCT = 0.25;
