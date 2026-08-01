/**
 * Content for the solo homestead — a farm you keep, not a match you finish.
 *
 * Deliberately separate from the versus content set. That ladder is tuned so a
 * five-minute match can climb the whole thing; this one is tuned for a run that
 * goes for days and gets reset on purpose. Sharing one table would mean every
 * balance change to either mode silently retunes the other.
 */

import { P, type Potatoes } from "../numbers.js";

/**
 * The two places a farm exists in.
 *
 * `outside` is the homestead you started with — fields, sky, weather. `inside`
 * is what the Convergence opens: the flesh of the potato you turn out to have
 * always been standing in. After the fold you own both at once. The outside
 * farm keeps producing whether you're looking at it or not, and the inside is a
 * fresh ladder with its own shop, its own land, and its own picture.
 *
 * `FarmState.world` is only ever "which one am I looking at". It has no effect
 * on production — see `currentRate`, which sums the lot.
 */
export type World = "outside" | "inside";

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
  | "singularity"
  | "furrow"
  | "eyes"
  | "starch"
  | "mantle"
  | "vein"
  | "chorus"
  | "skin"
  | "second";

export interface SoloProducer {
  id: SoloProducerId;
  name: string;
  blurb: string;
  /**
   * What a damaged one of these is, and what putting it right is called. A
   * tractor breaks; a farmhand doesn't, and a chorus of other yous really
   * doesn't. Reads as "2 maimed" and "Patch up Farmhand".
   */
  hurt: string;
  mend: string;
  /** Potatoes per second, per unit owned, before any multipliers. */
  baseRate: number;
  baseCost: Potatoes;
  /** Cost of the Nth unit is baseCost * growth^N. */
  growth: number;
  /**
   * Which of the two farms it stands on. Everything `inside` is hidden and
   * unbuyable until the Convergence, which is enforced in `applyFarmCommand`
   * rather than only in the shop — the sim is the authority on what a farm is
   * allowed to own.
   */
  world: World;
  /**
   * Rate scales with soil health *as well as* being multiplied by it, so
   * restoring the dirt is a live decision at the top of the ladder instead of a
   * rounding error. Soil only moves on weather events and purchases, so this
   * leaves the rate piecewise-constant — which is what the whole offline model
   * rests on.
   */
  soilScaled?: boolean;
  /** Rate scales with `generation`. Every farm you handed down is still working. */
  generationScaled?: boolean;
  /**
   * Stretches the gap between weather events, per unit owned, on the same
   * `1-(1-p)^n` shape the land buildings use and under the same clamp. Small:
   * a hundred of these must not zero the weather.
   */
  calmPerUnit?: number;
}

/**
 * Twelve rungs, each 8x the output and ~14-18x the price of the one below.
 *
 * The gap is the pace control for the whole run. Payback climbs from 20s at
 * the bottom rung to many hours at the top, so cheap rungs stay buyable filler
 * while expensive ones are things you save days for. Growth is 1.19 rather
 * than the previous 1.16 — the compounding difference across 50+ units is
 * substantial, and the upper-tier base costs are higher too, keeping a
 * determined player busy for several real-world days before the ladder is
 * cleared. `solo.test.ts` is the check on this curve — retune here, run that.
 */
export const SOLO_PRODUCERS: readonly SoloProducer[] = [
  {
    id: "plot",
    name: "Potato Plot",
    blurb: "A patch of dirt. It does what dirt does.",
    hurt: "trampled",
    mend: "Turn over",
    baseRate: 1,
    baseCost: P.of(20),
    growth: 1.19,
    world: "outside",
  },
  {
    id: "hand",
    name: "Farmhand",
    blurb: "Pays for themselves. Eventually.",
    hurt: "maimed",
    mend: "Patch up",
    baseRate: 8,
    baseCost: P.of(280),
    growth: 1.19,
    world: "outside",
  },
  {
    id: "irrigation",
    name: "Irrigation Rig",
    blurb: "Water, on purpose, at the right time.",
    hurt: "burst",
    mend: "Repair",
    baseRate: 60,
    baseCost: P.of(3_600),
    growth: 1.19,
    world: "outside",
  },
  {
    id: "tractor",
    name: "Tractor",
    blurb: "Diesel-powered crop math.",
    hurt: "broken",
    mend: "Repair",
    baseRate: 450,
    baseCost: P.of(52_000),
    growth: 1.19,
    world: "outside",
  },
  {
    id: "harvester",
    name: "Combine Harvester",
    blurb: "Eats a field for breakfast.",
    hurt: "jammed",
    mend: "Unjam",
    baseRate: 3_400,
    baseCost: P.of(800_000),
    growth: 1.19,
    world: "outside",
  },
  {
    id: "lab",
    name: "Tuber Lab",
    blurb: "The potatoes are asking questions now.",
    hurt: "contaminated",
    mend: "Decontaminate",
    baseRate: 26_000,
    baseCost: P.of(12_000_000),
    growth: 1.19,
    world: "outside",
  },
  {
    id: "refinery",
    name: "Starch Refinery",
    blurb: "Potatoes in one end, more potatoes out the other. Don't ask.",
    hurt: "clogged",
    mend: "Unclog",
    baseRate: 200_000,
    baseCost: P.of(200_000_000),
    growth: 1.19,
    world: "outside",
  },
  {
    id: "tower",
    name: "Hydroponic Tower",
    blurb: "Forty floors of dirt-free ambition.",
    hurt: "shorted",
    mend: "Rewire",
    baseRate: 1_500_000,
    baseCost: P.of(3_200_000_000),
    growth: 1.19,
    world: "outside",
  },
  {
    id: "seeder",
    name: "Cloud Seeder",
    blurb: "The weather works for you now. Mostly.",
    hurt: "grounded",
    mend: "Get flying",
    baseRate: 12_000_000,
    baseCost: P.of(50_000_000_000),
    growth: 1.19,
    world: "outside",
  },
  {
    id: "reactor",
    name: "Spud Fusion Reactor",
    blurb: "Binds four small potatoes into one enormous one.",
    hurt: "scrammed",
    mend: "Restart",
    baseRate: 90_000_000,
    baseCost: P.of(800_000_000_000),
    growth: 1.19,
    world: "outside",
  },
  {
    id: "orbital",
    name: "Orbital Greenhouse",
    blurb: "No frost in low earth orbit. Different problems up there.",
    hurt: "holed",
    mend: "Reseal",
    baseRate: 700_000_000,
    baseCost: P.of(13_000_000_000_000),
    growth: 1.19,
    world: "outside",
  },
  {
    id: "singularity",
    name: "Tuber Singularity",
    blurb: "Grows potatoes that have always already been grown.",
    hurt: "collapsed",
    mend: "Re-open",
    baseRate: 5_500_000_000,
    baseCost: P.of(200_000_000_000_000),
    growth: 1.19,
    world: "outside",
  },

  // --- Inside the potato ---------------------------------------------------
  //
  // The second farm, and the reason the Convergence is worth reaching: a ladder
  // of its own, standing in flesh rather than dirt, bought with the potatoes
  // the old farm is still turning out while you're down here.
  //
  // It used to be four rungs bolted onto the end of the outside ladder, which
  // made the whole endgame "four more rows in the same shop". Eight now, over
  // the same span from the Tuber Singularity to the Second Potato — so no rung
  // moved at either end and the run is the length it always was, but the inside
  // is a climb you can spend time on rather than four purchases. Cost steps by
  // ~3.8x and output by ~2.8x per rung, which keeps payback rising the whole way
  // up exactly as the outside ladder's 14x/8x does.
  //
  // The first one is deliberately affordable more or less on arrival. Walking
  // into a new world and being able to buy the bottom of its shop is the point:
  // it's a place you start over in, not a wing of the old farm.
  {
    id: "furrow",
    name: "Inversion Furrow",
    blurb: "Ploughs the ceiling. Whatever falls, falls up now, which helps.",
    hurt: "caved",
    mend: "Re-plough",
    baseRate: 15_000_000_000,
    baseCost: P.of(750_000_000_000_000),
    growth: 1.19,
    world: "inside",
    // The one thing at the top of the ladder that feeds back into the land
    // half, which otherwise caps at four buildings and stops mattering.
    calmPerUnit: 0.004,
  },
  {
    id: "eyes",
    name: "Sprouting Eye",
    blurb: "It was always going to grow. Nobody said out of what.",
    hurt: "blinded",
    mend: "Coax open",
    baseRate: 42_000_000_000,
    baseCost: P.of(2_800_000_000_000_000),
    growth: 1.19,
    world: "inside",
  },
  {
    id: "starch",
    name: "Starch Seam",
    blurb: "A pale reef of the stuff, quarried by the tonne.",
    hurt: "collapsed",
    mend: "Shore up",
    baseRate: 120_000_000_000,
    baseCost: P.of(10_600_000_000_000_000),
    growth: 1.19,
    world: "inside",
  },
  {
    id: "mantle",
    name: "Mantle Tap",
    blurb: "A shaft into the deep flesh. It goes further than you'd like.",
    hurt: "clotted",
    mend: "Re-bore",
    baseRate: 340_000_000_000,
    baseCost: P.of(40_000_000_000_000_000),
    growth: 1.19,
    world: "inside",
    soilScaled: true,
  },
  {
    id: "vein",
    name: "Phloem Vein",
    blurb: "Tap the plumbing and it feeds you instead. It doesn't seem to mind.",
    hurt: "clamped",
    mend: "Unclamp",
    baseRate: 960_000_000_000,
    baseCost: P.of(150_000_000_000_000_000),
    growth: 1.19,
    world: "inside",
  },
  {
    id: "chorus",
    name: "Chorus",
    blurb: "The other yous, still working. You can hear them.",
    hurt: "silenced",
    mend: "Call back",
    baseRate: 2_700_000_000_000,
    baseCost: P.of(560_000_000_000_000_000),
    growth: 1.19,
    world: "inside",
    generationScaled: true,
  },
  {
    id: "skin",
    name: "Periderm Gate",
    blurb: "A door cut in the inside of the skin. It looks out on more flesh.",
    hurt: "scarred over",
    mend: "Cut open",
    baseRate: 7_700_000_000_000,
    baseCost: P.of(2_100_000_000_000_000_000),
    growth: 1.19,
    world: "inside",
  },
  {
    id: "second",
    name: "Second Potato",
    blurb: "Hangs where the sun was. Nobody has asked what's inside it.",
    hurt: "bruised",
    mend: "Tend",
    baseRate: 22_000_000_000_000,
    baseCost: P.of(8_000_000_000_000_000_000),
    growth: 1.19,
    world: "inside",
  },
];

/** The rungs that stand in one world or the other, in ladder order. */
export function producersIn(world: World): readonly SoloProducer[] {
  return SOLO_PRODUCERS.filter((p) => p.world === world);
}

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
   *
   * The seconds are deliberately fractional. This effect is a feedback loop —
   * income scales with the rate it's spent on — so at a whole second per dig a
   * player clicking twice a second is worth twice the entire farm, and the
   * whole ladder falls over in half an hour. Everything here is meant to sum to
   * a couple of seconds at most, even fully perked.
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

/**
 * What the first `count` of a producer cost, from nothing.
 *
 * Upgrade prices are quoted against this rather than as absolute numbers, so
 * they mean "about what the fleet that unlocked this cost you" at every rung
 * and stay honest when the ladder gets retuned. As flat constants they drifted
 * every time: an upgrade priced for a 170M tier is a giveaway once that tier
 * costs 1.1B, and giveaways are how a day-long run turns into an hour.
 */
function fleetCost(id: SoloProducerId, count: number, share = 1): Potatoes {
  const prod = SOLO_PRODUCERS.find((p) => p.id === id)!;
  const units = (Math.pow(prod.growth, count) - 1) / (prod.growth - 1);
  return P.of(Math.ceil(prod.baseCost * units * share));
}

/**
 * Three boosts per tier: one when you have a few, one when you're deep in, and
 * one for the players who go all the way in on a rung.
 *
 * The first is a doubling (x2) gated on owning ten units.
 * The second is a +50% boost (x1.5) gated on fifty units — not another
 * doubling. Stacking two doublings per tier meant every tier self-amplified
 * 4x the moment you were deep in it, which is a big part of why the ladder
 * used to evaporate.
 * The third is a doubling again, gated on **a hundred**. That gate is the whole
 * design: a hundred of anything is a full day of aiming at one rung rather than
 * spreading, so the reward is allowed to be loud — and it's the only upgrade in
 * the game that changes the silhouette of the thing rather than its paint.
 *
 * All three are priced against the fleet you must already own.
 */
function tierUpgrades(): SoloUpgrade[] {
  const naming: Record<SoloProducerId, [string, string, string]> = {
    plot: ["Raised Beds", "Terraced Slopes", "Heirloom Strain"],
    hand: ["Overtime Pay", "Profit Sharing", "Equity Stake"],
    irrigation: ["Drip Lines", "Aquifer Rights", "Centre Pivot"],
    tractor: ["Turbo Diesel", "Autosteer", "Tracked Chassis"],
    harvester: ["Wider Header", "Night Shift Cab", "Twin Rotor"],
    lab: ["Peer Review", "Tenure", "The Prize"],
    refinery: ["Catalytic Cracking", "Continuous Flow", "Cogeneration"],
    tower: ["Full Spectrum LEDs", "Nutrient Telemetry", "Cloud Deck"],
    seeder: ["Silver Iodide", "Jet Stream Permit", "Eye of the Storm"],
    reactor: ["Magnetic Confinement", "Tritium Blanket", "Ignition"],
    orbital: ["Solar Sails", "Second Ring", "Lagrange Station"],
    singularity: ["Closed Timelike Furrow", "Retroactive Yield", "Event Horizon Lease"],
    furrow: ["Reversed Gravity", "Ceiling Yield", "Second Pass"],
    eyes: ["Wider Aperture", "Lidless", "It Sees the Whole Field"],
    starch: ["Longwall Cut", "Deep Adit", "The Seam Goes Down"],
    mantle: ["Deep Core Sampling", "Geothermal Assist", "Core Breach"],
    vein: ["Wider Bore", "Reverse Flow", "The Whole Circulation"],
    chorus: ["Perfect Unison", "Every Generation", "All At Once"],
    skin: ["Held Open", "Second Door", "The Skin Stops Closing"],
    second: ["Seed Stock", "It's Started", "It's Awake"],
  };
  const out: SoloUpgrade[] = [];
  for (const prod of SOLO_PRODUCERS) {
    const [first, second, third] = naming[prod.id];
    out.push({
      id: `${prod.id}_x2a`,
      name: first,
      blurb: `${prod.name}s produce twice as much.`,
      cost: fleetCost(prod.id, 10),
      effect: { kind: "producer_mult", producer: prod.id, factor: 2 },
      requires: { producer: prod.id, count: 10 },
    });
    out.push({
      id: `${prod.id}_x2b`,
      name: second,
      blurb: `${prod.name}s produce 50% more.`,
      cost: fleetCost(prod.id, 50, 0.4),
      effect: { kind: "producer_mult", producer: prod.id, factor: 1.5 },
      requires: { producer: prod.id, count: 50 },
    });
    out.push({
      id: `${prod.id}_x2c`,
      name: third,
      blurb: `${prod.name}s produce twice as much — and stop looking like the old ones.`,
      cost: fleetCost(prod.id, 100, 1.2),
      effect: { kind: "producer_mult", producer: prod.id, factor: 2 },
      requires: { producer: prod.id, count: 100 },
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
    cost: fleetCost("hand", 5),
    effect: { kind: "click_mult", factor: 5 },
    requires: { producer: "hand", count: 5 },
  },
  {
    id: "gold_spade",
    name: "Ceremonial Gold Spade",
    blurb: "Impractical. Effective. Digs x8.",
    cost: fleetCost("tractor", 10),
    effect: { kind: "click_mult", factor: 8 },
    requires: { producer: "tractor", count: 10 },
  },
  {
    id: "trowel",
    name: "Prospector's Trowel",
    blurb: "Each dig is also worth 0.25 seconds of production.",
    cost: fleetCost("lab", 5, 1.5),
    effect: { kind: "click_from_rate", seconds: 0.25 },
    requires: { producer: "lab", count: 5 },
  },
  {
    id: "backhoe",
    name: "Pocket Backhoe",
    blurb: "Each dig is worth 0.5 more seconds of production.",
    cost: fleetCost("tower", 10, 1.5),
    effect: { kind: "click_from_rate", seconds: 0.5 },
    requires: { producer: "tower", count: 10 },
  },
  {
    id: "hands_of_god",
    name: "The Big Hands",
    blurb: "Each dig is worth 0.75 more seconds of production.",
    cost: fleetCost("orbital", 10, 1.5),
    effect: { kind: "click_from_rate", seconds: 0.75 },
    requires: { producer: "orbital", count: 10 },
  },
];

/**
 * Global multipliers deliberately kept modest, and deliberately **dear**.
 *
 * Two separate knobs, and they got out of step. The factor is small — 1.3 to 2,
 * where an early draft had a x2/x3/x5 chain that evaporated a week-long run in
 * an afternoon. But the *price* had drifted down to a few hundred seconds of
 * production, so the thing that permanently lifts every rung of the ladder at
 * once cost less than the rung you were standing on. These are now priced in the
 * thousands of seconds each: a global is something you stop and save for, on
 * roughly the scale the Ur-Potato always was, and passing one over to keep
 * climbing has to be a real option.
 *
 * The shares below look arbitrary because they are: each is tuned so the upgrade
 * lands in that band at the moment its gate opens, and the fleet it's quoted
 * against sits at wildly different points on the curve from one rung to the next.
 * `solo.test.ts` holds the floor; `probe` in this package's history is how the
 * band was measured.
 */
const GLOBAL_UPGRADES: SoloUpgrade[] = [
  {
    id: "fertilizer",
    name: "Fertilizer",
    blurb: "Everything produces +30%.",
    cost: fleetCost("hand", 15, 340),
    effect: { kind: "global_mult", factor: 1.3 },
    requires: { producer: "hand", count: 15 },
  },
  {
    id: "crop_rotation",
    name: "Crop Rotation",
    blurb: "Everything produces +30%.",
    cost: fleetCost("irrigation", 25, 190),
    effect: { kind: "global_mult", factor: 1.3 },
    requires: { producer: "irrigation", count: 25 },
  },
  {
    id: "gmo_seed",
    name: "GMO Seed Stock",
    blurb: "Everything produces +50%. Don't read the label.",
    cost: fleetCost("harvester", 20, 42),
    effect: { kind: "global_mult", factor: 1.5 },
    requires: { producer: "harvester", count: 20 },
  },
  {
    id: "co_op",
    name: "Growers' Co-op",
    blurb: "Everything produces +50%.",
    cost: fleetCost("refinery", 25, 14),
    effect: { kind: "global_mult", factor: 1.5 },
    requires: { producer: "refinery", count: 25 },
  },
  {
    id: "subsidy",
    name: "Agricultural Subsidy",
    blurb: "Everything produces +50%. Paperwork was involved.",
    cost: fleetCost("seeder", 25, 5),
    effect: { kind: "global_mult", factor: 1.5 },
    requires: { producer: "seeder", count: 25 },
  },
  {
    id: "monopoly",
    name: "Vertical Integration",
    blurb: "Everything produces x2.",
    cost: fleetCost("reactor", 25, 3),
    effect: { kind: "global_mult", factor: 2 },
    requires: { producer: "reactor", count: 25 },
  },
  {
    id: "terraform",
    name: "Terraforming Charter",
    blurb: "Everything produces x2.",
    cost: fleetCost("orbital", 25, 6),
    effect: { kind: "global_mult", factor: 2 },
    requires: { producer: "orbital", count: 25 },
  },
  /**
   * The Convergence, on a button the player chose to press.
   *
   * Gated at ten Tuber Singularities rather than twenty-five, which is what
   * pulls the endgame from five days of play to three and puts the fold inside
   * a single dedicated first run — the constraint the whole endgame design is
   * binding on. It still costs about a thousand seconds of production at the
   * moment it's bought, which is the same league as the other late globals and
   * well clear of the sixty-second floor `solo.test.ts` guards.
   */
  {
    id: "ur_potato",
    name: "The Ur-Potato",
    /**
     * The only upgrade in the game that doesn't say what it does.
     *
     * Every other blurb is a price tag's other half — you read the number, you
     * read the multiplier, you decide. This one isn't a decision, and quoting
     * "everything produces x2" next to it puts it back on the same shelf as
     * Fertilizer at the exact moment the game most needs it off that shelf.
     * It still doubles everything; the shop just doesn't lead with it.
     */
    blurb: "The first potato. Everything since has been a copy.",
    cost: fleetCost("singularity", 10),
    effect: { kind: "global_mult", factor: 2 },
    requires: { producer: "singularity", count: 10 },
  },
  {
    id: "ceiling_rights",
    name: "Ceiling Tenancy",
    blurb: "The roof is yours to work too. Everything produces x2.",
    cost: fleetCost("furrow", 25, 5),
    effect: { kind: "global_mult", factor: 2 },
    requires: { producer: "furrow", count: 25 },
  },
  {
    id: "mineral_rights",
    name: "Mineral Rights",
    blurb: "Whatever's down there was always yours. Everything produces x2.",
    cost: fleetCost("mantle", 25, 9),
    effect: { kind: "global_mult", factor: 2 },
    requires: { producer: "mantle", count: 25 },
  },
  {
    id: "unbroken_line",
    name: "Unbroken Line",
    blurb: "Nobody has stopped farming. Everything produces x2.",
    cost: fleetCost("chorus", 25, 2),
    effect: { kind: "global_mult", factor: 2 },
    requires: { producer: "chorus", count: 25 },
  },
  {
    id: "third_potato",
    name: "The Third Potato",
    blurb: "Everything produces x2. Try not to work out where it is.",
    cost: fleetCost("second", 25),
    effect: { kind: "global_mult", factor: 2 },
    requires: { producer: "second", count: 25 },
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

export type LandId =
  | "windbreak"
  | "drainage"
  | "pest_control"
  | "insurance"
  | "callus_beds"
  | "dormancy_rig"
  | "scar_tissue"
  | "sap_reclaim";

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
  /**
   * Which farm it defends. The `inside` set is only buildable once the world has
   * folded, and it's what the inside's Weather panel sells instead of the four
   * that are about a sky.
   */
  world: World;
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
    world: "outside",
  },
  {
    id: "drainage",
    name: "Drainage Ditches",
    blurb: "Water leaves instead of sitting there taking your topsoil.",
    role: "soil",
    perLevel: 0.14,
    baseCost: P.of(2_500),
    growth: 1.9,
    world: "outside",
  },
  {
    id: "pest_control",
    name: "Pest Control Contract",
    blurb: "Someone else's problem now. Trouble comes around less often.",
    role: "frequency",
    perLevel: 0.1,
    baseCost: P.of(9_000),
    growth: 2.1,
    world: "outside",
  },
  {
    id: "insurance",
    name: "Crop Insurance",
    blurb: "Doesn't stop anything. Does cut you a cheque afterwards.",
    role: "payout",
    perLevel: 0.12,
    baseCost: P.of(40_000),
    growth: 1.9,
    world: "outside",
  },
  // Inside the potato there is no sky, so the four above stop being about
  // weather and the four below are what the second axis gets instead. Same
  // roles, one for one, priced at the scale of the farm that can see them: the
  // first level of any of them is a few minutes of production at the moment the
  // world folds.
  {
    id: "callus_beds",
    name: "Callus Beds",
    blurb: "Let the flesh scar where it wants to. It closes around less of the kit.",
    role: "breakage",
    perLevel: 0.13,
    baseCost: P.of(500_000_000_000_000),
    growth: 1.9,
    world: "inside",
  },
  {
    id: "scar_tissue",
    name: "Scar Tissue",
    blurb: "Grow the wound over on purpose. What's underneath keeps its goodness.",
    role: "soil",
    perLevel: 0.13,
    baseCost: P.of(800_000_000_000_000),
    growth: 1.9,
    world: "inside",
  },
  {
    id: "dormancy_rig",
    name: "Dormancy Rig",
    blurb: "Convinces the tuber it is winter. It stirs less often.",
    role: "frequency",
    perLevel: 0.09,
    baseCost: P.of(1_500_000_000_000_000),
    growth: 2.1,
    world: "inside",
  },
  {
    id: "sap_reclaim",
    name: "Sap Reclamation",
    blurb: "Whatever it weeps when it's hurt, you catch and sell.",
    role: "payout",
    perLevel: 0.12,
    baseCost: P.of(3_000_000_000_000_000),
    growth: 1.9,
    world: "inside",
  },
];

/** The buildings that defend one farm or the other. */
export function landsIn(world: World): readonly Land[] {
  return LANDS.filter((l) => l.world === world);
}

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
 * many seconds. What it competes with is the next rung of the ladder, and that
 * pays back in one to five minutes for most of a run — so anything much above
 * five minutes here is a button no one should ever press, which is what twenty
 * minutes was. It also has to stay in the same league as `REPAIR_SECONDS`, or
 * the two halves of the same mechanic quote different prices for the same lost
 * potato.
 */
export const SOIL_RESTORE_SECONDS = 300;

/** Discount on the quoted repair price. See `repairCost` for what's quoted. */
export const SOLO_REPAIR_COST_FRACTION = 0.7;

/**
 * Repairs are billed as this many seconds of the production they give back.
 * The single knob for how much weather actually costs — raise it and damage
 * bites harder without touching how often anything breaks.
 *
 * `SOLO_REPAIR_COST_FRACTION` discounts this, so the real payback is about five
 * minutes: the same league as putting the soil right, and near enough to the
 * ladder's own payback that fixing what broke is usually the better buy.
 */
export const REPAIR_SECONDS = 450;

/** No single disaster can break more than this share of a producer type. */
export const SOLO_MAX_BROKEN_SHARE = 0.5;
