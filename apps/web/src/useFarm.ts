import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { P, solo, type Millis, type Potatoes } from "@battle/sim";

import { nowMs } from "./clock.js";

const SAVE_KEY = "potatoes-inc:farm";
/** How often batched digs are folded into the sim. */
const DIG_FLUSH_MS = 500;
/**
 * How often the sim is actually advanced. Only has to be fine enough that a
 * weather event lands promptly — everything between ticks is extrapolated.
 */
const TICK_MS = 250;
/** Display refresh. Doesn't touch the sim. */
const RENDER_MS = 100;
const AUTOSAVE_MS = 10_000;

export interface FarmRuntime {
  farm: solo.FarmState;
  now: Millis;
  /** What happened while the tab was closed, until it's dismissed. */
  report: solo.OfflineReport | null;
  dismissReport(): void;
  /** The pile, including digs not yet flushed — what you can actually spend. */
  budget: Potatoes;
  pendingDigs: number;
  error: string | null;
  dig(): void;
  dispatch(cmd: solo.FarmCommand): void;
  /** Burn the save and start over. Not prestige — this keeps nothing. */
  abandon(): void;
}

export function hasSavedFarm(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

function loadFarm(): { farm: solo.FarmState; report: solo.OfflineReport | null } {
  let saved: solo.FarmState | null = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) saved = solo.parseFarm(raw);
  } catch {
    saved = null;
  }
  if (!saved) {
    return { farm: solo.createFarm({ seed: newSeed(), startedAt: nowMs() }), report: null };
  }
  return solo.resumeFarm(saved, nowMs());
}

function newSeed(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Drives the homestead in the browser. Every mutation goes through the same
 * `applyFarmCommand` a server would call, so moving this behind a network
 * round-trip later doesn't touch any game logic.
 */
export function useFarm(): FarmRuntime {
  const initial = useRef<{ farm: solo.FarmState; report: solo.OfflineReport | null }>();
  initial.current ??= loadFarm();

  const [farm, setFarmRaw] = useState<solo.FarmState>(initial.current.farm);
  const [now, setNow] = useState<Millis>(() => nowMs());
  const [pendingDigs, setPendingDigs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<solo.OfflineReport | null>(() =>
    solo.worthReporting(initial.current!.report) ? initial.current!.report : null,
  );

  const farmRef = useRef(farm);
  const pendingRef = useRef(0);

  const setFarm = useCallback((next: solo.FarmState) => {
    farmRef.current = next;
    setFarmRaw(next);
  }, []);

  const save = useCallback(() => {
    try {
      localStorage.setItem(SAVE_KEY, solo.serializeFarm(farmRef.current, nowMs()));
    } catch {
      // A full or blocked localStorage shouldn't take the game down with it.
    }
  }, []);

  const flushDigs = useCallback(() => {
    const count = pendingRef.current;
    if (count === 0) return;
    pendingRef.current = 0;
    setPendingDigs(0);
    const res = solo.applyFarmCommand(farmRef.current, { type: "dig", count }, nowMs());
    if (res.ok) setFarm(res.farm);
  }, [setFarm]);

  const dispatch = useCallback(
    (cmd: solo.FarmCommand) => {
      // Bank what you've already dug before spending, or the pile you can see
      // is a flush ahead of the pile you can spend.
      flushDigs();
      const res = solo.applyFarmCommand(farmRef.current, cmd, nowMs());
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setError(null);
      setFarm(res.farm);
      save();
    },
    [flushDigs, save, setFarm],
  );

  const dig = useCallback(() => {
    pendingRef.current += 1;
    setPendingDigs(pendingRef.current);
  }, []);

  // Truth: advance the sim so weather actually lands.
  useEffect(() => {
    const id = setInterval(() => {
      const { farm: next, events } = solo.advance(farmRef.current, nowMs());
      if (events.length > 0 || next.checkpointAt !== farmRef.current.checkpointAt) setFarm(next);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [setFarm]);

  useEffect(() => {
    const id = setInterval(() => setNow(nowMs()), RENDER_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(flushDigs, DIG_FLUSH_MS);
    return () => clearInterval(id);
  }, [flushDigs]);

  useEffect(() => {
    const id = setInterval(save, AUTOSAVE_MS);
    return () => clearInterval(id);
  }, [save]);

  // Closing the tab is the single most likely moment to lose progress, and on
  // mobile `beforeunload` often never fires — `hidden` is the one that does.
  useEffect(() => {
    const onHide = () => {
      flushDigs();
      save();
    };
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flushDigs, save]);

  const abandon = useCallback(() => {
    pendingRef.current = 0;
    setPendingDigs(0);
    setError(null);
    setReport(null);
    const fresh = solo.createFarm({ seed: newSeed(), startedAt: nowMs() });
    setFarm(fresh);
    try {
      localStorage.setItem(SAVE_KEY, solo.serializeFarm(fresh, nowMs()));
    } catch {
      /* see `save` */
    }
  }, [setFarm]);

  const budget = useMemo(
    () => P.add(solo.projectedPotatoes(farm, now), P.mul(solo.clickYield(farm), pendingDigs)),
    [farm, now, pendingDigs],
  );

  return {
    farm,
    now,
    report,
    dismissReport: () => setReport(null),
    budget,
    pendingDigs,
    error,
    dig,
    dispatch,
    abandon,
  };
}
