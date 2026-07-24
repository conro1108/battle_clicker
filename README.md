# Battle Clicker

A playable prototype of the game in [VISION.md](VISION.md): a head-to-head
potato clicker where every purchase competes for the same currency across
production, sabotage, and defense.

This is the "prove the core loop first" slice VISION.md asks for. It runs
entirely in the browser against a bot — no Supabase, no auth, no network. The
backend in [STACK.md](STACK.md) is deliberately not built yet, but the sim is
already shaped for it.

## Running it

```bash
npm install
```

```bash
npm run dev
```

```bash
npm test
```

## Layout

- **`packages/sim`** — the whole game, as pure TypeScript with zero I/O. Both
  the client and (eventually) the Edge Function import this, so optimistic
  prediction and server truth can't drift.
- **`apps/web`** — Vite + React. Owns rendering and the local match runtime;
  no economy logic.

Commands go through `applyCommand(state, cmd, now)`, which is the single
authority for mutations. The local runtime calls it directly; swapping that for
a network round-trip shouldn't touch any game logic.

## What's implemented

Production rate is piecewise-constant with boundaries only at effect expiries,
so `potatoesAt()` integrates in closed form and there is no tick loop — the
no-server-loop model from STACK.md. Offline progression is the same call with a
bigger elapsed, which is what keeps the sit-down-vs-slow-burn decision genuinely
deferred.

Sabotage mostly does **persistent damage**: pests and disease break producer
units, and broken units stay broken until their owner pays to repair them.
Weather is the exception — Drought is a timed slow that passes on its own.

That split is what makes sabotage a real decision rather than a timing trick.
When every attack was a temporary rate cut, the victim recovered for free, so
attacking early meant spending potatoes that would have compounded in order to
deny forty-five seconds of output. Damage that persists costs them either way:
lost production until they fix it, or repair potatoes that didn't compound.

Defense and repair are the same axis — pay up front to prevent, or pay after to
fix. Attack `power` is weighed against a drainable shield pool: enough shield
absorbs a hit outright, less scales the damage down rather than negating it, and
either way the shield spends what it soaked. Stacked slows floor at 15% of clean
rate and no single producer type can be more than 60% broken, so nobody gets
knocked out.

Opponent info goes through `opponentView()` — count and production rate, nothing
else — so the fog rule lives in one place instead of relying on the UI to be careful.

## Balance harness

`packages/sim/src/balance.ts` runs whole matches headlessly with bots on every
seat. This is the tuning loop: change a cost curve, run `npm test`, see whether
matches still go the distance.

It's load-bearing. The first run showed sabotage and defense firing *zero* times
in a five-minute match, and a follow-up showed pure growth beating sabotage on
every seed — the second axis the design rests on didn't exist. The fix was mostly
bot policy (it froze its economy while saving for an attack, so swinging was
strictly worse than never swinging) plus re-scaling the tree onto the range a
short match actually reaches.

The guard rail is `leaves neither pure growth nor sabotage dominant`. It's not a
claim the game is balanced for humans — these are crude bots — but strict
dominance either way would collapse this back into a solo idle clicker, and that
test fails loudly if it happens.

The third, `makes sabotage worth considering early, and still best late`, is
what drove the move to persistent damage: with timed effects, attacking in the
first hundred seconds won 2 seeds out of 15, and the optimal line collapsed into
"ignore sabotage, then dump everything at the buzzer". It's now 7/15 early and
15/15 late — late is still the stronger window, which is fine, but early is a
real option rather than a self-own.

The second test, `orders the difficulty ladder the way the lobby claims`, exists
because difficulty kept coming out **backwards**. In an exponential economy,
acting *less* often means a bigger pile between purchases, and a bigger pile buys
better tiers — so slowing a bot down made it stronger. Difficulty is therefore a
single `skill` knob (how often it holds out for the best rate-per-potato rather
than dumping the pile into whatever's cheapest), with decision cadence held
uniform. Scores are noisy enough across seeds that the ladder has to be checked
on a median, not a single match.

## Open questions this raised

- **What does the winner actually win on?** VISION.md says "has the most of the
  target resource when the clock hits zero", but taken literally that makes
  spending late in the match cost you the game and flattens the endgame into
  "stop buying". Both rules are implemented and selectable in the lobby
  (`total_harvested` is the default); worth playing both before deciding.
- **Sabotage pacing.** Repeat cost is the only thing limiting how often you can
  swing, per VISION.md's "no cooldowns" answer. It works for a human, who feels
  the cost — but a bot with no such instinct fired every decision tick and
  immolated its own economy, so `bot.ts` needed an explicit cap on what share of
  the pile one swing can take. Worth knowing that resource contention alone
  didn't self-pace.
- **Repair is instant and free of attention.** Right now fixing broken kit is a
  single click at 75% of rebuild cost. That makes damage a pure tax. If we want
  getting hit to feel worse, repair wanting *time* (or a queue) is the obvious
  next lever.
