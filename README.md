# Potatoes, Inc.

A potato clicker where every purchase competes for the same currency, and
something is always working against you.

The app opens onto your farm. There are two modes; the second one lives behind
the House door in the bottom nav, along with the dev tooling:

- **Your farm** — the persistent single-player homestead. Sixteen tiers, fifty
  upgrades, a prestige loop, and weather that damages your land permanently
  whether or not the tab is open. Four of those tiers and the last of that
  weather only exist after the Convergence, which is below. This is where
  development is going.
- **Versus a bot** — the original head-to-head prototype from
  [VISION.md](VISION.md), where the thing working against you is another player
  spending their own potatoes to do it. Still playable, parked in the house.

Both run entirely in the browser — no Supabase, no auth, no network. The backend
in [STACK.md](STACK.md) is deliberately not built yet, but both sims are already
shaped for it.

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
- **`packages/sim/src/solo`** — the homestead, namespaced (`solo.*`) rather than
  flattened into the same export surface. It has its own producers, its own cost
  curves and its own `clickYield`, and merging them would make it far too easy
  to price a farm with match content.
- **`apps/web`** — Vite + React. Owns rendering and the local match runtime;
  no economy logic.
- **`apps/web/src/render`** — the pixel-art layer. Art is authored as char grids
  (`art.ts`), painted once into cached canvases (`pixel.ts`), and blitted onto a
  low-res buffer that CSS scales up crisply (`farmScene.ts`). The scene is the
  homestead screen: the field behind the fence is every producer you own, and
  the yard in front of it is the potatoes you're holding, so the two numbers the
  game is about are the picture rather than two figures in a panel. The yard
  counts the hoard out like money — three denominations side by side, each worth
  ten of the one to its right — and bundles ten of one into one of the next as
  you cross it, in either direction.

Commands go through `applyCommand(state, cmd, now)`, which is the single
authority for mutations. The local runtime calls it directly; swapping that for
a network round-trip shouldn't touch any game logic.

## The homestead

A farm you keep, running against nothing but time and the weather.

**Weather is sabotage with nobody behind it.** A deterministic schedule keyed on
`(seed, weatherIndex)` decides what happens and when, and every event lands at an
instant the state already knows. That's what lets a week offline resolve
*exactly* rather than approximately — walk the schedule, don't sample a clock —
and it means a save file can't be reloaded for better weather.

Nothing in solo expires. Broken kit stays broken and soil health only ever falls
on its own; both come back solely by spending. So a farm's rate is constant
between events, and `advance()` across ten seconds and across ten days are the
same code path. `solo.test.ts` pins that down directly: resolving a six-hour gap
in one call and ticking through it one second at a time have to agree on every
event, every broken unit and the soil to ten decimal places.

**Defense is buildings, not shields.** The versus mode's timed absorb pools are
the right shape for a five-minute fight you're watching and the wrong shape here,
because most weather lands while the tab is closed and a ninety-second shield
would protect nothing. Windbreaks, ditches, a pest contract and insurance are
levelled and permanent, stack with diminishing returns, and never reach zero
exposure. They're worth roughly 3x the harvest of never building them — the
difference between weather as a 6% running cost and weather as a 65% one.

**The Convergence** fires when you buy The Ur-Potato. The horizon closes: the
sky band stops being sky and becomes the inside of the tuber, and four more
rungs arrive that farm the parts of it you're now standing in. It's permanent
rather than per-run — a flag that survives prestige, because the point is that
it happens to you once.

Its mechanical payoff is the weather, not a multiplier. Inside the potato
there's no sky, so hail and frost and drought stop and the tuber's immune
response takes over: same three effect kinds, soil-heavier mix, two more
buildings to hold it off. That gives the second axis a second act at the same
moment the ladder gets one.

**It has to be reachable in a single dedicated run**, on a first save, with no
prestige and no seeds — that's a decision, not an observation, and
`solo.test.ts` pins it. Every check-in cadence clears it inside a week from
nothing, measured by playing sessions and jumping the clock between them so
nobody repairs anything in the gaps:

| Cadence | Active play | First singularity | Convergence | Full ladder |
|---|---|---|---|---|
| heavy | 4 × 30 min/day | day 2.0 | **day 3.3** | day 4.5 |
| normal | 3 × 15 min/day | day 2.7 | **day 4.3** | day 5.7 |
| light | 2 × 10 min/day | day 4.0 | **day 5.5** | — |

Past the first hour this game is gated on elapsed time, not attention: a 6x
difference in play time moves the Convergence by less than 2x, because producers
dwarf digs almost immediately and offline accrual is unpenalised. Which is worth
knowing before anyone tries to tune the endgame by making it grindier — grinding
isn't the lever.

**Prestige** hands the farm down for Heirloom Seed, cube-rooted off the run's
harvest. Seeds do two jobs and you can't have both: held, they multiply output;
spent, they buy permanent perks. Same shape as the rest of the game — one pile,
competing uses.

The Seeds tab is held until the Convergence has fired, and that's a gating
decision rather than a cosmetic one. `SEED_DIVISOR` puts the first hand-down in
day 1-2, which is a day or two *before* the world would have folded — so
revealing prestige when it first pays offers a reset just short of the payoff,
and a player who takes the hint doesn't see the fold until run 2 at the earliest.
The first run is one unbroken climb to the fold; prestige arrives afterwards as
the thing that makes the folded world repeatable.

Four balance findings from the harness are worth knowing, because each was
invisible until a long run was actually measured:

- **Repairs can't be priced off the cost curve.** From the *working* count, a
  half-wrecked farm buys capacity back at the rates it paid tiers ago — a ~30x
  discount on its next unit, making breakage a coupon and more damage mean more
  harvest. From the *owned* count, 1.15^200 means reassembling a fleet costs more
  than the fleet can ever produce, and insurance payouts on that bill become a
  money printer. Repairs are priced against the production they restore.
- **Boons have to be small.** At 600s of production, a good year outweighed every
  storm in a session, which made the entire mitigation half of the game pointless.
- **Weather has to cost enough for mitigation to pay for itself.** At a ~7% tax
  no amount of building could earn its price back.
- **The seed economy is the loose end.** A converged run mints ~37x the seeds an
  unconverged one did, because harvest goes up ~52,000x and the cube root of
  that is 37. There's a post-Convergence perk row priced at the new scale to
  give that somewhere to go, but the underlying problem is that held seeds
  multiply output *linearly and without bound* — so each run funds the next one
  many times over and any perk table clears in a handful of generations.
  Damping `MULT_PER_UNSPENT_SEED`, or `seedsFor`'s unused `vigor` parameter as a
  damper below 1, is the actual lever. Not pulled yet, because it changes how
  every generation after the first one feels.

## What's implemented (versus)

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
