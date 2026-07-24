import { buildShield, shieldPool } from "./combat.js";
import {
  ATTACKS,
  DEFENSES,
  PRODUCERS,
  UPGRADES,
  type Attack,
  type Defense,
} from "./content.js";
import {
  attackCost,
  brokenRate,
  checkpoint,
  cleanRate,
  producerCost,
  producerMultiplier,
  repairCost,
  repeatCost,
} from "./economy.js";
import { P, type Millis, type Potatoes } from "./numbers.js";
import { clampToMatch, isOver, scoreOf } from "./match.js";
import { rngFor } from "./rng.js";
import type { Command, MatchState, PlayerId, PlayerState } from "./state.js";

export interface BotProfile {
  /** 0..1 — the share of its pile it's willing to throw at a single swing. */
  aggression: number;
  /** 0..1 — the share of its pile it's willing to sink into a shield. */
  defensiveness: number;
  /** Stand-in for a human mashing the button. */
  clicksPerSecond: number;
  /**
   * 0..1 — how well it plays the economy. This is the difficulty knob, and it
   * drives three things at once, all of which a beginner gets wrong:
   *
   * - whether it buys the best rate-per-potato on the board or just the
   *   cheapest thing on the shelf,
   * - how much of its pile it converts into production each time it acts (a
   *   beginner leaves potatoes sitting idle, earning nothing),
   * - whether it bothers repairing broken kit at all.
   */
  skill: number;
  /** How often it acts. */
  decisionMs: number;
}

export const BOT_PROFILES: Record<string, BotProfile> = {
  // The ladder is checked by the difficulty test in balance.test.ts, and the
  // top rung is checked against a human-speed reference player in human.test.ts
  // — "nasty should actually be able to beat you" is a claim we test, not hope.
  chill: { aggression: 0.15, defensiveness: 0.2, clicksPerSecond: 1, skill: 0.3, decisionMs: 1400 },
  scrappy: { aggression: 0.3, defensiveness: 0.4, clicksPerSecond: 2, skill: 0.6, decisionMs: 1000 },
  nasty: { aggression: 0.4, defensiveness: 0.5, clicksPerSecond: 3, skill: 1, decisionMs: 700 },
  /**
   * `nasty` with the second axis switched off. The control group only means
   * anything if it's identical apart from the thing being measured, so this has
   * to be kept in step with `nasty` whenever that's retuned.
   */
  greedy: { aggression: 0, defensiveness: 0, clicksPerSecond: 3, skill: 1, decisionMs: 700 },
};

/** Buys per turn at skill 1. A beginner (skill 0) manages one. */
const MAX_BUYS_PER_TURN = 24;

/** Priciest item it can afford within `budget`. */
function affordable<T extends Attack | Defense>(
  items: readonly T[],
  costOf: (item: T) => Potatoes,
  budget: Potatoes,
): { item: T; cost: Potatoes } | undefined {
  let best: { item: T; cost: Potatoes } | undefined;
  for (const item of items) {
    const cost = costOf(item);
    if (P.gte(budget, cost) && (!best || cost > best.cost)) best = { item, cost };
  }
  return best;
}

/** Rate per potato for the next unit of each producer, best first. */
function rankProducers(me: PlayerState) {
  return PRODUCERS.map((prod) => {
    const cost = producerCost(prod.id, me.producers[prod.id] ?? 0);
    return { id: prod.id, cost, value: (prod.baseRate * producerMultiplier(me, prod.id)) / cost };
  }).sort((a, b) => b.value - a.value);
}

/**
 * A whole turn's worth of decisions, in the order a competent player would make
 * them: patch the damage, cover yourself, take your swing, then put every
 * remaining potato to work.
 *
 * Returning a list rather than a single command is the point. A bot that buys
 * one thing per tick leaves a growing pile sitting idle in the late game, which
 * is exactly the mistake that made every difficulty crushable — potatoes that
 * aren't producing are potatoes you've already lost.
 */
export function botTurn(
  state: MatchState,
  botId: PlayerId,
  profile: BotProfile,
  now: Millis,
): Command[] {
  if (isOver(state, now)) return [];
  const t = clampToMatch(state, now);
  const raw = state.players[botId];
  if (!raw) return [];

  const out: Command[] = [];
  // A shadow copy so costs and affordability advance across the turn the same
  // way they will when these commands actually land.
  let me = checkpoint(raw, t);
  const pay = (cost: Potatoes) => {
    me = { ...me, potatoes: P.sub(me.potatoes, cost) };
  };

  // Rolled per turn, not per twenty-second bucket: difficulty shouldn't hinge
  // on one coin flip, and a bot that commits to a mood for twenty seconds
  // spends half the match doing the wrong thing.
  const roll = rngFor(state.config.seed, Math.floor(t / profile.decisionMs) * 31 + botId.length);
  const plays = () => roll.next() < profile.skill;

  // --- Repairs. Broken kit is rate you already paid for, so buying it back is
  // normally the best potato on the board. Same value test as everything else,
  // though, or cheap chip damage becomes a way to bleed the bot dry.
  if (brokenRate(me) > 0 && plays()) {
    for (const prod of PRODUCERS) {
      const broken = Math.min(me.broken[prod.id] ?? 0, me.producers[prod.id] ?? 0);
      if (broken <= 0) continue;
      const cost = repairCost(me, prod.id);
      if (cost <= 0 || !P.gte(me.potatoes, cost)) continue;
      // Worth it if the rate it buys back is cheaper than buying that rate new.
      const back = broken * prod.baseRate * producerMultiplier(me, prod.id);
      const best = rankProducers(me)[0];
      if (best && back / cost < best.value) continue;
      out.push({ type: "repair", player: botId, producer: prod.id });
      pay(cost);
      me = { ...me, broken: { ...me.broken, [prod.id]: 0 } };
    }
  }

  // --- Defense. Kept up as a standing policy rather than a mood, because
  // against anyone who attacks on a cadence, a bot that shields only when it
  // feels like it is naked most of the match.
  if (profile.defensiveness > 0 && shieldPool(me, t) <= 0) {
    const pick = affordable(
      DEFENSES,
      (d) => repeatCost(d.baseCost, d.growth, me.defensesUsed[d.id] ?? 0),
      P.mul(me.potatoes, profile.defensiveness),
    );
    if (pick) {
      out.push({ type: "defend", player: botId, defense: pick.item.id });
      pay(pick.cost);
      me = {
        ...me,
        defensesUsed: { ...me.defensesUsed, [pick.item.id]: (me.defensesUsed[pick.item.id] ?? 0) + 1 },
        effects: [...me.effects, buildShield(pick.item, botId, t, 0)],
      };
    }
  }

  // --- Sabotage, aimed at whoever's ahead. The budget share is the only thing
  // pacing this: VISION.md says contention does the pacing, not cooldowns, and
  // for a bot the share cap is what makes contention actually bite.
  const leader = state.order
    .filter((id) => id !== botId)
    .map((id) => ({ id, score: scoreOf(state.players[id]!, t, state.config.scoring) }))
    .sort((a, b) => b.score - a.score)[0];

  if (profile.aggression > 0 && leader && leader.score > P.mul(scoreOf(me, t, state.config.scoring), 0.6)) {
    const targetRate = cleanRate(state.players[leader.id]!);
    const pick = affordable(
      ATTACKS,
      (a) => attackCost(a, me.attacksUsed[a.id] ?? 0, targetRate),
      P.mul(me.potatoes, profile.aggression),
    );
    if (pick) {
      out.push({ type: "attack", player: botId, target: leader.id, attack: pick.item.id });
      pay(pick.cost);
      me = { ...me, attacksUsed: { ...me.attacksUsed, [pick.item.id]: (me.attacksUsed[pick.item.id] ?? 0) + 1 } };
    }
  }

  // --- Growth. Upgrades first (almost always the best buy on the board), then
  // producers until the pile is spent.
  for (const up of UPGRADES) {
    if (me.upgrades.includes(up.id)) continue;
    if (up.requires && (me.producers[up.requires.producer] ?? 0) < up.requires.count) continue;
    if (!P.gte(me.potatoes, up.cost)) continue;
    out.push({ type: "buy_upgrade", player: botId, upgrade: up.id });
    pay(up.cost);
    me = { ...me, upgrades: [...me.upgrades, up.id] };
  }

  const buys = Math.max(1, Math.round(MAX_BUYS_PER_TURN * profile.skill));
  for (let i = 0; i < buys; i++) {
    const ranked = rankProducers(me);
    // Playing badly, on purpose: grab the cheapest thing on the shelf. It's what
    // a first-timer does, and it quietly wrecks your curve — you pay ever more
    // per plot while the good tiers stay one save away.
    const pick = plays()
      ? ranked.find((r) => P.gte(me.potatoes, r.cost))
      : [...ranked].sort((a, b) => a.cost - b.cost).find((r) => P.gte(me.potatoes, r.cost));
    if (!pick) break;
    out.push({ type: "buy_producer", player: botId, producer: pick.id, qty: 1 });
    pay(pick.cost);
    me = { ...me, producers: { ...me.producers, [pick.id]: (me.producers[pick.id] ?? 0) + 1 } };
  }

  return out;
}
