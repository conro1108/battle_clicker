import type { Millis, Potatoes } from "./numbers.js";
import type { AttackId, DefenseId, ProducerId, UpgradeId } from "./content.js";

export type PlayerId = string;

/**
 * Effects are the only thing that makes a player's rate time-varying, and they
 * all end at a known instant. That's what keeps production integrable in
 * closed form (see STACK.md) — rate is piecewise-constant with boundaries we
 * can enumerate.
 */
export type ActiveEffect =
  | {
      kind: "slow";
      id: string;
      source: PlayerId;
      label: string;
      /** Multiplier on total output, e.g. 0.65 = a 35% cut. */
      multiplier: number;
      startedAt: Millis;
      expiresAt: Millis;
    }
  | {
      kind: "disable";
      id: string;
      source: PlayerId;
      label: string;
      producer: ProducerId;
      startedAt: Millis;
      expiresAt: Millis;
    }
  | {
      kind: "shield";
      id: string;
      source: PlayerId;
      label: string;
      /** Remaining absorb pool. Drained by incoming attacks. */
      power: number;
      initialPower: number;
      startedAt: Millis;
      expiresAt: Millis;
    };

export interface PlayerState {
  id: PlayerId;
  name: string;
  isBot: boolean;

  /** Checkpoint: potatoes on hand as of `checkpointAt`. */
  potatoes: Potatoes;
  checkpointAt: Millis;

  /** Lifetime potatoes harvested, also checkpointed at `checkpointAt`. */
  harvested: Potatoes;

  producers: Partial<Record<ProducerId, number>>;
  upgrades: UpgradeId[];
  /** How many times each repeatable action has been bought — drives its cost curve. */
  attacksUsed: Partial<Record<AttackId, number>>;
  defensesUsed: Partial<Record<DefenseId, number>>;

  effects: ActiveEffect[];
}

export type ScoringRule = "total_harvested" | "on_hand";

export interface MatchConfig {
  seed: string;
  durationMs: number;
  /** What the winner is measured on. See README — this is a live design fork. */
  scoring: ScoringRule;
}

export interface MatchState {
  config: MatchConfig;
  startedAt: Millis;
  players: Record<PlayerId, PlayerState>;
  order: PlayerId[];
  /** Monotonic; also the PRNG key, so it must advance on every applied event. */
  eventIndex: number;
  log: LogEntry[];
}

export interface LogEntry {
  index: number;
  at: Millis;
  actor: PlayerId;
  target?: PlayerId;
  text: string;
  tone: "neutral" | "good" | "bad";
}

export type Command =
  | { type: "click"; player: PlayerId; count: number }
  | { type: "buy_producer"; player: PlayerId; producer: ProducerId; qty: number }
  | { type: "buy_upgrade"; player: PlayerId; upgrade: UpgradeId }
  | { type: "attack"; player: PlayerId; target: PlayerId; attack: AttackId }
  | { type: "defend"; player: PlayerId; defense: DefenseId };

export type CommandResult =
  | { ok: true; state: MatchState; entries: LogEntry[] }
  | { ok: false; reason: string };
