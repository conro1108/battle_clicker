import { ms, type Millis } from "@battle/sim";

/**
 * Single source of "now" for the whole app. Locally this is just the wall
 * clock; when the Supabase backend lands, the offset from the server-time
 * handshake gets applied here and nothing else has to change (STACK.md:
 * server time only).
 */
let offset = 0;

export function setServerOffset(deltaMs: number): void {
  offset = deltaMs;
}

/**
 * A second offset, owned by the back room, for shoving the farm forward in time.
 *
 * It's a separate number from `offset` because it's a different kind of lie: the
 * server offset corrects the clock, this one falsifies it. Kept in
 * `localStorage` because the alternative is worse — the sim checkpoints at the
 * skewed time, so a skew that vanished on reload would leave a farm whose
 * checkpoint is in the future, and `resumeFarm` would freeze it until the real
 * clock caught up. Two days of a dead game is a strange thing for a dev button
 * to do. So the skew stays until it's cleared, and clearing it has that same
 * consequence, said out loud on the button.
 */
const SKEW_KEY = "potatoes-inc:dev-skew";

let skew = readSkew();

function readSkew(): number {
  try {
    const n = Number(localStorage.getItem(SKEW_KEY));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function clockSkew(): number {
  return skew;
}

/** Shove the clock forward by `byMs`, or back to true time with 0. */
export function setClockSkew(next: number): void {
  skew = Math.max(0, next);
  try {
    if (skew === 0) localStorage.removeItem(SKEW_KEY);
    else localStorage.setItem(SKEW_KEY, String(skew));
  } catch {
    // Losing the skew is a dev inconvenience, not a game problem.
  }
}

export function nowMs(): Millis {
  return ms(Date.now() + offset + skew);
}
