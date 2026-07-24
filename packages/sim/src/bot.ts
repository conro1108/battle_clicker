import { shieldPool } from "./combat.js";
import {
  ATTACKS,
  DEFENSES,
  PRODUCERS,
  UPGRADES,
  type Attack,
  type Defense,
} from "./content.js";
import { checkpoint, producerCost, producerMultiplier, repeatCost } from "./economy.js";
import { P, type Millis, type Potatoes } from "./numbers.js";
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
};

/** Share of the pile the bot will commit to a single non-economy purchase. */
const OFFENSE_BUDGET = 0.35;
const DEFENSE_BUDGET = 0.3;

function bestAffordable<T extends Attack | Defense>(
  items: readonly T[],
  used: Partial<Record<string, number>>,
  budget: Potatoes,
): { item: T; cost: Potatoes } | undefined {
  let best: { item: T; cost: Potatoes } | undefined;
  for (const item of items) {
    const cost = repeatCost(item.baseCost, item.growth, used[item.id] ?? 0);
    if (P.gte(budget, cost) && (!best || cost > best.cost)) best = { item, cost };
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
  const roll = rngFor(state.config.seed, state.eventIndex * 31 + Math.floor(t / 1000));

  // Shield up when exposed — more eagerly if someone's actually leading.
  if (shieldPool(me, t) <= 0 && roll.next() < profile.defensiveness) {
    const pick = bestAffordable(DEFENSES, me.defensesUsed, P.mul(budget, DEFENSE_BUDGET));
    if (pick) return { type: "defend", player: botId, defense: pick.item.id as Defense["id"] };
  }

  // Go after whoever's ahead of it.
  const leader = state.order
    .filter((id) => id !== botId)
    .map((id) => ({ id, score: scoreOf(state.players[id]!, t, state.config.scoring) }))
    .sort((a, b) => b.score - a.score)[0];
  if (leader && roll.next() < profile.aggression) {
    const mine = scoreOf(me, t, state.config.scoring);
    if (leader.score > P.mul(mine, 0.6)) {
      const pick = bestAffordable(ATTACKS, me.attacksUsed, P.mul(budget, OFFENSE_BUDGET));
      if (pick) {
        return { type: "attack", player: botId, target: leader.id, attack: pick.item.id as Attack["id"] };
      }
    }
  }

  // Upgrades are almost always the best potato-per-potato buy available.
  for (const up of UPGRADES) {
    if (me.upgrades.includes(up.id)) continue;
    if (up.requires && (me.producers[up.requires.producer] ?? 0) < up.requires.count) continue;
    if (P.gte(budget, up.cost)) return { type: "buy_upgrade", player: botId, upgrade: up.id };
  }

  // Otherwise: most rate per potato spent.
  let best: { id: (typeof PRODUCERS)[number]["id"]; value: number } | undefined;
  for (const prod of PRODUCERS) {
    const cost = producerCost(prod.id, me.producers[prod.id] ?? 0);
    if (!P.gte(budget, cost)) continue;
    const value = (prod.baseRate * producerMultiplier(me, prod.id)) / cost;
    if (!best || value > best.value) best = { id: prod.id, value };
  }
  if (best) return { type: "buy_producer", player: botId, producer: best.id, qty: 1 };

  return null;
}
