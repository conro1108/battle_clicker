# next_steps.md

Four more rungs above the Tuber Singularity, and the event that unlocks them.

Not built. This is the design plus the numbers the harness gave back for it, so
that whoever builds it starts from measurements instead of a guess.

## The constraint: one playthrough

**The Convergence has to be reachable in a single dedicated run**, on a first
save, with no prestige and no seeds. Not something you find out about three
generations deep. That's a decision, not an observation — treat it as binding on
anything that retunes the gate later.

The good news is that the numbers already clear it comfortably, and the bad news
is that the game currently talks a player out of it.

**Every check-in cadence converges inside a week, from nothing.** Measured by
playing sessions and then jumping the clock between them, so the farm runs
unattended and nobody repairs anything in the gaps — which is the only thing that
distinguishes this from the always-on bot:

| Cadence | Active play | First singularity | Convergence | Full ladder |
|---|---|---|---|---|
| heavy | 4 × 30 min/day | day 2.0 | **day 3.3** | day 4.5 |
| normal | 3 × 15 min/day | day 2.7 | **day 4.3** | day 5.7 |
| light | 2 × 10 min/day | day 4.0 | **day 6.0** | day 7.5 |

For reference the always-on bot converges at day 3.1 — so a player giving it two
hours a day gets there at essentially the same wall-clock moment as one who never
closes the tab. **Past the first hour this game is gated on elapsed time, not
attention**: a 6x difference in play time moves the Convergence by less than 2x,
because producers dwarf digs almost immediately and offline accrual is unpenalised.
That is worth knowing before anyone tries to tune the endgame by making it
grindier — grinding isn't the lever.

**What does threaten the constraint is prestige.** `SEED_DIVISOR` is calibrated
to put the first hand-down in day 1-2 of a run, and `App.tsx:197` reveals the
Seeds tab the moment `pendingSeeds > 0`. So the game currently offers a reset
one to two days *before* the world would have folded, and a player who takes the
hint sees the Convergence in run 2 at the earliest.

The fix is a gating change, not an economy change: **hold the Seeds tab until the
Convergence has fired.** Then the first run is one unbroken climb to the fold, and
prestige is introduced afterwards as the thing that makes the folded world
repeatable — which is also the better fiction, since what you hand down from then
on is a farm inside a potato.

## The Convergence

**It fires when you buy The Ur-Potato.** That upgrade already exists as the last
thing in the shop, and its blurb is already "The first potato." You acquire the
first potato and discover you have always been inside it. No new gate concept,
and the punchline lands on a button the player chose to press.

Move its gate from 25 Tuber Singularities to **10**, and reprice it to
`fleetCost("singularity", 10)` per the usual convention. See the numbers below —
this is what pulls the endgame from five days of play to three, and the upgrade
stays expensive enough to feel like a decision.

**What happens:** the horizon closes. The sky band stops being sky and becomes
the far inner surface of the tuber — your own field hanging mirrored and dimmed
overhead, with a fold of haze where the two curves meet.

This is the cheapest dramatic scene change available in `farmScene.ts`. The sky
is already a band with its own palette, hills, clouds and flying producers;
replacing it with an inverted, darkened blit of the field band reuses machinery
that exists. It is still the largest single piece of work here, and the thing to
prototype first — if the fold doesn't read, there's no payoff to build toward.

**Permanent, not per-run.** A `converged` flag on `FarmState` that survives
prestige, alongside `perks` and `seeds`. Re-triggering every generation makes the
spectacle routine; the point is that it happens to you once. Later generations
start in the folded world and re-climb to reach the new tiers.

**Its mechanical payoff is the weather, not a multiplier.** Inside the potato
there is no sky, so hail and frost and drought stop, and `KINDS` swaps for the
tuber's immune response — it has noticed it is being farmed. Same three effect
kinds, new names, a soil-heavier weight mix. This is the part worth arguing for:
it gives the second axis a second act at the same moment the ladder gets one,
which is what the design has always rested on. Two more `LANDS` buildings against
the new hazards are the upgrade path for that half.

## The four rungs

Each farms a different part of the potato you're now standing inside, which also
solves placement — they occupy the screen regions the fold just created rather
than competing for field space.

| # | Name | Rate/s | Cost | Draws |
|---|---|---|---|---|
| 13 | **Inversion Furrow** | 4.4e10 | 2.8e15 | inverted band, ploughing the ceiling |
| 14 | **Mantle Tap** | 3.5e11 | 4.0e16 | yard, shaft running off the bottom |
| 15 | **Chorus** | 2.8e12 | 5.6e17 | inverted band, mirrored farmhands |
| 16 | **Second Potato** | 2.2e13 | 8.0e18 | hanging where the sun was |

Same x8 rate and x14 cost per rung as everything below, and one x2 global per
rung. That pairing is what has kept real payback flat at a few minutes across the
whole ladder: base payback grows ~1.9x per rung and the globals cancel it. Resist
a large one-off Convergence multiplier to "pay for" the new tiers — the pacing
doesn't need it, and the README already records that the x2/x3/x5 global chain is
what once evaporated a week-long run.

Wrinkles, one each except the last:

- **Inversion Furrow** — weather falls up now, so each one adds a little
  `frequency` mitigation. This finally feeds the top of the ladder back into the
  land half, which currently caps at four buildings and stops mattering. Needs
  the same `1-(1-p)^n` shape and the existing `MAX_MITIGATION` clamp, or two
  hundred of them zero the weather.
- **Mantle Tap** — its rate scales *with* soil rather than merely being
  multiplied by it, so restoring the dirt is a live decision again at the top
  instead of a rounding error. Soil only moves on weather events and purchases,
  so rate stays piecewise-constant — worth stating, because that invariant is
  what the entire offline model rests on.
- **Chorus** — rate scales with `generation`. Every farm you handed down is up
  there still working. Nothing currently makes the meta-layer visible in the
  picture.
- **Second Potato** — no wrinkle. The last rung should just be the biggest
  number, and the joke is what it implies.

Tier upgrades follow the existing pattern exactly (x2 at 10, x1.5 at 50):
Reversed Gravity / Ceiling Yield · Deep Core Sampling / Geothermal Assist ·
Perfect Unison / Every Generation · Seed Stock / It's Started.

**No more click upgrades.** The `click_from_rate` chain stops at 1.5s total and
the comment on that effect puts the ceiling at a couple of seconds before the
ladder falls over. The endgame is deliberately not about the wrist — and the
README already flags that an autoclicker beats strategy.

## What the harness said

Measured by temporarily extending `content.ts` with all of the above and running
`simulateFarm`-style `keen` play for 14 days on seed `probe`, against the same
run on the ladder as it stands. Numbers are from that comparison, not from a
spreadsheet.

**Moving the Ur-Potato gate to 10 does what it was meant to.** The Convergence
lands at **75.2h instead of 118.4h** — three days of play instead of five — and
it still costs **1041 seconds of production** at the moment it's bought, down
from 7690s but comfortably above the 60s floor `solo.test.ts` guards, and in the
same league as the other late globals. No `share` multiplier needed; the plain
`fleetCost("singularity", 10)` price is right.

**The new rungs get bought, on a sensible cadence.** First Inversion Furrow at
70.9h, Mantle Tap at 80.3h, Chorus at 91.9h, Second Potato at 105.0h — so the
Convergence at 75.2h lands almost exactly where tier 13 becomes affordable, and
the remaining three space out over the following day and a half. By day 14 the
run owns 97/82/66/51 of them.

**One existing guard fails, and it's measuring the wrong thing.**

```
the ladder > gets more expensive per potato of output as you climb
  expected 363636.36363636365 to be less than 40000
```

`solo.test.ts:46` caps the top rung's *base* payback at 40,000s so the top of the
tree can't be purely decorative. At 16 rungs the Second Potato's base payback is
101 hours and it trips. But the proxy is what's broken, not the ladder: the run
buys 51 Second Potatoes, and at the end of 14 days it is the best value per
potato on the board by a factor of five over the rung below it. Base payback
stops predicting affordability once accumulated multipliers reach 730x. Replace
the assertion with what the probe actually measured — that a long run reaches the
top rung, and that it's the best buy when it does.

**The seed economy is the real problem.** A 14-day run mints **2,131 seeds today
and 79,709 with the extension** — 37x, because harvest goes up ~52,000x and the
cube root of that is 37. Maxing every perk on the current table costs about
223,000 seeds cumulative. So the perk meta-game goes from roughly **105 runs to
under 3.**

That inverts something in the original sketch: `seedsFor` has an unused `vigor`
parameter, and the plan was to set it to ~1.5 as a reward for converging.
Converged runs are already 37x richer; a bonus makes it worse. Either use `vigor`
as a damper below 1, or leave it and add a post-Convergence perk row priced at
the new scale. The second is more interesting and is the recommendation — perks
that only make sense inside the potato, paid for at inside-the-potato prices.

Note this is entirely second-run-onward work. Nothing about the seed economy
gates the Convergence, which is exactly as intended: the fold is what the first
run is for, and seeds are what the runs after it are for.

**Float64 is less of a problem than it looked.** Tier 16's 8e18 cost is past
2^53, so costs stop being exact integers — but nothing depends on that. A 14-day
run's harvest reaches 5.06e24, where `format` still has eight suffixes of
headroom (it tops out at 1e33) and a single dig is ~1e9 times larger than the
representable step, so digs still register. Worth a note in `numbers.ts`, not a
bignum swap. The brand is already there if that changes.

## Order of work

1. **Prototype the fold in `farmScene.ts`.** Everything else is worthless if the
   inverted sky doesn't look good. Nothing downstream needs to exist to try it.
2. Replace the `solo.test.ts:46` payback assertion with a reach-the-top-rung
   check. Do this before adding tiers so the suite stays green throughout.
3. Add the four producers, their tier upgrades and their globals; move and
   reprice `ur_potato`; gate the new tiers on `converged` in `FarmShop.tsx:86`.
4. Hold the Seeds tab until the Convergence (`App.tsx:197`), and add a test that
   pins the one-playthrough constraint — a fresh farm at a modest check-in
   cadence has to converge inside a week. That guard is the whole point of the
   table above; without it the next retune quietly breaks the thing this document
   is most specific about.
5. The immune-response weather table and the two new `LANDS` buildings.
6. Art and placement for the four new producers.
7. Fix the seed economy — post-Convergence perk row. Last because it's the only
   item here that a first playthrough never sees.
