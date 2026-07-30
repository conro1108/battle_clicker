---
name: verify-visual
description: Build, launch and screenshot the farm in a real browser at a made-up save state. Use for changes to the scene renderer (fields, producers, the yard, sky) where a typecheck and unit tests can't see what's wrong. Costs tokens — screenshots are images — so don't reach for it on routine work.
---

# Seeing the farm

`npx tsc -b apps/web` and `npx vitest run` cover the sim. They cannot tell you
that the middle of the screen is empty, so for scene work:

1. `npx vite apps/web --port 5199` in the background. Note the `apps/web` — the
   repo root has no `index.html`.
2. `npx vite-node --config apps/web/vite.config.ts tools/shot.mts -- plot=104 hand=89 out=/tmp/farm.png`
   Args are `<producerId>=<count>` for anything in the shop, plus `potatoes=`,
   `soil=` (0..1), `marks=all` (owns every upgrade, so the scene draws the top
   mark of each tier), `settle=` ms and `out=`. The config flag is what
   resolves the `@battle/sim` alias.
3. Read the PNG.

## Counts worth shooting

From a keen bot run, so these are the farms people actually have:

| run | plot | hand | irrigation | tractor | harvester | lab | refinery | tower | seeder | reactor |
|-----|------|------|-----|-----|-----|-----|-----|-----|-----|-----|
| 2h  | 74 | 59 | 44 | 28 | 13 | – | – | – | – | – |
| 8h  | 104 | 89 | 75 | 59 | 44 | 28 | 12 | – | – | – |
| 72h | 158 | 143 | 128 | 113 | 97 | 81 | 65 | 49 | 33 | 17 |

Regenerate with a throwaway test calling `simulateFarm({ style: "keen" })` if
the economy moves.

## Gotchas

- **Settle time matters.** At `settle=2500` the field is still full of freshly
  seeded stage-0 sprouts and every hand is standing at home. Use 6000+ for a
  still, 20000 for a farm that's been running.
- Shots are 400×800 at DPR 2. The scene buffer is 176px wide and its height
  follows the element, so band fractions — not fixed pixel depths — are what
  keep the layout right on other aspect ratios.
- Keep it cheap: shoot early / mid / late rather than one per tweak.
