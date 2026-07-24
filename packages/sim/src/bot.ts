import { shieldPool } from "./combat.js";
import {
  ATTACKS,
  DEFENSES,
  PRODUCERS,
  UPGRADES,
  type Attack,
  type Defense,
} from "./content.js";
import { checkpoint, producerCost, producerMultiplier, rateAt, repeatCost } from "./economy.js";
import { P, seconds, type Millis, type Potatoes } from "./numbers.js";
import { clampToMatch, isOver, scoreOf } from "./match.js";
import { rngFor } from "./rng.js";
import type { Command, MatchState, PlayerId } from "./state.js";

export interface BotProfile {
  /** 0..1 — how much of its pile it's willing to throw at sabotage. */
  aggression: number;
  /** 0..1 — how eagerly it shields up. */
  defensiveness: number;
  /** Stand-in for a human mashing the button. */
  clicksPerSecond: number;
}

export const BOT_PROFILES: Record<string, BotProfile> = {
  chill: { aggression: 0.15, defensiveness: 0.3, clicksPerSecond: 2 },
  scrappy: { aggression: 0.45, defensiveness: 0.45, clicksPerSecond: 4 },
  nasty: { aggression: 0.75, defensiveness: 0.55, clicksPerSecond: 5 },
  /** Never spends a potato on anyone else. The control group for balance runs. */
  greedy: { aggression: 0, defensiveness: 0, clicksPerSecond: 4 },
};

/**
 * How many seconds of income the bot will hold out for. Without this it spends
 * every potato on the next producer the instant it can, and never banks enough
 * to attack or shield — which made sabotage literally never fire.
 */
const SAVE_WINDOW_SECONDS = 25;
/** How long its current intent sticks, so saving isn't re-rolled every tick. */
const INTENT_BUCKET_MS = 20_000;
/** Most of the pile it will hold back while saving, rather than reinvesting. */
const RESERVE_FRACTION = 0.5;

/** Priciest item it could reach within the save window. */
function reachable<T extends Attack | Defense>(
  items: readonly T[],
  used: Partial<Record<string, number>>,
  reach: Potatoes,
): { item: T; cost: Potatoes } | undefined {
  let best: { item: T; cost: Potatoes } | undefined;
  for (const item of items) {
    const cost = repeatCost(item.baseCost, item.growth, used[item.id] ?? 0);
    if (P.gte(reach, cost) && (!best || cost > best.cost)) best = { item, cost };
  }
  return best;
}

/**
 * A deliberately simple opponent: buy the best rate-per-potato producer, grab
 * upgrades on sight, and spend a slice of the pile on offense/defense. Enough
 * pressure to make the spend-on-yourself-vs-spend-against-them call feel real,
 * which is the whole thing we're trying to prove out.
 */
export function botDecide(
  state: MatchState,
  botId: PlayerId,
  profile: BotProfile,
  now: Millis,
): Command | null {
  if (isOver(state, now)) return null;
  const t = clampToMatch(state, now);
  const raw = state.players[botId];
  if (!raw) return null;
  const me = checkpoint(raw, t);
  const budget = me.potatoes;

  // Intent is held for a bucket at a time so the bot can actually save toward
  // something instead of flip-flopping every tick. Both rolls are always drawn
  // so the sequence stays deterministic regardless of which branch is live.
  const bucket = Math.floor((t - state.startedAt) / INTENT_BUCKET_MS);
  const roll = rngFor(state.config.seed, bucket * 7919 + botId.length);
  const wantsDefense = roll.next() < profile.defensiveness;
  const wantsAttack = roll.next() < profile.aggression;
  const reach = P.add(budget, P.overTime(rateAt(me, t), seconds(SAVE_WINDOW_SECONDS)));

  const leader = state.order
    .filter((id) => id !== botId)
    .map((id) => ({ id, score: scoreOf(state.players[id]!, t, state.config.scoring) }))
    .sort((a, b) => b.score - a.score)[0];

  let saveTarget: Potatoes | undefined;

  // Shield up when exposed.
  if (wantsDefense && shieldPool(me, t) <= 0) {
    // Swing with what's in hand; only bank potatoes when nothing is affordable.
    const now = reachable(DEFENSES, me.defensesUsed, budget);
    if (now) return { type: "defend", player: botId, defense: now.item.id as Defense["id"] };
    saveTarget = reachable(DEFENSES, me.defensesUsed, reach)?.cost;
  }

  // Go after whoever's ahead of it.
  if (saveTarget === undefined && wantsAttack && leader) {
    const mine = scoreOf(me, t, state.config.scoring);
    if (leader.score > P.mul(mine, 0.6)) {
      const now = reachable(ATTACKS, me.attacksUsed, budget);
      if (now) {
        return {
          type: "attack",
          player: botId,
          target: leader.id,
          attack: now.item.id as Attack["id"],
        };
      }
      saveTarget = reachable(ATTACKS, me.attacksUsed, reach)?.cost;
    }
  }

  // Saving is not the same as stopping. Bank part of the pile toward the
  // target and keep compounding the rest — a bot that freezes its economy
  // every time it wants to swing just loses to anyone who never swings.
  const economyBudget =
    saveTarget === undefined
      ? budget
      : P.sub(budget, P.min(saveTarget, P.mul(budget, RESERVE_FRACTION)));

  // Upgrades are almost always the best potato-per-potato buy available.
  for (const up of UPGRADES) {
    if (me.upgrades.includes(up.id)) continue;
    if (up.requires && (me.producers[up.requires.producer] ?? 0) < up.requires.count) continue;
    if (P.gte(economyBudget, up.cost)) return { type: "buy_upgrade", player: botId, upgrade: up.id };
  }

  // Otherwise: most rate per potato spent.
  let best: { id: (typeof PRODUCERS)[number]["id"]; value: number } | undefined;
  for (const prod of PRODUCERS) {
    const cost = producerCost(prod.id, me.producers[prod.id] ?? 0);
    if (!P.gte(economyBudget, cost)) continue;
    const value = (prod.baseRate * producerMultiplier(me, prod.id)) / cost;
    if (!best || value > best.value) best = { id: prod.id, value };
  }
  if (best) return { type: "buy_producer", player: botId, producer: best.id, qty: 1 };

  return null;
}
