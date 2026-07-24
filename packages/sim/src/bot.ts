import { shieldPool } from "./combat.js";
import {
  ATTACKS,
  DEFENSES,
  PRODUCERS,
  UPGRADES,
  type Attack,
  type Defense,
} from "./content.js";
import {
  brokenRate,
  checkpoint,
  producerCost,
  producerMultiplier,
  rateAt,
  repairCost,
  repeatCost,
} from "./economy.js";
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
  /**
   * 0..1 — how often it plays the producer ladder well: hold out for the best
   * rate-per-potato on the board rather than dumping the pile into whatever is
   * cheapest. This is the difficulty knob.
   *
   * Note that decision *cadence* is deliberately not a difficulty knob. Acting
   * less often means accumulating a bigger pile between buys, which buys better
   * tiers — a slower bot came out stronger, which is not what a difficulty
   * setting should do.
   */
  skill: number;
  /** How often it acts. Kept uniform across profiles; see `skill`. */
  decisionMs: number;
}

export const BOT_PROFILES: Record<string, BotProfile> = {
  // Skill maps steeply onto score — 0.35/0.7/0.85 lands roughly 75K/320K/1.3M
  // median over a five-minute match. See the ladder test in balance.test.ts.
  chill: { aggression: 0.15, defensiveness: 0.3, clicksPerSecond: 1, skill: 0.35, decisionMs: 800 },
  scrappy: { aggression: 0.45, defensiveness: 0.45, clicksPerSecond: 2, skill: 0.7, decisionMs: 800 },
  nasty: { aggression: 0.7, defensiveness: 0.55, clicksPerSecond: 3, skill: 0.85, decisionMs: 800 },
  /** Never spends a potato on anyone else. The control group for balance runs. */
  greedy: { aggression: 0, defensiveness: 0, clicksPerSecond: 2, skill: 0.85, decisionMs: 800 },
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
const RESERVE_FRACTION = 0.25;
/**
 * Most of the pile it will put into a single swing. VISION.md says pacing comes
 * from resource contention rather than cooldowns, and for a human it does — you
 * feel the cost. A bot feels nothing, so without this it fires every decision
 * tick while it's in an aggressive mood and immolates its own economy.
 */
const SPEND_SHARE = 0.55;

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
    const now = reachable(DEFENSES, me.defensesUsed, P.mul(budget, SPEND_SHARE));
    if (now) return { type: "defend", player: botId, defense: now.item.id as Defense["id"] };
    saveTarget = reachable(DEFENSES, me.defensesUsed, reach)?.cost;
  }

  // Go after whoever's ahead of it.
  if (saveTarget === undefined && wantsAttack && leader) {
    const mine = scoreOf(me, t, state.config.scoring);
    if (leader.score > P.mul(mine, 0.6)) {
      const now = reachable(ATTACKS, me.attacksUsed, P.mul(budget, SPEND_SHARE));
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

  // Fix what's broken first when it's worth fixing. Repairs buy back rate you
  // already paid for, so they're normally the best potatoes on the board — but
  // a bot that repairs unconditionally can be bled dry by cheap chip damage,
  // hence the same value test everything else gets.
  if (brokenRate(me) > 0) {
    let bestRepair: { id: (typeof PRODUCERS)[number]["id"]; value: number; cost: Potatoes } | undefined;
    for (const prod of PRODUCERS) {
      const broken = Math.min(me.broken[prod.id] ?? 0, me.producers[prod.id] ?? 0);
      if (broken <= 0) continue;
      const cost = repairCost(me, prod.id);
      if (cost <= 0) continue;
      const value = (broken * prod.baseRate * producerMultiplier(me, prod.id)) / cost;
      if (!bestRepair || value > bestRepair.value) bestRepair = { id: prod.id, value, cost };
    }
    if (bestRepair && P.gte(economyBudget, bestRepair.cost)) {
      return { type: "repair", player: botId, producer: bestRepair.id };
    }
  }

  // Upgrades are almost always the best potato-per-potato buy available.
  for (const up of UPGRADES) {
    if (me.upgrades.includes(up.id)) continue;
    if (up.requires && (me.producers[up.requires.producer] ?? 0) < up.requires.count) continue;
    if (P.gte(economyBudget, up.cost)) return { type: "buy_upgrade", player: botId, upgrade: up.id };
  }

  // Rank every producer by rate per potato, affordable or not. The best buy on
  // the board is usually one tier above what's in hand, so a bot that only ever
  // considers what it can afford right now permanently underbuilds.
  const ranked = PRODUCERS.map((prod) => {
    const cost = producerCost(prod.id, me.producers[prod.id] ?? 0);
    return { id: prod.id, cost, value: (prod.baseRate * producerMultiplier(me, prod.id)) / cost };
  }).sort((a, b) => b.value - a.value);

  // Rolled per decision rather than per intent bucket, so a difficulty setting
  // isn't one twenty-second coin flip deciding the match.
  const tickRoll = rngFor(
    state.config.seed,
    Math.floor(t / profile.decisionMs) * 31 + botId.length,
  );

  if (tickRoll.next() < profile.skill) {
    const bestOverall = ranked[0];
    if (bestOverall) {
      if (P.gte(economyBudget, bestOverall.cost)) {
        return { type: "buy_producer", player: botId, producer: bestOverall.id, qty: 1 };
      }
      // Hold out for it, but only if it's actually in reach — otherwise the bot
      // stares at a Tuber Lab it will never afford while its farm sits idle.
      if (P.gte(reach, bestOverall.cost)) return null;
    }
    const bestAffordable = ranked.find((r) => P.gte(economyBudget, r.cost));
    if (bestAffordable) {
      return { type: "buy_producer", player: botId, producer: bestAffordable.id, qty: 1 };
    }
    return null;
  }

  // Playing badly, on purpose: grab the cheapest thing on the shelf. It's what
  // a first-timer does, and it quietly wrecks your curve — you pay ever more
  // per plot while the good tiers stay one save away.
  const cheapest = [...ranked]
    .sort((a, b) => a.cost - b.cost)
    .find((r) => P.gte(economyBudget, r.cost));
  if (cheapest) return { type: "buy_producer", player: botId, producer: cheapest.id, qty: 1 };

  return null;
}
