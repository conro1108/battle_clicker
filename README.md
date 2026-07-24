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

Sabotage weighs attack `power` against a drainable shield pool. A shield with
enough left absorbs an attack outright; less scales the effect down rather than
negating it, and either way the shield spends what it soaked. Stacked slows floor
at 15% of clean rate and steals cap at 25% of the pile, so nobody gets knocked out.

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
  swing, per VISION.md's "no cooldowns" answer. It works, but it means the
  first attack of a match is much better value than the fourth, which may or may
  not be the tempo we want.
