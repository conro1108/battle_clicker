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
 *
 * A seeded farm always renders as a **restore** — the scene refuses to replay
 * the fold, the pipeline going in, or a shed going up for a farm that already
 * had them when the tab opened, which is the right call and also means the
 * plain form of this tool can't photograph any of it. `buy=` is the way in: it
 * settles the farm, then actually buys the thing through the shop the way a
 * player would, then takes a burst of frames while it arrives.
 *
 *   ... buy=lab burst=6 every=350 out=/tmp/build.png   ->  build-0.png ...
 *
 * `buy=` takes upgrade ids too, so the Convergence can be photographed
 * mid-arrival. The two wipes work the same way: `down=inside`/`down=outside`
 * hands the farm on, `plough=1` ploughs it all under, and `open=Shop` just
 * opens a sheet. Watch the namespace — every one of these shares it with the
 * producer ids, which is why handing down isn't `hand=`.
 *
 * `hour=` fakes the wall clock the sky runs on, so night can be shot at noon.
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
// `broken=n` knocks n of every owned tier offline, which is what the Upkeep
// sheet and the damaged-mark art both need to have anything to show.
if (args.broken) {
  const n = Number(args.broken);
  for (const p of solo.SOLO_PRODUCERS) {
    const owned = farm.producers[p.id] ?? 0;
    if (owned > 0) farm.broken[p.id] = Math.min(owned, n);
  }
}
// The scene reads owned upgrades to pick which mark of each tier it draws.
if (args.marks === "all") farm.upgrades = solo.SOLO_UPGRADES.map((u) => u.id);
// ...and whether the horizon has closed. Settable on its own so the fold can be
// shot against a farm that hasn't bought every other upgrade in the game. Note
// that a farm seeded as already-converged renders folded without animating —
// the scene refuses to replay the fold on a restore. `buy=` is how you get at
// the transition: seed the farm one purchase short of it and make that purchase
// through the shop.
farm.converged = args.converged !== "0" && (args.converged === "1" || farm.upgrades.includes("ur_potato"));
// Which of the two farms to stand on. A converged save lands inside by default,
// because that's where the fold leaves you; `world=outside` is how the old farm
// gets photographed with its ceiling on.
farm.world = farm.converged && args.world !== "outside" ? "inside" : "outside";
if (args.generation) farm.generation = Number(args.generation);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2 });

// The sky is a pure function of `new Date().getHours()`, so pinning that is the
// whole of what it takes to shoot 2am. Installed before any app code runs.
if (args.hour) {
  await page.addInitScript((hour: string) => {
    const Real = Date;
    const at = new Real();
    at.setHours(Number(hour), 30, 0, 0);
    const shift = at.getTime() - Real.now();
    // eslint-disable-next-line no-global-assign
    (globalThis as { Date: DateConstructor }).Date = class extends Real {
      constructor(...a: ConstructorParameters<DateConstructor>) {
        super(...(a.length === 0 ? [Real.now() + shift] : a));
      }
      static override now() {
        return Real.now() + shift;
      }
    } as DateConstructor;
  }, args.hour);
}

await page.goto(`http://localhost:${port}/`);
await page.evaluate(
  ([key, save]) => {
    localStorage.setItem(key!, save!);
    localStorage.setItem("potatoes-inc:taught-tap", "1");
  },
  ["potatoes-inc:farm", solo.serializeFarm(farm, now)],
);
await page.reload();

// Faking the clock opens a gap between the save's checkpoint and "now", so the
// away report is sitting over the yard before anything else can be looked at.
const back = page.getByRole("button", { name: "Get back to work" });
if (await back.isVisible().catch(() => false)) await back.click();

await page.waitForTimeout(Number(args.settle ?? 2500));

// `buy=` takes an upgrade id as well as a producer one — the Convergence is a
// purchase off the same shelf, and it's the one thing on it worth photographing
// mid-arrival.
if (args.buy) {
  const thing =
    solo.SOLO_PRODUCER_BY_ID[args.buy as solo.SoloProducerId] ?? solo.SOLO_UPGRADE_BY_ID[args.buy];
  if (!thing) throw new Error(`nothing called ${args.buy} in the shop`);
  await page.getByRole("button", { name: "Shop" }).click();
  // The Ur-Potato isn't a shop row and its button doesn't carry its name — the
  // sheet is given over to it, and the only thing to press says "Take it".
  const row =
    args.buy === solo.CONVERGENCE_UPGRADE
      ? page.getByRole("button", { name: "Take it" })
      : page.getByRole("button").filter({ hasText: thing.name }).first();
  await row.click();
  // The Convergence takes the sheet away itself, and it eats the click that
  // would close one that's still open.
  const close = page.getByRole("button", { name: "Close" });
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
} else if (args.down) {
  // `down=inside` / `down=outside`: prestige, and which world to hand down. The
  // sky coming back is the other transition worth photographing.
  //
  // Not `hand=`, which is the Farmhand count. Every arg here shares one
  // namespace with sixteen producer ids, and the collision is silent: a farm
  // with `hand=143` on it quietly handed itself down instead.
  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Seeds", exact: true }).click();
  if (args.down === "outside") await page.getByRole("button", { name: "Back under the sky" }).click();
  await page.getByRole("button").filter({ hasText: "Hand the farm down" }).first().click();
  const close = page.getByRole("button", { name: "Close" });
  if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
  await page.waitForTimeout(Number(args.after ?? 2500));
} else if (args.plough) {
  // The other wipe: a new farm on a new seed, keeping nothing.
  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Books", exact: true }).click();
  await page.getByRole("button", { name: "Plough it all under" }).click();
  await page.waitForTimeout(Number(args.after ?? 2500));
} else if (args.open) {
  // Any of the nav sheets by name: `open=Shop`, `open=Seeds`, `open=Upkeep`.
  await page.getByRole("button", { name: args.open, exact: true }).click();
  // The sheet slides up; shooting on the click catches it still off the bottom.
  await page.waitForTimeout(500);
}

const burst = Number(args.burst ?? 0);
if (burst > 0) {
  const every = Number(args.every ?? 300);
  const stem = out.replace(/\.png$/, "");
  for (let i = 0; i < burst; i++) {
    await page.screenshot({ path: `${stem}-${i}.png` });
    console.log(`${stem}-${i}.png`);
    await page.waitForTimeout(every);
  }
} else {
  await page.screenshot({ path: out });
  console.log(out);
}
await browser.close();
