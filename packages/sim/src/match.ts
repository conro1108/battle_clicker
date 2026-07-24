import { buildShield, resolveAttack, shieldPool } from "./combat.js";
import {
  ATTACK_BY_ID,
  DEFENSE_BY_ID,
  PRODUCER_BY_ID,
  UPGRADE_BY_ID,
  type ProducerId,
} from "./content.js";
import {
  checkpoint,
  clickYield,
  harvestedAt,
  potatoesAt,
  producerCost,
  rateAt,
  repeatCost,
} from "./economy.js";
import { P, format, ms, type Millis, type Potatoes, type Rate } from "./numbers.js";
import { rngFor } from "./rng.js";
import type {
  Command,
  CommandResult,
  LogEntry,
  MatchConfig,
  MatchState,
  PlayerId,
  PlayerState,
  ScoringRule,
} from "./state.js";

/** Server-side clamp on batched clicks (STACK.md: clicks batch, ~500ms flush). */
export const MAX_CLICKS_PER_FLUSH = 25;

export function createPlayer(id: PlayerId, name: string, startedAt: Millis, isBot = false): PlayerState {
  return {
    id,
    name,
    isBot,
    potatoes: P.zero,
    harvested: P.zero,
    checkpointAt: startedAt,
    producers: {},
    upgrades: [],
    attacksUsed: {},
    defensesUsed: {},
    effects: [],
  };
}

export function createMatch(opts: {
  config: MatchConfig;
  startedAt: Millis;
  players: { id: PlayerId; name: string; isBot?: boolean }[];
}): MatchState {
  const players: Record<PlayerId, PlayerState> = {};
  for (const p of opts.players) {
    players[p.id] = createPlayer(p.id, p.name, opts.startedAt, p.isBot ?? false);
  }
  return {
    config: opts.config,
    startedAt: opts.startedAt,
    players,
    order: opts.players.map((p) => p.id),
    eventIndex: 0,
    log: [],
  };
}

export function endsAt(state: MatchState): Millis {
  return ms(state.startedAt + state.config.durationMs);
}

export function isOver(state: MatchState, t: Millis): boolean {
  return t >= endsAt(state);
}

/** Nothing accrues or resolves after the clock hits zero. */
export function clampToMatch(state: MatchState, t: Millis): Millis {
  return ms(Math.min(Math.max(t, state.startedAt), endsAt(state)));
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export function scoreOf(p: PlayerState, t: Millis, scoring: ScoringRule): Potatoes {
  return scoring === "on_hand" ? potatoesAt(p, t) : harvestedAt(p, t);
}

export interface Standing {
  player: PlayerState;
  score: Potatoes;
  rate: Rate;
}

export function standings(state: MatchState, now: Millis): Standing[] {
  const t = clampToMatch(state, now);
  return state.order
    .map((id) => state.players[id]!)
    .map((player) => ({
      player,
      score: scoreOf(player, t, state.config.scoring),
      rate: rateAt(player, t),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Everything one player is allowed to know about another (VISION.md: count and
 * production rate, nothing else). Funnelled through here so the UI can't leak
 * by accident.
 */
export interface OpponentView {
  id: PlayerId;
  name: string;
  count: Potatoes;
  rate: Rate;
}

export function opponentView(state: MatchState, id: PlayerId, now: Millis): OpponentView {
  const t = clampToMatch(state, now);
  const p = state.players[id]!;
  return {
    id,
    name: p.name,
    count: scoreOf(p, t, state.config.scoring),
    rate: rateAt(p, t),
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function fail(reason: string): CommandResult {
  return { ok: false, reason };
}

function entry(
  state: MatchState,
  at: Millis,
  actor: PlayerId,
  text: string,
  tone: LogEntry["tone"],
  target?: PlayerId,
): LogEntry {
  return { index: state.eventIndex, at, actor, target, text, tone };
}

/**
 * The single authority for mutations. Pure: same (state, command, time) always
 * yields the same result, which is what lets the client predict optimistically
 * and the server replay for truth.
 */
export function applyCommand(state: MatchState, cmd: Command, now: Millis): CommandResult {
  if (isOver(state, now)) return fail("Match is over.");
  const t = clampToMatch(state, now);

  const actor0 = state.players[cmd.player];
  if (!actor0) return fail("No such player.");
  if (t < actor0.checkpointAt) return fail("Time moved backwards.");

  let actor = checkpoint(actor0, t);
  const eventIndex = state.eventIndex + 1;
  const entries: LogEntry[] = [];
  const players = { ...state.players };

  const spend = (cost: Potatoes): boolean => {
    if (!P.gte(actor.potatoes, cost)) return false;
    actor = { ...actor, potatoes: P.sub(actor.potatoes, cost) };
    return true;
  };

  switch (cmd.type) {
    case "click": {
      const count = Math.max(0, Math.min(MAX_CLICKS_PER_FLUSH, Math.floor(cmd.count)));
      if (count === 0) return fail("Nothing to flush.");
      const gained = P.mul(clickYield(actor), count);
      actor = {
        ...actor,
        potatoes: P.add(actor.potatoes, gained),
        harvested: P.add(actor.harvested, gained),
      };
      break;
    }

    case "buy_producer": {
      const producer = PRODUCER_BY_ID[cmd.producer as ProducerId];
      if (!producer) return fail("No such producer.");
      const qty = Math.max(1, Math.floor(cmd.qty));
      const owned = actor.producers[producer.id] ?? 0;
      const cost = producerCost(producer.id, owned, qty);
      if (!spend(cost)) return fail("Not enough potatoes.");
      actor = { ...actor, producers: { ...actor.producers, [producer.id]: owned + qty } };
      break;
    }

    case "buy_upgrade": {
      const upgrade = UPGRADE_BY_ID[cmd.upgrade];
      if (!upgrade) return fail("No such upgrade.");
      if (actor.upgrades.includes(upgrade.id)) return fail("Already owned.");
      if (upgrade.requires) {
        const have = actor.producers[upgrade.requires.producer] ?? 0;
        if (have < upgrade.requires.count) return fail("Not unlocked yet.");
      }
      if (!spend(upgrade.cost)) return fail("Not enough potatoes.");
      actor = { ...actor, upgrades: [...actor.upgrades, upgrade.id] };
      entries.push(entry(state, t, actor.id, `bought ${upgrade.name}.`, "neutral"));
      break;
    }

    case "attack": {
      const attack = ATTACK_BY_ID[cmd.attack];
      if (!attack) return fail("No such attack.");
      if (cmd.target === cmd.player) return fail("Can't sabotage your own farm.");
      const target0 = state.players[cmd.target];
      if (!target0) return fail("No such target.");

      const used = actor.attacksUsed[attack.id] ?? 0;
      const cost = repeatCost(attack.baseCost, attack.growth, used);
      if (!spend(cost)) return fail("Not enough potatoes.");
      actor = { ...actor, attacksUsed: { ...actor.attacksUsed, [attack.id]: used + 1 } };

      const { defender, outcome } = resolveAttack({
        attack,
        attackerId: actor.id,
        defender: checkpoint(target0, t),
        at: t,
        rng: rngFor(state.config.seed, eventIndex),
        eventIndex,
      });
      players[defender.id] = defender;

      let text: string;
      if (outcome.blocked) {
        text = `sent ${attack.name} at ${defender.name} — fully blocked.`;
      } else if (outcome.stolen > 0) {
        text = `${attack.name} took ${format(outcome.stolen)} potatoes from ${defender.name}.`;
      } else if (outcome.disabledProducerName) {
        text = `${attack.name} shut down ${defender.name}'s ${outcome.disabledProducerName}.`;
      } else {
        text = `${attack.name} hit ${defender.name}.`;
      }
      if (!outcome.blocked && outcome.mitigation > 0) {
        text += ` (${Math.round(outcome.mitigation * 100)}% absorbed)`;
      }
      entries.push(entry(state, t, actor.id, text, outcome.blocked ? "neutral" : "bad", defender.id));
      break;
    }

    case "defend": {
      const defense = DEFENSE_BY_ID[cmd.defense];
      if (!defense) return fail("No such defense.");
      const used = actor.defensesUsed[defense.id] ?? 0;
      const cost = repeatCost(defense.baseCost, defense.growth, used);
      if (!spend(cost)) return fail("Not enough potatoes.");
      actor = {
        ...actor,
        defensesUsed: { ...actor.defensesUsed, [defense.id]: used + 1 },
        effects: [...actor.effects, buildShield(defense, actor.id, t, eventIndex)],
      };
      entries.push(
        entry(
          state,
          t,
          actor.id,
          `put up ${defense.name} (${format(shieldPool(actor, t))} absorb).`,
          "good",
        ),
      );
      break;
    }
  }

  players[actor.id] = actor;
  return {
    ok: true,
    state: { ...state, players, eventIndex, log: [...state.log, ...entries] },
    entries,
  };
}

/** Convenience for tests and bots: apply a command, throw if it was rejected. */
export function mustApply(state: MatchState, cmd: Command, now: Millis): MatchState {
  const res = applyCommand(state, cmd, now);
  if (!res.ok) throw new Error(`command rejected: ${res.reason}`);
  return res.state;
}
