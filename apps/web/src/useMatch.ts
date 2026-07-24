import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BOT_PROFILES,
  applyCommand,
  botTurn,
  checkpoint,
  clampToMatch,
  clickYield,
  createMatch,
  isOver,
  type BotProfile,
  type Command,
  type MatchState,
  type Millis,
  type PlayerState,
  type ScoringRule,
} from "@battle/sim";

import { nowMs } from "./clock.js";

/** How often batched clicks are flushed into the sim (STACK.md). */
const CLICK_FLUSH_MS = 500;
/**
 * How often the bot loop wakes up. Each profile decides on its own cadence
 * (`decisionMs`); this just has to be fine enough to serve the fastest one.
 */
const BOT_TICK_MS = 250;
/** Display refresh. The sim isn't ticking — this only redraws extrapolated numbers. */
const RENDER_MS = 100;

export const YOU = "you";
export const BOT = "bot";

export interface MatchSetup {
  playerName: string;
  durationMs: number;
  botProfile: keyof typeof BOT_PROFILES;
  scoring: ScoringRule;
}

export interface MatchRuntime {
  state: MatchState;
  now: Millis;
  /** You, integrated forward to `now`. */
  me: PlayerState;
  /** Clicks banked client-side but not yet flushed — shown optimistically. */
  pendingClicks: number;
  over: boolean;
  error: string | null;
  click(): void;
  dispatch(cmd: Command): void;
  restart(): void;
}

function buildMatch(setup: MatchSetup, startedAt: Millis): MatchState {
  return createMatch({
    config: {
      seed: `${startedAt}-${Math.floor(Math.random() * 1e9)}`,
      durationMs: setup.durationMs,
      scoring: setup.scoring,
    },
    startedAt,
    players: [
      { id: YOU, name: setup.playerName || "You" },
      { id: BOT, name: botName(setup.botProfile), isBot: true },
    ],
  });
}

function botName(profile: keyof typeof BOT_PROFILES): string {
  return { chill: "Sleepy Pete", scrappy: "Marge", nasty: "Big Russet" }[profile] ?? "Bot";
}

/**
 * Drives a match entirely in the browser. Commands go through the same
 * `applyCommand` an Edge Function will call, so swapping the local dispatch
 * for a network round-trip later doesn't touch any game logic.
 */
export function useMatch(setup: MatchSetup): MatchRuntime {
  const [state, setStateRaw] = useState<MatchState>(() => buildMatch(setup, nowMs()));
  const [now, setNow] = useState<Millis>(() => nowMs());
  const [pendingClicks, setPendingClicks] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Intervals need the latest state without re-subscribing every render.
  const stateRef = useRef(state);
  const pendingRef = useRef(0);
  const botProfile: BotProfile = BOT_PROFILES[setup.botProfile] ?? BOT_PROFILES.scrappy!;

  const setState = useCallback((next: MatchState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);

  const dispatch = useCallback(
    (cmd: Command) => {
      const res = applyCommand(stateRef.current, cmd, nowMs());
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setError(null);
      setState(res.state);
    },
    [setState],
  );

  const click = useCallback(() => {
    if (isOver(stateRef.current, nowMs())) return;
    pendingRef.current += 1;
    setPendingClicks(pendingRef.current);
  }, []);

  const flushClicks = useCallback(() => {
    const count = pendingRef.current;
    if (count === 0) return;
    pendingRef.current = 0;
    setPendingClicks(0);
    const res = applyCommand(stateRef.current, { type: "click", player: YOU, count }, nowMs());
    if (res.ok) setState(res.state);
  }, [setState]);

  // Display clock.
  useEffect(() => {
    const id = setInterval(() => setNow(nowMs()), RENDER_MS);
    return () => clearInterval(id);
  }, []);

  // Click flush.
  useEffect(() => {
    const id = setInterval(flushClicks, CLICK_FLUSH_MS);
    return () => clearInterval(id);
  }, [flushClicks]);

  // Bot: a click cadence plus a purchase turn, both through applyCommand.
  useEffect(() => {
    let clickCarry = 0;
    let nextDecision = 0;
    const id = setInterval(() => {
      const t = nowMs();
      if (isOver(stateRef.current, t)) return;

      clickCarry += (botProfile.clicksPerSecond * BOT_TICK_MS) / 1000;
      const clicks = Math.floor(clickCarry);
      if (clicks > 0) {
        clickCarry -= clicks;
        const res = applyCommand(stateRef.current, { type: "click", player: BOT, count: clicks }, t);
        if (res.ok) setState(res.state);
      }

      if (t < nextDecision) return;
      nextDecision = t + botProfile.decisionMs;
      for (const cmd of botTurn(stateRef.current, BOT, botProfile, t)) {
        const res = applyCommand(stateRef.current, cmd, t);
        if (res.ok) setState(res.state);
      }
    }, BOT_TICK_MS);
    return () => clearInterval(id);
  }, [botProfile, setState]);

  const restart = useCallback(() => {
    pendingRef.current = 0;
    setPendingClicks(0);
    setError(null);
    setState(buildMatch(setup, nowMs()));
  }, [setup, setState]);

  const clamped = clampToMatch(state, now);
  const me = useMemo(() => checkpoint(state.players[YOU]!, clamped), [state, clamped]);

  return {
    state,
    now: clamped,
    me,
    pendingClicks,
    over: isOver(state, now),
    error,
    click,
    dispatch,
    restart,
  };
}

export { clickYield };
