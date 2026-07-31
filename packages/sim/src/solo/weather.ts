/**
 * Weather — sabotage with nobody behind it.
 *
 * The versus mode's attacks and this are the same idea from opposite ends: your
 * farm keeps getting knocked around, and staying productive means budgeting for
 * it. The difference is that nothing here is aimed at you and nothing here
 * expires. Every hit is permanent until you pay to undo it, which is what makes
 * a farm you leave alone for a week a farm that needs work when you get back.
 *
 * Events are a deterministic function of `(seed, weatherIndex)`, and each one
 * lands at a time the state already knows (`nextWeatherAt`). That's what lets an
 * arbitrary offline gap resolve exactly — walk the schedule, don't sample a
 * clock — and it means a save file can't be rerolled for better weather.
 */

import { P, format, ms, seconds, type Millis, type Potatoes } from "../numbers.js";
import { rngFor, type Rng } from "../rng.js";
import {
  MIN_SOIL,
  SOLO_MAX_BROKEN_SHARE,
  SOLO_PRODUCERS,
  SOLO_PRODUCER_BY_ID,
  type SoloProducerId,
} from "./content.js";
import {
  cleanRate,
  currentRate,
  mitigation,
  producerRate,
  repairCost,
  soilRestoreCost,
  workingCount,
} from "./economy.js";
import type { FarmState } from "./state.js";

/** Which producers a breakage event goes after. */
type BreakScope = "best" | "cheapest" | "all";

type WeatherEffect =
  /** Knocks units offline. They stay offline until repaired. */
  | { kind: "break"; scope: BreakScope; share: number; soil?: number }
  /** Takes soil health, which only spending brings back. */
  | { kind: "soil"; loss: number }
  /** A good day. Worth this many seconds of production, paid out at once. */
  | { kind: "boon"; seconds: number };

interface WeatherKind {
  id: string;
  name: string;
  weight: number;
  effect: WeatherEffect;
}

/**
 * Weighted roughly 5:1 against you. Weather isn't meant to be a coin flip — it's
 * a running cost — but a farm where nothing good ever happens is a farm nobody
 * wants to check on.
 */
const KINDS: readonly WeatherKind[] = [
  { id: "voles", name: "Voles", weight: 20, effect: { kind: "break", scope: "cheapest", share: 0.3 } },
  { id: "hail", name: "Hailstorm", weight: 16, effect: { kind: "break", scope: "best", share: 0.28 } },
  { id: "blight", name: "Potato Blight", weight: 10, effect: { kind: "break", scope: "all", share: 0.22 } },
  {
    id: "frost",
    name: "Late Frost",
    weight: 8,
    effect: { kind: "break", scope: "best", share: 0.35, soil: 0.05 },
  },
  { id: "drought", name: "Drought", weight: 14, effect: { kind: "soil", loss: 0.08 } },
  { id: "erosion", name: "Topsoil Erosion", weight: 7, effect: { kind: "soil", loss: 0.16 } },
  {
    id: "flood",
    name: "Flooding",
    weight: 6,
    effect: { kind: "break", scope: "all", share: 0.18, soil: 0.1 },
  },
  // Boons are deliberately small. At 600s of production a good year was worth
  // more than every storm in a session cost, which made the weather a bonus
  // and the whole mitigation half of the game pointless.
  { id: "bumper", name: "Bumper Crop", weight: 10, effect: { kind: "boon", seconds: 90 } },
  { id: "perfect", name: "Perfect Season", weight: 3, effect: { kind: "boon", seconds: 300 } },
];

/**
 * What the weather becomes once the horizon closes.
 *
 * Inside the potato there is no sky, so hail and frost and drought stop. What
 * replaces them is the tuber's immune response — it has noticed it is being
 * farmed. Same three effect kinds, because the second axis is the same axis and
 * splitting it would mean two mitigation systems to balance; the mix is soil-
 * heavier, because what the flesh does to you is mostly close over the ground
 * rather than smash the machinery.
 *
 * This is the mechanical payoff of the Convergence, and deliberately the whole
 * of it. There is no Convergence multiplier: the ladder gets a second act at
 * the same moment the land half does, which is what the design has always
 * rested on.
 */
const IMMUNE_KINDS: readonly WeatherKind[] = [
  { id: "suberin", name: "Suberin Bloom", weight: 14, effect: { kind: "break", scope: "cheapest", share: 0.28 } },
  { id: "callus", name: "Callus Growth", weight: 10, effect: { kind: "break", scope: "best", share: 0.26 } },
  {
    id: "sprout_pressure",
    name: "Sprout Pressure",
    weight: 8,
    effect: { kind: "break", scope: "all", share: 0.2, soil: 0.06 },
  },
  { id: "phloem", name: "Phloem Surge", weight: 20, effect: { kind: "soil", loss: 0.09 } },
  { id: "necrosis", name: "Necrosis", weight: 13, effect: { kind: "soil", loss: 0.17 } },
  { id: "starch_flood", name: "Starch Flood", weight: 9, effect: { kind: "soil", loss: 0.13 } },
  { id: "dormant", name: "Dormancy", weight: 9, effect: { kind: "boon", seconds: 90 } },
  { id: "flush", name: "Sap Flush", weight: 3, effect: { kind: "boon", seconds: 300 } },
];

function kindsFor(f: FarmState): readonly WeatherKind[] {
  return f.converged ? IMMUNE_KINDS : KINDS;
}

/** Which ids each table can produce. The scene and the tests both want this. */
export const WEATHER_IDS = {
  sky: KINDS.map((k) => k.id),
  flesh: IMMUNE_KINDS.map((k) => k.id),
} as const;

/** Average gap between events, before any mitigation stretches it. */
export const MEAN_WEATHER_GAP_MS = seconds(300);

/**
 * A farm this small has nothing worth wrecking, so the weather leaves it alone.
 * Without this, the first ten minutes are a player with four potato plots
 * watching two of them break.
 */
export const WEATHER_MIN_RATE = 25;

export interface WeatherEvent {
  index: number;
  at: Millis;
  id: string;
  name: string;
  tone: "good" | "bad";
  broke: Partial<Record<SoloProducerId, number>>;
  brokeTotal: number;
  /** Soil health points taken, after mitigation. */
  soilLost: number;
  /**
   * Share of production the event took, 0..1. Broken kit and tired soil cost
   * the same thing in the end, so this is the one number worth reading.
   */
  lostShare: number;
  /** Boon windfall plus any insurance payout. */
  gained: Potatoes;
  text: string;
}

/** When the next event lands, given the farm as it stands at `from`. */
export function scheduleNext(f: FarmState, from: Millis): Millis {
  const rng = rngFor(f.seed, hashIndex(f.weatherIndex, "gap"));
  const calm = 1 - mitigation(f, "frequency");
  const gap = (MEAN_WEATHER_GAP_MS * rng.range(0.55, 1.75)) / Math.max(0.05, calm);
  return ms(from + Math.round(gap));
}

/** Keeps the gap roll and the event roll on different streams of the same seed. */
function hashIndex(index: number, tag: string): number {
  let h = index * 2654435761;
  for (let i = 0; i < tag.length; i++) h = (h ^ tag.charCodeAt(i)) * 16777619;
  return h >>> 0;
}

function pickKind(rng: Rng, kinds: readonly WeatherKind[]): WeatherKind {
  const total = kinds.reduce((sum, k) => sum + k.weight, 0);
  let roll = rng.next() * total;
  for (const kind of kinds) {
    roll -= kind.weight;
    if (roll <= 0) return kind;
  }
  return kinds[kinds.length - 1]!;
}

/** Producer types this event can hit, worst-first by scope. */
function targetsFor(f: FarmState, scope: BreakScope): SoloProducerId[] {
  const live = SOLO_PRODUCERS.filter((prod) => workingCount(f, prod.id) > 0);
  if (live.length === 0) return [];
  if (scope === "all") return live.map((prod) => prod.id);
  if (scope === "cheapest") return [live[0]!.id];
  const best = live.reduce((a, b) => (producerRate(f, b.id) > producerRate(f, a.id) ? b : a));
  return [best.id];
}

function describeBreak(broke: Partial<Record<SoloProducerId, number>>): string {
  return SOLO_PRODUCERS.filter((prod) => (broke[prod.id] ?? 0) > 0)
    .map((prod) => `${broke[prod.id]}x ${SOLO_PRODUCER_BY_ID[prod.id].name}`)
    .join(", ");
}

/**
 * Resolve the event due at `at`. The farm must already be integrated forward to
 * that instant — `advance` in farm.ts is the only thing that should call this.
 *
 * Returns `null` for an event that came to nothing (too small a farm, or a
 * storm with nothing left to break), so the caller can quietly reschedule
 * rather than log a non-event.
 */
export function fireWeather(f: FarmState, at: Millis): { farm: FarmState; event: WeatherEvent | null } {
  const index = f.weatherIndex;
  const advanced: FarmState = { ...f, weatherIndex: index + 1 };

  if (cleanRate(f) < WEATHER_MIN_RATE) {
    return { farm: { ...advanced, nextWeatherAt: scheduleNext(advanced, at) }, event: null };
  }

  const rng = rngFor(f.seed, hashIndex(index, "event"));
  const kind = pickKind(rng, kindsFor(f));

  let farm = advanced;
  const rateBefore = currentRate(farm);
  const broke: Partial<Record<SoloProducerId, number>> = {};
  let brokeTotal = 0;
  let soilLost = 0;
  let gained = P.zero;

  if (kind.effect.kind === "boon") {
    gained = P.overTime(currentRate(farm), seconds(kind.effect.seconds));
  } else {
    const before = { repairs: totalRepairs(farm), soil: soilRestoreCost(farm) };

    // Breakage and soil are mitigated separately — a windbreak saves the kit,
    // ditches save the dirt.
    const breakPotency = 1 - mitigation(farm, "breakage");
    const soilPotency = 1 - mitigation(farm, "soil");

    if (kind.effect.kind === "break") {
      const brokenNow = { ...farm.broken };
      for (const id of targetsFor(farm, kind.effect.scope)) {
        const owned = farm.producers[id] ?? 0;
        const already = brokenNow[id] ?? 0;
        const working = owned - already;
        if (working <= 0) continue;
        // Jitter so identical storms aren't identical, and so the seeded PRNG
        // stays the only randomness anywhere in the sim.
        const rolled = kind.effect.share * breakPotency * rng.range(0.8, 1.2);
        const want = Math.max(1, Math.round(working * rolled));
        const cap = Math.max(0, Math.floor(owned * SOLO_MAX_BROKEN_SHARE) - already);
        const hit = Math.min(want, working, cap);
        if (hit <= 0) continue;
        brokenNow[id] = already + hit;
        broke[id] = (broke[id] ?? 0) + hit;
        brokeTotal += hit;
      }
      farm = { ...farm, broken: brokenNow };
    }

    const soilHit =
      kind.effect.kind === "soil" ? kind.effect.loss : (kind.effect.soil ?? 0);
    if (soilHit > 0) {
      soilLost = takeSoil(farm, soilHit * soilPotency);
      farm = { ...farm, soil: farm.soil - soilLost };
    }

    if (brokeTotal === 0 && soilLost <= 1e-9) {
      return { farm: { ...farm, nextWeatherAt: scheduleNext(farm, at) }, event: null };
    }

    // Insurance covers a share of the bill the event just handed you. It buys
    // nothing back directly — you still have to go and spend it on repairs.
    const billed =
      totalRepairs(farm) - before.repairs + (soilRestoreCost(farm) - before.soil);
    gained = P.of(Math.max(0, billed) * mitigation(farm, "payout"));
  }

  farm = {
    ...farm,
    potatoes: P.add(farm.potatoes, gained),
    harvested: P.add(farm.harvested, gained),
    lifetimeHarvested: P.add(farm.lifetimeHarvested, gained),
  };
  farm = { ...farm, nextWeatherAt: scheduleNext(farm, at) };

  const lostShare = rateBefore > 0 ? Math.max(0, 1 - currentRate(farm) / rateBefore) : 0;

  // What happened, then what it costs you — in output, which is the only unit
  // the player has any feel for. "Took 8.0 soil" is a number from the engine;
  // "−8% production" is the same fact in the terms you'd act on.
  const parts: string[] = [];
  if (brokeTotal > 0) parts.push(`wrecked ${describeBreak(broke)}`);
  if (soilLost > 1e-9) parts.push("tired the soil");
  if (kind.effect.kind === "boon") parts.push(`a good year, +${format(gained)}`);
  const cost =
    lostShare > 0.0005 ? ` −${(lostShare * 100).toFixed(0)}% production.` : "";
  const text = `${kind.name} — ${parts.join(", ")}.${cost}`;

  return {
    farm,
    event: {
      index,
      at,
      id: kind.id,
      name: kind.name,
      tone: kind.effect.kind === "boon" ? "good" : "bad",
      broke,
      brokeTotal,
      soilLost,
      lostShare,
      gained,
      text,
    },
  };
}

function totalRepairs(f: FarmState): number {
  let total = 0;
  for (const prod of SOLO_PRODUCERS) total += repairCost(f, prod.id);
  return total;
}

/** Soil actually taken, clamped so the land can never be run into the ground. */
function takeSoil(f: FarmState, want: number): number {
  return Math.max(0, Math.min(want, f.soil - MIN_SOIL));
}
