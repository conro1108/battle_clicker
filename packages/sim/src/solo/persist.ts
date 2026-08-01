/**
 * Saving the farm, and picking it back up.
 *
 * A save is just the `FarmState` plus a version tag — there's no derived data to
 * rebuild, because the state already is a checkpoint. Coming back after an
 * absence is the same `advance` a live tick uses, handed a bigger interval.
 */

import { P, ms, type Millis, type Potatoes } from "../numbers.js";
import { MAX_SOIL, type World } from "./content.js";
import { advance, CONVERGENCE_UPGRADE } from "./farm.js";
import type { FarmState } from "./state.js";
import type { WeatherEvent } from "./weather.js";

export const SAVE_VERSION = 1;

export interface SaveFile {
  version: number;
  savedAt: number;
  farm: FarmState;
}

export function serializeFarm(farm: FarmState, savedAt: Millis): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt, farm } satisfies SaveFile);
}

/**
 * Parse a save. Returns null for anything we can't trust rather than throwing —
 * a corrupt save should cost you a farm, not the ability to open the page.
 */
export function parseFarm(raw: string): FarmState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const save = parsed as Partial<SaveFile>;
  if (save.version !== SAVE_VERSION || typeof save.farm !== "object" || save.farm === null) {
    return null;
  }
  const f = save.farm as Partial<FarmState>;
  if (typeof f.seed !== "string" || typeof f.checkpointAt !== "number") return null;

  const upgrades = Array.isArray(f.upgrades) ? f.upgrades : [];

  // Saves written before the flag existed still know whether the world folded:
  // they're holding the upgrade that did it. Without this backfill a farm that
  // had already converged would open with its sky back.
  const converged = f.converged ?? upgrades.includes(CONVERGENCE_UPGRADE);
  // And one written before there were two worlds was standing in whichever one
  // it had reached, which for a folded farm is inside the potato.
  const world: World = converged && f.world !== "outside" ? "inside" : "outside";

  // Fill anything a hand-edited or partial save is missing, so one absent field
  // doesn't produce NaN potatoes forever.
  return {
    seed: f.seed,
    startedAt: ms(f.startedAt ?? f.checkpointAt),
    potatoes: finite(f.potatoes),
    harvested: finite(f.harvested),
    checkpointAt: ms(f.checkpointAt),
    producers: f.producers ?? {},
    broken: f.broken ?? {},
    upgrades,
    land: f.land ?? {},
    soil: Number.isFinite(f.soil) ? Math.min(MAX_SOIL, f.soil as number) : MAX_SOIL,
    weatherIndex: Math.max(0, Math.floor(f.weatherIndex ?? 0)),
    nextWeatherAt: ms(f.nextWeatherAt ?? f.checkpointAt),
    converged,
    world,
    seeds: Math.max(0, Math.floor(f.seeds ?? 0)),
    perks: f.perks ?? {},
    lifetimeHarvested: finite(f.lifetimeHarvested),
    generation: Math.max(1, Math.floor(f.generation ?? 1)),
    runStartedAt: ms(f.runStartedAt ?? f.startedAt ?? f.checkpointAt),
    log: Array.isArray(f.log) ? f.log.slice(-60) : [],
  };
}

function finite(n: unknown): Potatoes {
  return P.of(typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);
}

export interface OfflineReport {
  awayMs: number;
  /** Potatoes produced while away, before anything the weather handed back. */
  earned: Potatoes;
  events: WeatherEvent[];
  brokeTotal: number;
  soilLost: number;
  /** Boons and insurance payouts collected in your absence. */
  gained: Potatoes;
}

/**
 * Resolve everything that happened between the save and now.
 *
 * A clock that moved backwards (timezone change, a fiddled system clock) is
 * treated as no time passing rather than as an error — the farm just picks up
 * from the later of the two.
 */
export function resumeFarm(saved: FarmState, now: Millis): { farm: FarmState; report: OfflineReport | null } {
  if (now <= saved.checkpointAt) {
    const rebased = ms(Math.max(now, saved.checkpointAt));
    return { farm: { ...saved, checkpointAt: rebased }, report: null };
  }

  const before = saved.potatoes;
  const { farm, events } = advance(saved, now, true);
  const awayMs = now - saved.checkpointAt;

  const gained = P.of(events.reduce((sum, e) => sum + e.gained, 0));
  const report: OfflineReport = {
    awayMs,
    earned: P.of(Math.max(0, farm.potatoes - before - gained)),
    events,
    brokeTotal: events.reduce((sum, e) => sum + e.brokeTotal, 0),
    soilLost: events.reduce((sum, e) => sum + e.soilLost, 0),
    gained,
  };
  return { farm, report };
}

/** Below this, an absence isn't worth interrupting anyone with a report. */
export const REPORT_THRESHOLD_MS = 60_000;

export function worthReporting(report: OfflineReport | null): boolean {
  if (!report) return false;
  return report.awayMs >= REPORT_THRESHOLD_MS && (report.earned > 0 || report.events.length > 0);
}
