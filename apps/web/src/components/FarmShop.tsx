import { useState } from "react";
import { P, format, solo, type Millis, type Potatoes } from "@battle/sim";

import { producerArt, upgradePreview } from "../marks.js";
import { artUrl, type Art } from "../render/pixel.js";

type BuyQty = 1 | 10 | "max";

/**
 * The buy size outlives the sheet.
 *
 * The shop is opened dozens of times a session and it was resetting to x1 on
 * every one of them, so a player buying in tens spent the whole run re-picking
 * ten. It's a preference, not a state of the farm — so it lives beside the save
 * rather than in it, and a farm handed down or abandoned keeps it.
 */
const QTY_KEY = "potatoes-inc:buy-qty";

function loadQty(): BuyQty {
  try {
    const raw = localStorage.getItem(QTY_KEY);
    if (raw === "10") return 10;
    if (raw === "max") return "max";
  } catch {
    // A blocked localStorage just means the toggle forgets. Harmless.
  }
  return 1;
}

function saveQty(qty: BuyQty): void {
  try {
    localStorage.setItem(QTY_KEY, String(qty));
  } catch {
    // See `loadQty`.
  }
}

function Row({
  name,
  blurb,
  cost,
  meta,
  affordable,
  onBuy,
  accent,
  art,
  best,
}: {
  name: string;
  blurb: string;
  /** A seed price is rendered differently from a potato price. */
  cost: string;
  meta?: string;
  affordable: boolean;
  onBuy: () => void;
  accent?: string;
  /** The thing itself, as it currently stands on your farm. */
  art?: Art;
  /** Most rate per potato on the board. A dot, and nothing more. */
  best?: boolean;
}) {
  return (
    <button
      className={`row ${accent ?? ""} ${affordable ? "" : "row-locked"}`}
      onClick={onBuy}
      disabled={!affordable}
    >
      {art && (
        <span className="row-art">
          <img className="pxicon" src={artUrl(art)} alt="" />
        </span>
      )}
      <span className="row-body">
        <span className="row-name">
          {name}
          {best && (
            <span className="row-best" title="Best rate per potato" aria-label="best value" />
          )}
        </span>
        <span className="row-blurb">{blurb}</span>
      </span>
      <span className="row-right">
        <span className="row-cost">{cost}</span>
        {meta && <span className="row-meta">{meta}</span>}
      </span>
    </button>
  );
}

/**
 * How long the farm has to run before it can afford the thing, in words.
 *
 * Coarse on purpose, and never a ticking clock: this is a wait measured in
 * hours at the point it first appears, and a seconds-precise countdown on a
 * two-hour number is just a spinner. It rounds to the unit above so it's always
 * a little pessimistic — the wait shortening under you is the right surprise.
 */
function waitText(msLeft: number): string {
  if (!Number.isFinite(msLeft)) return "nothing is growing";
  const mins = Math.ceil(msLeft / 60000);
  if (mins <= 1) return "moments away";
  if (mins < 60) return `about ${mins} minutes away`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return `about ${hours}h${rest ? ` ${rest}m` : ""} away`;
}

/**
 * The shop with one thing in it, which is not a shop.
 *
 * The rest of this file is a catalogue: a row, an icon, a price, next. That
 * form is the problem here — the last purchase of the run rendered as row
 * thirteen reads as another sidegrade, and the player who's been buying rows
 * for three days has no reason to look up. So the whole surface changes at
 * once. The cream goes out, the thing itself is out there in the dark at the
 * top of the sheet, the price stops being a tag and becomes a bar you are
 * visibly filling, and the button doesn't say Buy.
 *
 * Deliberately says nothing about what it does — see the blurb's note in
 * content.ts. What it costs and how far off it is, is the whole readout.
 */
function Convergence({
  farm,
  budget,
  dispatch,
}: {
  farm: solo.FarmState;
  budget: Potatoes;
  dispatch: (cmd: solo.FarmCommand) => void;
}) {
  const ur = solo.SOLO_UPGRADE_BY_ID[solo.CONVERGENCE_UPGRADE]!;
  const affordable = P.gte(budget, ur.cost);
  const held = Math.max(0, Math.min(1, budget / ur.cost));
  const rate = solo.currentRate(farm);
  const left = rate > 0 ? ((ur.cost - budget) / rate) * 1000 : Infinity;

  return (
    <div className="grave">
      <div className="grave-mark" aria-hidden />
      <h3 className="grave-name">{ur.name}</h3>
      <p className="grave-blurb">{ur.blurb}</p>
      <p className="grave-line">You have spent this whole run on its skin.</p>

      <div className="grave-price">
        <div className="grave-track">
          <div className="grave-fill" style={{ width: `${held * 100}%` }} />
        </div>
        <div className="grave-figures">
          <span>{format(budget)}</span>
          <span>{format(ur.cost)}</span>
        </div>
      </div>

      <button
        className="grave-take"
        disabled={!affordable}
        onClick={() => dispatch({ type: "buy_upgrade", upgrade: ur.id })}
      >
        {affordable ? "Take it" : "Not yet"}
      </button>
      {!affordable && <p className="grave-wait">{waitText(left)}</p>}
    </div>
  );
}

export function GrowPanel({
  farm,
  budget,
  dispatch,
}: {
  farm: solo.FarmState;
  budget: Potatoes;
  dispatch: (cmd: solo.FarmCommand) => void;
}) {
  const [qty, setQtyRaw] = useState<BuyQty>(loadQty);
  const setQty = (next: BuyQty) => {
    saveQty(next);
    setQtyRaw(next);
  };

  // The last stretch. Once the tenth Tuber Singularity is standing, the shop
  // stops being a shop: every other rung and every other upgrade comes off the
  // board and the only thing left is the one that ends the climb.
  //
  // Nothing else in the game does this, and nothing else should. It's the one
  // moment where "what do I spend this on" has a wrong answer — the tier was a
  // countdown and the shop never said so, so a player at the threshold with the
  // usual twelve rows in front of them buys another Singularity and pushes the
  // Ur-Potato another hour out. Emptying the board is the game finally saying
  // out loud that there's only one thing left to save for.
  if (solo.convergencePending(farm)) {
    return <Convergence farm={farm} budget={budget} dispatch={dispatch} />;
  }

  // One shop per world. The outside farm keeps its ladder and keeps earning
  // while you're inside, but you can't buy a Taproot Well for a wheat field or a
  // Combine Harvester for a room made of flesh — so the shop is the shop of the
  // place you're standing in, and warping is how you change it.
  const ladder = solo.producersIn(farm.world);
  const upgrades = solo.SOLO_UPGRADES.filter((u) => {
    if (farm.upgrades.includes(u.id) || !solo.isUnlocked(farm, u)) return false;
    // Tier upgrades belong to their rung's world. Everything else — the digging
    // tools and the globals — lifts both farms at once and so is sold in both.
    const effect = u.effect;
    if (effect.kind !== "producer_mult") return true;
    return solo.SOLO_PRODUCER_BY_ID[effect.producer].world === farm.world;
  });

  const shelf = ladder.flatMap((prod, i) => {
    const owned = farm.producers[prod.id] ?? 0;
    const n = qty === "max" ? Math.max(1, solo.affordableCount(farm, prod.id, budget)) : qty;
    const cost = solo.producerCost(farm, prod.id, n);
    // What it would actually add to the farm as it stands, tired soil and
    // all — the Taproot Well's rate moves with the dirt, so a clean-rate
    // quote would be advertising a machine you can't currently buy.
    const each = solo.producerRateEach(farm, prod.id);
    const broken = solo.brokenCount(farm, prod.id);

    // The ladder reveals itself a rung at a time, but the first rung is
    // always there or an empty shop greets you at zero potatoes. Both
    // ladders read the same way, which is why the bottom of the inside
    // shop is priced to be affordable more or less on arrival: walking
    // into the new world and finding one thing you can buy is the same
    // welcome the first Potato Plot gives you.
    const prev = ladder[i - 1];
    const visible =
      solo.isProducerAvailable(farm, prod.id) &&
      (i === 0 ||
        owned > 0 ||
        (prev !== undefined && (farm.producers[prev.id] ?? 0) > 0) ||
        P.gte(P.mul(budget, 3), prod.baseCost));
    if (!visible) return [];
    return [{ prod, owned, n, cost, each, broken }];
  });

  // One dot, on whichever rung buys the most rate per potato right now. Only
  // among rows you can actually press — a badge on a price you can't meet is
  // trivia, not a nudge — and only when there's more than one to choose from.
  const buyable = shelf.filter((r) => P.gte(budget, r.cost) && r.each > 0);
  const best =
    buyable.length > 1
      ? buyable.reduce((a, b) => (b.cost / (b.each * b.n) < a.cost / (a.each * a.n) ? b : a)).prod.id
      : undefined;

  return (
    <>
      <div className="qty-toggle">
        <span className="muted">Buy</span>
        {([1, 10, "max"] as BuyQty[]).map((q) => (
          <button key={String(q)} className={qty === q ? "on" : ""} onClick={() => setQty(q)}>
            {q === "max" ? "max" : `x${q}`}
          </button>
        ))}
      </div>

      <div className="rows">
        {shelf.map(({ prod, owned, n, cost, each, broken }) => (
          <Row
            key={prod.id}
            name={`${prod.name}${owned ? ` ×${owned}` : ""}${broken ? ` (${broken} ${prod.hurt})` : ""}`}
            blurb={`${prod.blurb} +${format(each * n)}/s`}
            cost={format(cost)}
            meta={qty === "max" ? `buy ${n}` : undefined}
            affordable={P.gte(budget, cost)}
            best={prod.id === best}
            art={producerArt(farm, prod.id)}
            onBuy={() => dispatch({ type: "buy_producer", producer: prod.id, qty: n })}
          />
        ))}
      </div>

      <div className="rows">
        {upgrades.map((u) => (
          <Row
            key={u.id}
            accent="row-upgrade"
            name={u.name}
            blurb={u.blurb}
            cost={format(u.cost)}
            affordable={P.gte(budget, u.cost)}
            art={upgradePreview(farm, u)}
            onBuy={() => dispatch({ type: "buy_upgrade", upgrade: u.id })}
          />
        ))}
      </div>
    </>
  );
}

export function LandPanel({
  farm,
  budget,
  dispatch,
}: {
  farm: solo.FarmState;
  budget: Potatoes;
  dispatch: (cmd: solo.FarmCommand) => void;
}) {
  const soilBill = solo.soilRestoreCost(farm);
  // Damage on the farm you're standing on. What broke on the other one is
  // waiting for you when you go back, which is the cost of keeping two places:
  // nothing down here can be fixed from up there.
  const damaged = solo
    .producersIn(farm.world)
    .filter((p) => solo.brokenCount(farm, p.id) > 0);
  const elsewhere = solo
    .producersIn(farm.world === "inside" ? "outside" : "inside")
    .reduce((n, p) => n + solo.brokenCount(farm, p.id), 0);

  // Everything above, as one payment. Only offered when there's more than one
  // thing to pay for — a "fix all" over a single row is the same button twice,
  // and the row it duplicates is the one that says what it's actually mending.
  const bill = solo.upkeepBill(farm);
  const jobs = damaged.length + (soilBill > 0 ? 1 : 0);
  const brokenHere = damaged.reduce((n, p) => n + solo.brokenCount(farm, p.id), 0);
  // Only what this button actually buys back: the kit on this farm, quoted the
  // same way the individual repair rows quote it, plus the soil if it's tired.
  // `brokenRate` would be wrong here — it counts the other farm's damage too,
  // and nothing you press from this world puts that right.
  const backHere =
    damaged.reduce(
      (r, p) => r + solo.brokenCount(farm, p.id) * solo.producerRateEach(farm, p.id),
      0,
    ) + (soilBill > 0 ? solo.soilLossRate(farm) : 0);

  return (
    <>
      {(damaged.length > 0 || soilBill > 0) && (
        <>
          <p className="hint">
            Nothing here mends on its own. What the weather hurt stays hurt and tired soil
            stays tired until you spend on it — that's what {farm.converged ? "the tuber" : "the weather"}{" "}
            actually costs.
          </p>
          {jobs > 1 && (
            <div className="rows">
              <Row
                accent="row-repair row-fixall"
                name="Put everything right"
                blurb={`${
                  brokenHere > 0 && soilBill > 0
                    ? `${brokenHere} broken and the soil`
                    : brokenHere > 0
                      ? `${brokenHere} broken`
                      : "the soil"
                } · restores +${format(backHere)}/s`}
                cost={format(bill)}
                affordable={P.gte(budget, bill)}
                onBuy={() => dispatch({ type: "fix_all" })}
              />
            </div>
          )}
          <div className="rows">
            {soilBill > 0 && (
              <Row
                accent="row-repair"
                name="Restore the soil"
                blurb={`Back to 100% from ${Math.round(farm.soil * 100)}% · restores +${format(
                  solo.soilLossRate(farm),
                )}/s`}
                cost={format(soilBill)}
                affordable={P.gte(budget, soilBill)}
                onBuy={() => dispatch({ type: "restore_soil" })}
              />
            )}
            {damaged.map((prod) => {
              const broken = solo.brokenCount(farm, prod.id);
              const cost = solo.repairCost(farm, prod.id);
              // What it gives back as things stand, tired soil included — the
              // same convention the Grow panel quotes. The *price* stays on the
              // clean rate, which is deliberate: repairs are billed against the
              // production restored at full health.
              const back = broken * solo.producerRateEach(farm, prod.id);
              return (
                <Row
                  key={`repair-${prod.id}`}
                  accent="row-repair"
                  name={`${prod.mend} ${prod.name}`}
                  blurb={`${broken} ${prod.hurt} · restores +${format(back)}/s`}
                  cost={format(cost)}
                  affordable={P.gte(budget, cost)}
                  onBuy={() => dispatch({ type: "repair", producer: prod.id })}
                />
              );
            })}
          </div>
        </>
      )}

      {elsewhere > 0 && (
        <p className="hint">
          {elsewhere} more {elsewhere === 1 ? "thing is" : "things are"} broken{" "}
          {farm.world === "inside" ? "out under the sky" : "down inside the potato"}. You'll have to
          be standing there to put {elsewhere === 1 ? "it" : "them"} right.
        </p>
      )}

      <p className="hint">
        Buildings work whether you're here or not, which is the only kind of defence worth having
        against {farm.converged ? "something that stirs" : "weather that lands"} while the tab is
        closed. They never stop it outright.
      </p>
      <div className="rows">
        {solo.landsIn(farm.world).filter((land) => solo.isLandAvailable(farm, land.id)).map((land) => {
          const level = solo.landLevel(farm, land.id);
          const cost = solo.landCost(farm, land.id);
          const now = solo.mitigation(farm, land.role);
          return (
            <Row
              key={land.id}
              accent="row-defend"
              name={`${land.name}${level ? ` ×${level}` : ""}`}
              blurb={land.blurb}
              cost={format(cost)}
              meta={`${Math.round(now * 100)}% now`}
              affordable={P.gte(budget, cost)}
              onBuy={() => dispatch({ type: "buy_land", land: land.id })}
            />
          );
        })}
      </div>
    </>
  );
}

export function LegacyPanel({
  farm,
  now,
  pendingDigs,
  dispatch,
}: {
  farm: solo.FarmState;
  now: Millis;
  pendingDigs: number;
  dispatch: (cmd: solo.FarmCommand) => void;
}) {
  // Which world the next generation gets. Defaults to the one you're standing
  // in: coming back out is a thing you go and ask for.
  const [outside, setOutside] = useState(false);
  const pending = solo.pendingSeeds(farm);
  const thisRun = solo.projectedHarvested(farm, now);
  const multNow = 1 + solo.MULT_PER_UNSPENT_SEED * farm.seeds;
  const multAfter = 1 + solo.MULT_PER_UNSPENT_SEED * (farm.seeds + pending);

  return (
    <>
      <div className="legacy-head">
        <div>
          <div className="legacy-value">{farm.seeds}</div>
          <div className="muted small">Heirloom Seed · ×{multNow.toFixed(2)} output</div>
        </div>
        {/* This run's harvest is what `pendingSeeds` is computed from, so it
            reads here rather than in a ledger somewhere else — the number and
            the thing it buys in the same glance. Lifetime is the only figure in
            the game that never goes backwards, and it's the one that makes a
            hand-down feel like it added up to something. */}
        <div className="muted small legacy-runs">
          <div>This run {format(P.add(thisRun, P.mul(solo.clickYield(farm), pendingDigs)))}</div>
          <div>Lifetime {format(farm.lifetimeHarvested)}</div>
        </div>
      </div>

      <p className="hint">
        Seeds do two jobs, and you can't have both. Held, every seed makes this farm and every
        farm after it produce more. Spent, they buy something permanent. Same choice as everything
        else here — one pile, competing uses.
      </p>

      {/* The only way back out of the potato, and it's on the one screen where
          you're already deciding what the next generation inherits.

          The fold survives prestige because finding out you've always been
          inside the potato is a thing that should happen to you once. But
          "once" turned into "once ever, on a save you keep for weeks" — the
          best ten seconds in the game, locked behind a flag, with the world
          you'd want to show someone gone for good. So: the horizon is part of
          what you hand down. Keep the ceiling, or give the next generation a
          sky and the climb back to it. */}
      {/* The tab used to be held until the fold so nobody could hand the farm
          down on the eve of the best thing in the game. It isn't any more, so
          the warning has to live somewhere — and a sentence is a better version
          of it than a locked door, because it tells you what you'd be giving up
          instead of pretending there's nothing there. */}
      {!farm.converged && (
        <p className="hint">
          The shop still has an end you haven't reached. Nothing stops you handing this farm down
          first, but the run that gets all the way there is worth having once.
        </p>
      )}

      {farm.converged && (
        <>
          <p className="hint">
            You can hand down the sky as well. Stay inside and the next generation starts under the
            ceiling, with the tiers that farm it already in the shop. Go back out and the horizon
            opens — no Bruise Bed, no Taproot Well, weather instead of the tuber, and the
            Convergence to reach all over again.
          </p>
          <div className="choices halves">
            <button className={outside ? "" : "on"} onClick={() => setOutside(false)}>
              Inside the potato
            </button>
            <button className={outside ? "on" : ""} onClick={() => setOutside(true)}>
              Back under the sky
            </button>
          </div>
        </>
      )}

      <div className="rows">
        <Row
          accent="row-upgrade"
          name={pending > 0 ? `Hand the farm down — +${pending} seed` : "Hand the farm down"}
          blurb={
            pending > 0
              ? `Clears everything this generation built. Output goes ×${multNow.toFixed(
                  2,
                )} → ×${multAfter.toFixed(2)}.${
                  farm.converged ? (outside ? " Starts outside the potato." : " Starts inside the potato.") : ""
                }`
              : "Not worth doing yet — grow this generation further first."
          }
          cost={pending > 0 ? `+${pending}` : "—"}
          affordable={pending > 0}
          onBuy={() => {
            const where =
              farm.converged && outside
                ? " The next farm starts outside the potato, and everything above the fold goes with it."
                : "";
            if (
              window.confirm(
                `Hand the farm down? Everything this generation built is cleared.${where}`,
              )
            ) {
              dispatch({ type: "prestige", outside });
            }
          }}
        />
      </div>

      <div className="rows">
        {solo.PERKS.filter((perk) => solo.isPerkAvailable(farm, perk.id)).map((perk) => {
          const level = farm.perks[perk.id] ?? 0;
          const maxed = level >= perk.maxLevel;
          const cost = solo.perkCost(perk, level);
          return (
            <Row
              key={perk.id}
              accent="row-defend"
              name={`${perk.name}${level ? ` ×${level}` : ""}`}
              blurb={maxed ? "Fully grown." : perk.blurb}
              cost={maxed ? "—" : `${cost} seed`}
              affordable={!maxed && farm.seeds >= cost}
              onBuy={() => dispatch({ type: "buy_perk", perk: perk.id })}
            />
          );
        })}
      </div>
    </>
  );
}
