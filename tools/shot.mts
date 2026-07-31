/**
 * Screenshot the farm at a made-up save state.
 *
 * Visual work on the scene can't be checked by a typechecker — "the middle of
 * the screen is empty" is not a thing a unit test says. So: seed a farm
 * straight into localStorage, load the app in a real browser, shoot it.
 *
 *   npx vite --port 5199 &
 *   npx vite-node tools/shot.mts -- plot=40 hand=20 out=/tmp/farm.png
 *
 * Args are `producer=count` for anything in the shop, plus `potatoes=`,
 * `soil=` (0..1), `out=` and `port=`. Everything is optional.
 */

import { chromium } from "playwright-core";

import { solo } from "@battle/sim";

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.includes("="))
    .map((a) => a.split("=") as [string, string]),
);

const out = args.out ?? "/tmp/farm.png";
const port = args.port ?? "5199";

const now = Date.now();
const farm = solo.createFarm({ seed: "shot", startedAt: now });

for (const p of solo.SOLO_PRODUCERS) {
  const n = Number(args[p.id] ?? 0);
  if (n > 0) farm.producers[p.id] = n;
}
farm.potatoes = Number(args.potatoes ?? 1e9);
farm.harvested = farm.potatoes;
farm.lifetimeHarvested = farm.potatoes;
if (args.soil) farm.soil = Number(args.soil);
// The scene reads owned upgrades to pick which mark of each tier it draws.
if (args.marks === "all") farm.upgrades = solo.SOLO_UPGRADES.map((u) => u.id);
// ...and whether the horizon has closed. Settable on its own so the fold can be
// shot against a farm that hasn't bought every other upgrade in the game. Note
// that a farm seeded as already-converged renders folded without animating —
// the scene refuses to replay the fold on a restore, which is why this tool
// can't photograph the transition. See next_steps.md.
farm.converged = args.converged !== "0" && (args.converged === "1" || farm.upgrades.includes("ur_potato"));
if (args.generation) farm.generation = Number(args.generation);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${port}/`);
await page.evaluate(
  ([key, save]) => {
    localStorage.setItem(key!, save!);
    localStorage.setItem("potatoes-inc:taught-tap", "1");
  },
  ["potatoes-inc:farm", solo.serializeFarm(farm, now)],
);
await page.reload();
await page.waitForTimeout(Number(args.settle ?? 2500));
await page.screenshot({ path: out });
await browser.close();
console.log(out);
