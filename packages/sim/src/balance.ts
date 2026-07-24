import { BOT_PROFILES, botTurn, type BotProfile } from "./bot.js";
import { HUMAN_STYLES, clicksPerSecondAt, humanTurn, type HumanStyle } from "./reference.js";
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
  players: {
    id: string;
    name: string;
    /** A bot seat. Mutually exclusive with `human`. */
    profile?: keyof typeof BOT_PROFILES;
    /** A reference-human seat, for grading the difficulty ladder. */
    human?: keyof typeof HUMAN_STYLES;
    /** Overrides on top of the named profile, for probing one knob at a time. */
    tweak?: Partial<BotProfile>;
    /** Seconds [from, to) during which this seat is willing to attack at all. */
    attackWindow?: [number, number];
  }[];
  stepMs?: number;
  sampleEverySeconds?: number;
}): BalanceResult {
  const step = opts.stepMs ?? 250;
  const sampleEvery = opts.sampleEverySeconds ?? 30;
  const startedAt = ms(0);

  let state = createMatch({
    config: { seed: opts.seed, durationMs: opts.durationMs, scoring: opts.scoring ?? "total_harvested" },
    startedAt,
    players: opts.players.map((p) => ({ id: p.id, name: p.name, isBot: !p.human })),
  });

  const profiles = new Map<string, BotProfile>(
    opts.players
      .filter((p) => !p.human)
      .map((p) => [
        p.id,
        { ...(BOT_PROFILES[p.profile ?? "scrappy"] ?? BOT_PROFILES.scrappy!), ...p.tweak },
      ]),
  );
  const humans = new Map<string, HumanStyle>(
    opts.players
      .filter((p) => p.human)
      .map((p) => [p.id, HUMAN_STYLES[p.human!] ?? HUMAN_STYLES.builder!]),
  );
  const windows = new Map(opts.players.map((p) => [p.id, p.attackWindow]));
  const clickCarry = new Map<string, number>(opts.players.map((p) => [p.id, 0]));
  const nextDecision = new Map<string, number>(opts.players.map((p) => [p.id, startedAt]));
  const samples: BalanceSample[] = [];

  const apply = (state: MatchState, cmd: Parameters<typeof applyCommand>[1], t: Millis) => {
    const res = applyCommand(state, cmd, t);
    return res.ok ? res.state : state;
  };

  const end = endsAt(state);
  for (let t = startedAt; t < end; t = ms(t + step)) {
    const elapsedSeconds = (t - startedAt) / 1000;
    for (const p of opts.players) {
      const style = humans.get(p.id);
      const profile = profiles.get(p.id);

      const cps = style
        ? clicksPerSecondAt(style, elapsedSeconds)
        : profile!.clicksPerSecond;
      const carry = clickCarry.get(p.id)! + (cps * step) / 1000;
      const clicks = Math.floor(carry);
      clickCarry.set(p.id, carry - clicks);
      if (clicks > 0) state = apply(state, { type: "click", player: p.id, count: clicks }, t);

      // Each seat acts on its own cadence, so these runs measure the same
      // opponent the app actually puts in front of a player.
      if (t < nextDecision.get(p.id)!) continue;
      nextDecision.set(p.id, t + (style?.decisionMs ?? profile!.decisionMs));

      const window = windows.get(p.id);
      const mayAttack =
        !window || (elapsedSeconds >= window[0] && elapsedSeconds < window[1]);

      if (style) {
        const effective = mayAttack ? style : { ...style, attacks: false };
        for (const cmd of humanTurn(state, p.id, effective, t)) state = apply(state, cmd, t);
      } else {
        const effective = mayAttack ? profile! : { ...profile!, aggression: 0 };
        for (const cmd of botTurn(state, p.id, effective, t)) state = apply(state, cmd, t);
      }
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
