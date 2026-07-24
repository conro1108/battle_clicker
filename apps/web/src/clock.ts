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

export function nowMs(): Millis {
  return ms(Date.now() + offset);
}
