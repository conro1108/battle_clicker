import type { Millis, Potatoes } from "../numbers.js";
import type { LandId, SoloProducerId } from "./content.js";
import type { PerkId } from "./prestige.js";

/**
 * The whole homestead, checkpointed.
 *
 * Note what isn't here: no timed effects. Weather in solo leaves permanent
 * damage, so nothing about a farm changes on its own between the instant it was
 * last touched and the next scheduled weather event. That makes the rate
 * piecewise-constant with boundaries we already know, which is what lets a week
 * offline resolve exactly rather than approximately.
 */
export interface FarmState {
  /** Fixed at creation. Weather is a pure function of this and the event index. */
  seed: string;
  startedAt: Millis;

  /** Potatoes on hand as of `checkpointAt`. */
  potatoes: Potatoes;
  /** Harvested during the current run, also as of `checkpointAt`. */
  harvested: Potatoes;
  checkpointAt: Millis;

  producers: Partial<Record<SoloProducerId, number>>;
  /** Knocked offline by weather. Owned, producing nothing, until repaired. */
  broken: Partial<Record<SoloProducerId, number>>;
  upgrades: string[];
  /** Levels of each permanent mitigation building. */
  land: Partial<Record<LandId, number>>;

  /**
   * Multiplies the whole farm. Falls when weather hits and rises only when you
   * pay to put it right — the slow tax that makes ignoring the land expensive.
   */
  soil: number;

  /** Cursor into the seeded weather schedule. Advances on every event. */
  weatherIndex: number;
  nextWeatherAt: Millis;

  // --- Persists across prestige resets -------------------------------------
  /** Heirloom Seed on hand, spendable on perks. */
  seeds: number;
  perks: Partial<Record<PerkId, number>>;
  /** Harvest across every run, ever. Only ever goes up. */
  lifetimeHarvested: Potatoes;
  /** How many times the farm has been handed down. */
  generation: number;
  runStartedAt: Millis;

  log: FarmLogEntry[];
}

export interface FarmLogEntry {
  index: number;
  at: Millis;
  text: string;
  tone: "neutral" | "good" | "bad";
}

export type FarmCommand =
  | { type: "dig"; count: number }
  | { type: "buy_producer"; producer: SoloProducerId; qty: number }
  | { type: "buy_upgrade"; upgrade: string }
  | { type: "buy_land"; land: LandId }
  | { type: "repair"; producer: SoloProducerId }
  | { type: "restore_soil" }
  | { type: "buy_perk"; perk: PerkId }
  | { type: "prestige" };

export type FarmResult =
  | { ok: true; farm: FarmState; entries: FarmLogEntry[] }
  | { ok: false; reason: string };
