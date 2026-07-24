import { BOT_PROFILES, botDecide, type BotProfile } from "./bot.js";
import { applyCommand, createMatch, endsAt, scoreOf } from "./match.js";
import { rateAt } from "./economy.js";
import { ms, type Millis } from "./numbers.js";
import type { MatchState, ScoringRule } from "./state.js";

export interface BalanceSample {
  atSeconds: number;
  scores: Record<string, number>;
  rates: Record<string, number>;
}

export interface BalanceResult {
  state: MatchState;
  samples: BalanceSample[];
  finalScores: Record<string, number>;
  /** Sabotage events that actually landed, by attacker. */
  attacksLanded: number;
  attacksBlocked: number;
  defensesBought: number;
}

/**
 * Runs a whole match headlessly with bots on every seat. This is the tuning
 * loop for the economy: change a cost curve, run this, see whether matches
 * still go the distance instead of being decided in the first thirty seconds.
 */
export function simulateMatch(opts: {
  seed: string;
  durationMs: number;
  scoring?: ScoringRule;
  players: { id: string; name: string; profile: keyof typeof BOT_PROFILES }[];
  stepMs?: number;
  sampleEverySeconds?: number;
}): BalanceResult {
  const step = opts.stepMs ?? 250;
  const sampleEvery = opts.sampleEverySeconds ?? 30;
  const startedAt = ms(0);

  let state = createMatch({
    config: { seed: opts.seed, durationMs: opts.durationMs, scoring: opts.scoring ?? "total_harvested" },
    startedAt,
    players: opts.players.map((p) => ({ id: p.id, name: p.name, isBot: true })),
  });

  const profiles = new Map<string, BotProfile>(
    opts.players.map((p) => [p.id, BOT_PROFILES[p.profile] ?? BOT_PROFILES.scrappy!]),
  );
  const clickCarry = new Map<string, number>(opts.players.map((p) => [p.id, 0]));
  const samples: BalanceSample[] = [];

  const apply = (state: MatchState, cmd: Parameters<typeof applyCommand>[1], t: Millis) => {
    const res = applyCommand(state, cmd, t);
    return res.ok ? res.state : state;
  };

  const end = endsAt(state);
  for (let t = startedAt; t < end; t = ms(t + step)) {
    for (const p of opts.players) {
      const profile = profiles.get(p.id)!;
      const carry = clickCarry.get(p.id)! + (profile.clicksPerSecond * step) / 1000;
      const clicks = Math.floor(carry);
      clickCarry.set(p.id, carry - clicks);
      if (clicks > 0) state = apply(state, { type: "click", player: p.id, count: clicks }, t);

      const decision = botDecide(state, p.id, profile, t);
      if (decision) state = apply(state, decision, t);
    }

    const elapsed = (t - startedAt) / 1000;
    if (elapsed % sampleEvery === 0) {
      const scores: Record<string, number> = {};
      const rates: Record<string, number> = {};
      for (const p of opts.players) {
        scores[p.id] = scoreOf(state.players[p.id]!, t, state.config.scoring);
        rates[p.id] = rateAt(state.players[p.id]!, t);
      }
      samples.push({ atSeconds: elapsed, scores, rates });
    }
  }

  const finalScores: Record<string, number> = {};
  for (const p of opts.players) {
    finalScores[p.id] = scoreOf(state.players[p.id]!, end, state.config.scoring);
  }

  return {
    state,
    samples,
    finalScores,
    attacksLanded: state.log.filter((e) => e.tone === "bad").length,
    attacksBlocked: state.log.filter((e) => e.text.includes("fully blocked")).length,
    defensesBought: state.log.filter((e) => e.text.startsWith("put up")).length,
  };
}
