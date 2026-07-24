# VISION.md

## The pitch

A cookie-clicker-like, but head-to-head. 2+ players join a match and race to
produce the most of some resource before the timer runs out. Same idle-game
skeleton everyone knows — click, buy production, buy multipliers — but the
upgrade tree isn't just a ladder of bigger numbers. Some upgrades grow your
own economy, some reach across the board and mess with an opponent's, some
build up defenses against being messed with.

The genre's usual solo, no-stakes "number go up" loop becomes a real decision
space once someone else is racing you: every purchase is both "how do I grow"
and "what does this cost me not to spend on offense/defense instead."

## Why this is interesting

Cookie clicker is normally a patience game with one axis: optimize your own
curve. Adding an opponent (or three) turns it into a resource-allocation game
with a second axis — spend on yourself vs. spend against them — and that's
where the actual decisions live. The idle-game dopamine loop stays intact;
competition is what gives it stakes and a clock.

## Players

2+ per match, free-for-all. Could be pure 1v1, could be a small lobby of 3-4
all producing and sabotaging each other simultaneously. Not sold yet on
whether teams ever make sense — leaning no for now, keep it every-player-for-
themselves.

## The loop

- Everyone starts from zero, same rules, at the same time.
- Whoever has the most of the target resource when the clock hits zero wins.
- Clicking/producing is the baseline action; upgrades are the strategic layer
  on top.

Two match-length shapes both feel interesting and worth keeping alive rather
than picking one now:

- **Sit-down session** — a fixed window of minutes, everyone actively playing
  at once. Tight, tactical, sabotage lands and matters immediately.
- **Slow burn** — a match that runs in the background over hours/days, more
  like the classic idle-game shape but contested. You check in, spend
  resources, queue up an attack or a defense, close the tab, come back later
  to see what happened. Sabotage here is more about long-game positioning
  than a reflex fight.

These probably want different cost pacing, but the same three upgrade
categories and the same core tension (spend on yourself vs. spend against
others) should work for both. Worth prototyping both shapes before betting on
one.

## Upgrades, three flavors

1. **Production** — the classic cookie-clicker upgrade. Multiply your own
   output, buy more producers, click harder. The economic core everyone
   recognizes.
2. **Sabotage** — spend your resource to reach across the board and hurt an
   opponent's economy. Slow their production, disable a producer, tax their
   income, whatever the flavor ends up being.
3. **Defense** — spend to protect your own economy from #2. Shields, immunity
   windows, reflect/punish effects for whoever attacks you.

The interesting part isn't any one category, it's that they compete for the
same currency. Every purchase is an opportunity cost against the other two
paths.

## Open design questions (not answering yet, just flagging)

- How visible is the opponent's board? Full visibility raises the stakes of
  every decision; fog of war makes sabotage feel more like a gamble.
  - **Answer (for now):** you see their item count and production rate. Not
    their upgrade tree, defenses, or anything else on their board — just
    those two numbers.
- How punishing is sabotage — a nuisance/tempo hit, or can you actually get
  wrecked and taken out of a match?
  - **Answer:** no knockouts from sabotage. Tempo hits, setbacks, real pain —
    but not eliminated from the match. Maybe one giga/mega/ultra-rare exception
    exists somewhere down the line, but that's not the core vibe.
- Does defense ever fully counter offense, or is it always partial mitigation?
  - **Answer (loosely):** probably, sometimes. Attacks and defenses both come
    in a range of strengths rather than a flat yes/no — a strong-enough
    defense fully blocking a weak attack is fine and expected, it's just not
    guaranteed to work against a stronger one.
- Real-time simultaneous, or does turn structure / cooldowns matter?
  - **Answer:** real-time, not turn-based. No top-level cooldown construct
    either — pacing comes implicitly from resource contention (you can't
    afford to spam an action because spending it means not spending on
    something else), not from a timer gating the action itself.
- Sit-down or slow-burn — or both, as genuinely different modes?
  - **Answer: deferred on purpose.** Not deciding this yet, and not treating
    it as blocking. Build out the core game feel and pacing first (the
    click/produce/upgrade loop, sabotage/defense feel) with whatever match
    shape is easiest to prototype against, then figure out which length (or
    both) it wants to be once the fun part is proven out.
- What's the resource, thematically? Cookies is the reference point but not
  necessarily the skin.
  - **Answer: potatoes.** Farming has a built-in physical world (soil,
    weather, pests, storage) that production/sabotage/defense upgrades can
    hang off naturally — fences, GMO seed, harvesters, storage on the
    production side; blight, moles, ruined soil on the sabotage side —
    instead of needing an invented justification the way an abstract
    "factory" would.

- What exactly is the winner measured on — potatoes *held* at the buzzer, or
  potatoes *ever harvested*?
  - **Answer: not yet.** The pitch says both ("race to produce the most",
    "has the most when the clock hits zero") and they play differently. Scoring
    on the pile you're holding makes every late purchase cost you the game, so
    the endgame flattens into "stop buying" — which is the opposite of the
    tension we're after. Scoring on lifetime harvested keeps spending free and
    keeps sabotage relevant (denying rate still denies score). Both are
    implemented and switchable; harvested is the working default until we've
    played both.

## Parked ideas

- **Spoilage.** Potatoes rot — stored resource decays over time unless you
  spend on storage. Appealing because it pushes against hoarding: you stay
  engaged, keep buying, keep ramping instead of sitting on a pile. Fits the
  farming skin without inventing anything. Not for now.
  - Worth knowing: this is the one mechanic that couples production rate to
    stockpile size, which costs us the cheap "rate is a sum of terms"
    checkpoint model in STACK.md. Still doable, just a deliberate trade
    rather than something to stumble into.

## Non-goals (for now)

- Not aiming for deep base-building complexity — the upgrade tree should stay
  legible enough to reason about mid-match, whichever length wins out.
