import { MAX_STEAL_PCT, PRODUCERS, PRODUCER_BY_ID, type Attack, type Defense } from "./content.js";
import { isActive, producerRate } from "./economy.js";
import { P, ms, type Millis, type Potatoes } from "./numbers.js";
import type { Rng } from "./rng.js";
import type { ActiveEffect, PlayerState } from "./state.js";

export interface AttackOutcome {
  /** 0 = landed clean, 1 = absorbed entirely. */
  mitigation: number;
  blocked: boolean;
  /** Shield power consumed soaking this. */
  absorbed: number;
  stolen: Potatoes;
  applied?: ActiveEffect;
  disabledProducerName?: string;
}

function activeShields(p: PlayerState, t: Millis) {
  return p.effects
    .filter((e): e is Extract<ActiveEffect, { kind: "shield" }> => e.kind === "shield" && isActive(e, t))
    .sort((a, b) => a.startedAt - b.startedAt);
}

export function shieldPool(p: PlayerState, t: Millis): number {
  return activeShields(p, t).reduce((sum, s) => sum + s.power, 0);
}

/** Drain `amount` of absorb pool, oldest shield first. */
function drainShields(p: PlayerState, t: Millis, amount: number): PlayerState {
  let left = amount;
  const effects = p.effects.map((e) => {
    if (left <= 0 || e.kind !== "shield" || !isActive(e, t)) return e;
    const taken = Math.min(e.power, left);
    left -= taken;
    return { ...e, power: e.power - taken };
  });
  return { ...p, effects: effects.filter((e) => e.kind !== "shield" || e.power > 0) };
}

/** The producer contributing the most right now — what Ruined Soil goes for. */
function bestProducer(p: PlayerState, t: Millis) {
  let best: { id: (typeof PRODUCERS)[number]["id"]; rate: number } | undefined;
  for (const prod of PRODUCERS) {
    const r = producerRate(p, prod.id, t);
    if (r > 0 && (!best || r > best.rate)) best = { id: prod.id, rate: r };
  }
  return best;
}

/**
 * Attack power vs. remaining shield pool. A defense with at least as much
 * power left as the attack absorbs it outright; anything less scales the
 * effect down rather than negating it (VISION.md: defense is a range, not a
 * yes/no). Either way the shield spends what it soaked.
 */
export function resolveAttack(args: {
  attack: Attack;
  attackerId: string;
  /** Must already be checkpointed to `at`. */
  defender: PlayerState;
  at: Millis;
  rng: Rng;
  eventIndex: number;
}): { defender: PlayerState; outcome: AttackOutcome } {
  const { attack, attackerId, at, rng, eventIndex } = args;

  const pool = shieldPool(args.defender, at);
  const mitigation = attack.power > 0 ? Math.min(1, pool / attack.power) : 0;
  const absorbed = Math.min(pool, attack.power);
  let defender = drainShields(args.defender, at, absorbed);

  const potency = 1 - mitigation;
  const outcome: AttackOutcome = {
    mitigation,
    blocked: potency <= 1e-9,
    absorbed,
    stolen: P.zero,
  };
  if (outcome.blocked) return { defender, outcome };

  const id = `${eventIndex}:${attack.id}`;
  switch (attack.effect.kind) {
    case "steal": {
      const pct = Math.min(
        MAX_STEAL_PCT,
        rng.range(attack.effect.minPct, attack.effect.maxPct) * potency,
      );
      // Comes off the pile only — lifetime harvested is never clawed back.
      const stolen = P.mul(defender.potatoes, pct);
      defender = { ...defender, potatoes: P.sub(defender.potatoes, stolen) };
      outcome.stolen = stolen;
      break;
    }
    case "slow": {
      const applied: ActiveEffect = {
        kind: "slow",
        id,
        source: attackerId,
        label: attack.name,
        multiplier: 1 - attack.effect.cut * potency,
        startedAt: at,
        expiresAt: ms(at + attack.effect.durationMs),
      };
      defender = { ...defender, effects: [...defender.effects, applied] };
      outcome.applied = applied;
      break;
    }
    case "disable": {
      const target = bestProducer(defender, at);
      if (!target) break; // nothing running to shut off
      // Binary effect, so mitigation buys back time instead of magnitude.
      const applied: ActiveEffect = {
        kind: "disable",
        id,
        source: attackerId,
        label: attack.name,
        producer: target.id,
        startedAt: at,
        expiresAt: ms(at + attack.effect.durationMs * potency),
      };
      defender = { ...defender, effects: [...defender.effects, applied] };
      outcome.applied = applied;
      outcome.disabledProducerName = PRODUCER_BY_ID[target.id].name;
      break;
    }
  }

  return { defender, outcome };
}

export function buildShield(
  defense: Defense,
  playerId: string,
  at: Millis,
  eventIndex: number,
): ActiveEffect {
  return {
    kind: "shield",
    id: `${eventIndex}:${defense.id}`,
    source: playerId,
    label: defense.name,
    power: defense.power,
    initialPower: defense.power,
    startedAt: at,
    expiresAt: ms(at + defense.durationMs),
  };
}
