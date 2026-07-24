# STACK.md

## The stack

- **Frontend** — TypeScript + React, Vite SPA, deployed static to Vercel.
- **Backend** — Supabase: Postgres as source of truth, Edge Functions
  (Deno/TS) as the authority for mutations, Realtime Broadcast for opponent
  updates.
- **Auth** — Supabase Auth, anonymous sign-in with upgrade to a real account.
- **Tests** — vitest against `packages/sim`.

## The core idea: no tick loop

Game state is a pure function of `(checkpoint, elapsed, rate, active
effects)`. Store `{potatoes_at_t0, rate, t0}` plus a timestamped event log;
client and server both integrate forward to "now" on demand. There is no
server game loop — which is what makes a request/response backend like Edge
Functions viable at all.

Rates only change on discrete events, so:

- **Opponent state doesn't stream.** Broadcast *rate changes* and let each
  client extrapolate locally — a few messages per player per minute. Works
  because you only ever see opponent count + production rate.
- **Slow burn is free.** Offline progression is the same integration with a
  bigger `elapsed`. No second system, so the sit-down-vs-slow-burn call
  stays genuinely deferred.

This relies on production rate staying independent of stockpile size. See
"Parked ideas" in VISION.md — spoilage would break it.

## Decisions

**Vite, not Next.js.** SPA behind auth, no SEO surface. SSR is overhead.

**Supabase Auth, not Clerk.** RLS keys off Supabase JWTs, and anonymous
sign-in matters for "send a friend a link and race me now." Clerk earns its
keep on orgs and SSO; we have neither.

**`packages/sim` is pure TS, zero I/O.** Imported by both the client
(optimistic prediction) and the Edge Function (authority), so prediction and
truth can't drift. Economy logic never leaks into plpgsql or React
components.

This is also the escape hatch: if the sim outgrows closed-form and needs a
real tick, lift `packages/sim` onto a stateful server (Fly/Railway). Keep it
portable and that migration stays cheap.

**Mutations take a lock.** Every buy/attack does `SELECT ... FOR UPDATE` on
the match row. Sabotage touches two players' state — read-modify-write
without a lock will corrupt.

**Server time only.** All timestamps from Postgres `now()`, plus a clock
offset handshake so client extrapolation aligns with authority. Client clocks
lie, and retrofitting this is miserable.

**Wrap the resource in a `Potatoes` type.** f64 dies around 1e15 and idle
numbers climb fast. Not building bignum now, just keeping the swap contained.

**Clicks batch.** Accumulate client-side, flush a count every ~500ms with a
server-side rate clamp. It's the only high-frequency write.

**Randomness is seeded.** Any pests/weather rolls come from a PRNG keyed on
`match_seed + event_index`, so state stays replayable instead of live-rolled.
