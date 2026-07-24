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

**Sabotage is priced against its target.** A swing costs `costPerRate` potatoes
per point of the target's production rate, with the flat `baseCost` as a floor
while they're still small. This is what keeps the second axis honest: breakage
does damage proportional to the size of the farm it lands on, so at a flat price
hitting the leader returned many times what growing did, and "spend on yourself
vs. spend against them" wasn't a choice. The price is computed from their
*clean* rate — what they'd be making undamaged — so stacking damage never makes
the next hit cheaper, which would snowball toward the knockout VISION.md rules
out.

Opponent info goes through `opponentView()` — count and production rate, nothing
else — so the fog rule lives in one place instead of relying on the UI to be careful.

## Balance harness

`packages/sim/src/balance.ts` runs whole matches headlessly. This is the tuning
loop: change a cost curve, run `npm test`, see whether matches still go the
distance.

It's load-bearing. The first run showed sabotage and defense firing *zero* times
in a five-minute match, and a follow-up showed pure growth beating sabotage on
every seed — the second axis the design rests on didn't exist.

**Bots on every seat can't answer the question the lobby actually asks.** They
tell you the economy isn't degenerate; they can't tell you whether `nasty` is
beatable, and every rung of the ladder turned out to be crushable by an ordinary
person. So one seat can now be a *reference human* (`reference.ts`), modelled on
how the game gets played rather than optimally: dig while digging is the only
income, then follow the shop's "best value" badge and keep adding capacity.
`human.test.ts` grades the ladder against it —

```
builder vs chill      1.76x   comfortable
builder vs scrappy    1.12x   a real fight
builder vs nasty      0.75x   loses, stays in sight
scrapper vs nasty     0.85x   sabotage closes some of the gap
```

`leaves neither pure growth nor sabotage dominant` is the guard rail on the
second axis, run as `nasty` against `greedy` — the same bot with sabotage
switched off, so nothing else varies. Strict dominance either way would collapse
this back into a solo idle clicker.

`makes sabotage a wash early and a good buy later` grades *when* to swing:
currently 1.00x early, 1.20x mid, 1.42x late. A swing costs roughly what the
damage is worth whenever you throw it, so what moves is the other side of the
trade — potatoes spent in the first minute would have compounded for four more.
That should be a gradient, never a cliff and never an outright self-own.

Both of those moved from counting wins to measuring margins. At `skill: 1` the
bots are deterministic — the seed only jitters how many units an attack knocks
out — so a win count collapses to 0-10 or 10-0 however close the two lines
actually are. The margin is what those tests always meant.

`orders the difficulty ladder the way the lobby claims` exists because difficulty
kept coming out **backwards**. In an exponential economy, acting *less* often
means a bigger pile between purchases, and a bigger pile buys better tiers — so
slowing a bot down made it stronger. That was a symptom of the bot taking one
action per decision tick: it sat on potatoes that earned nothing. Now that a turn
spends the pile down, cadence is a legitimate difficulty knob alongside `skill`
and click rate.

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
- **Wrist speed is still worth more than it should be.** The reference human has
  a `masher` variant that never looks away from the dig button, and it beats
  `builder` by 4-9x against the same bot. Nobody has hit this in practice — the
  ladder is graded against `builder`, which is how the game actually gets played
  — but it means an autoclicker beats strategy, and it quietly penalises playing
  on a phone, where you can't tap that fast. Capping the dig rate or flattening
  the click multipliers would both fix it; both change how the game feels, so
  neither is a decision to make from a spreadsheet. `human.test.ts` prints the
  current multiple on every run so it can't drift unnoticed.
