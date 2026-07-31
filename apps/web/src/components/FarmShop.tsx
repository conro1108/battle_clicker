import { useState } from "react";
import { P, format, solo, type Potatoes } from "@battle/sim";

import { producerArt, upgradePreview } from "../marks.js";
import { artUrl, type Art } from "../render/pixel.js";

type BuyQty = 1 | 10 | "max";

function Row({
  name,
  blurb,
  cost,
  meta,
  affordable,
  onBuy,
  accent,
  art,
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
        <span className="row-name">{name}</span>
        <span className="row-blurb">{blurb}</span>
      </span>
      <span className="row-right">
        <span className="row-cost">{cost}</span>
        {meta && <span className="row-meta">{meta}</span>}
      </span>
    </button>
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
  const [qty, setQty] = useState<BuyQty>(1);

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
        {solo.SOLO_PRODUCERS.map((prod, i) => {
          const owned = farm.producers[prod.id] ?? 0;
          const n = qty === "max" ? Math.max(1, solo.affordableCount(farm, prod.id, budget)) : qty;
          const cost = solo.producerCost(farm, prod.id, n);
          // What it would actually add to the farm as it stands, tired soil and
          // all — the Mantle Tap's rate moves with the dirt, so a clean-rate
          // quote would be advertising a machine you can't currently buy.
          const each = solo.producerRateEach(farm, prod.id);
          const broken = solo.brokenCount(farm, prod.id);

          // The ladder reveals itself a rung at a time, but the first rung is
          // always there or an empty shop greets you at zero potatoes. The four
          // rungs above the fold are a harder gate than that: they farm parts of
          // a potato you haven't discovered you're inside yet, so they aren't in
          // the shop at all until the horizon closes.
          const prev = solo.SOLO_PRODUCERS[i - 1];
          const visible =
            solo.isProducerAvailable(farm, prod.id) &&
            (i === 0 ||
              owned > 0 ||
              (prev !== undefined && (farm.producers[prev.id] ?? 0) > 0) ||
              P.gte(P.mul(budget, 3), prod.baseCost));
          if (!visible) return null;

          return (
            <Row
              key={prod.id}
              name={`${prod.name}${owned ? ` ×${owned}` : ""}${broken ? ` (${broken} broken)` : ""}`}
              blurb={`${prod.blurb} +${format(each * n)}/s`}
              cost={format(cost)}
              meta={qty === "max" ? `buy ${n}` : undefined}
              affordable={P.gte(budget, cost)}
              art={producerArt(farm, prod.id)}
              onBuy={() => dispatch({ type: "buy_producer", producer: prod.id, qty: n })}
            />
          );
        })}
      </div>

      <div className="rows">
        {solo.SOLO_UPGRADES.filter(
          (u) => !farm.upgrades.includes(u.id) && solo.isUnlocked(farm, u),
        ).map((u) => (
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
  const damaged = solo.SOLO_PRODUCERS.filter((p) => solo.brokenCount(farm, p.id) > 0);

  return (
    <>
      {(damaged.length > 0 || soilBill > 0) && (
        <>
          <p className="hint">
            Nothing here heals on its own. Broken kit stays broken and tired soil stays tired
            until you spend on it — that's what {farm.converged ? "the tuber" : "the weather"}{" "}
            actually costs.
          </p>
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
              const back = broken * prod.baseRate * solo.producerMultiplier(farm, prod.id);
              return (
                <Row
                  key={`repair-${prod.id}`}
                  accent="row-repair"
                  name={`Repair ${prod.name}`}
                  blurb={`${broken} broken · restores +${format(back)}/s`}
                  cost={format(cost)}
                  affordable={P.gte(budget, cost)}
                  onBuy={() => dispatch({ type: "repair", producer: prod.id })}
                />
              );
            })}
          </div>
        </>
      )}

      <p className="hint">
        Buildings work whether you're here or not, which is the only kind of defence worth having
        against {farm.converged ? "something that stirs" : "weather that lands"} while the tab is
        closed. They never stop it outright.
      </p>
      <div className="rows">
        {solo.LANDS.filter((land) => solo.isLandAvailable(farm, land.id)).map((land) => {
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
  dispatch,
}: {
  farm: solo.FarmState;
  dispatch: (cmd: solo.FarmCommand) => void;
}) {
  const pending = solo.pendingSeeds(farm);
  const multNow = 1 + solo.MULT_PER_UNSPENT_SEED * farm.seeds;
  const multAfter = 1 + solo.MULT_PER_UNSPENT_SEED * (farm.seeds + pending);

  return (
    <>
      <div className="legacy-head">
        <div>
          <div className="legacy-value">{farm.seeds}</div>
          <div className="muted small">Heirloom Seed · ×{multNow.toFixed(2)} output</div>
        </div>
        <div className="muted small">
          Lifetime harvest {format(farm.lifetimeHarvested)}
        </div>
      </div>

      <p className="hint">
        Seeds do two jobs, and you can't have both. Held, every seed makes this farm and every
        farm after it produce more. Spent, they buy something permanent. Same choice as everything
        else here — one pile, competing uses.
      </p>

      <div className="rows">
        <Row
          accent="row-upgrade"
          name={pending > 0 ? `Hand the farm down — +${pending} seed` : "Hand the farm down"}
          blurb={
            pending > 0
              ? `Clears everything this generation built. Output goes ×${multNow.toFixed(
                  2,
                )} → ×${multAfter.toFixed(2)}.`
              : "Not worth doing yet — grow this generation further first."
          }
          cost={pending > 0 ? `+${pending}` : "—"}
          affordable={pending > 0}
          onBuy={() => {
            if (window.confirm("Hand the farm down? Everything this generation built is cleared.")) {
              dispatch({ type: "prestige" });
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
