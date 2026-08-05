import { useState } from "react";
import {
  ATTACKS,
  DEFENSES,
  P,
  PRODUCERS,
  UPGRADES,
  affordableCount,
  attackCost,
  cleanRate,
  format,
  brokenRate,
  producerCost,
  producerMultiplier,
  rate,
  repairCost,
  repeatCost,
  shieldPool,
  type Command,
  type Millis,
  type PlayerState,
  type Potatoes,
} from "@battle/sim";

type Tab = "grow" | "sabotage" | "defend";
type BuyQty = 1 | 10 | "max";

function Row({
  name,
  blurb,
  cost,
  meta,
  affordable,
  onBuy,
  accent,
  best,
}: {
  name: string;
  blurb: string;
  cost: Potatoes;
  meta?: string;
  affordable: boolean;
  onBuy: () => void;
  accent?: string;
  /** Most rate per potato on the board. A dot, and nothing more. */
  best?: boolean;
}) {
  return (
    <button
      className={`row ${accent ?? ""} ${affordable ? "" : "row-locked"}`}
      onClick={onBuy}
      disabled={!affordable}
    >
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
        <span className="row-cost">{format(cost)}</span>
        {meta && <span className="row-meta">{meta}</span>}
      </span>
    </button>
  );
}

export function Shop({
  me,
  now,
  budget,
  opponents,
  dispatch,
}: {
  me: PlayerState;
  now: Millis;
  budget: Potatoes;
  opponents: PlayerState[];
  dispatch: (cmd: Command) => void;
}) {
  const [tab, setTab] = useState<Tab>("grow");
  const [qty, setQty] = useState<BuyQty>(1);
  const [target, setTarget] = useState<string>(opponents[0]?.id ?? "");

  const targetId = opponents.some((o) => o.id === target) ? target : (opponents[0]?.id ?? "");
  const targetPlayer = opponents.find((o) => o.id === targetId);
  const targetRate = targetPlayer ? cleanRate(targetPlayer) : rate(0);

  const shelf = PRODUCERS.flatMap((prod, i) => {
    const owned = me.producers[prod.id] ?? 0;
    const n = qty === "max" ? Math.max(1, affordableCount(me, prod.id, budget)) : qty;
    const cost = producerCost(prod.id, owned, n);
    const each = prod.baseRate * producerMultiplier(me, prod.id);
    const broken = Math.min(me.broken[prod.id] ?? 0, owned);
    // The ladder reveals itself a rung at a time — but the first rung
    // is always there, or an empty shop greets you at zero potatoes.
    const prev = PRODUCERS[i - 1];
    const visible =
      i === 0 ||
      owned > 0 ||
      (prev !== undefined && (me.producers[prev.id] ?? 0) > 0) ||
      P.gte(P.mul(budget, 3), producerCost(prod.id, 0, 1));
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
    <section className="panel shop">
      <header className="panel-head tabs">
        <button className={tab === "grow" ? "on" : ""} onClick={() => setTab("grow")}>
          Grow
        </button>
        <button className={tab === "sabotage" ? "on" : ""} onClick={() => setTab("sabotage")}>
          Sabotage
        </button>
        <button className={tab === "defend" ? "on" : ""} onClick={() => setTab("defend")}>
          Defend
          {brokenRate(me) > 0 && (
            <span className="tab-alert" title="Something on your farm is down" aria-label="damaged" />
          )}
        </button>
      </header>

      {tab === "grow" && (
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
                cost={cost}
                meta={qty === "max" ? `buy ${n}` : undefined}
                affordable={P.gte(budget, cost)}
                best={prod.id === best}
                onBuy={() =>
                  dispatch({ type: "buy_producer", player: me.id, producer: prod.id, qty: n })
                }
              />
            ))}
          </div>

          <div className="rows">
            {UPGRADES.filter(
              (u) =>
                !me.upgrades.includes(u.id) &&
                (!u.requires || (me.producers[u.requires.producer] ?? 0) >= u.requires.count),
            ).map((u) => (
              <Row
                key={u.id}
                accent="row-upgrade"
                name={u.name}
                blurb={u.blurb}
                cost={u.cost}
                affordable={P.gte(budget, u.cost)}
                onBuy={() => dispatch({ type: "buy_upgrade", player: me.id, upgrade: u.id })}
              />
            ))}
          </div>
        </>
      )}

      {tab === "sabotage" && (
        <>
          {opponents.length > 1 && (
            <div className="qty-toggle">
              <span className="muted">Target</span>
              {opponents.map((o) => (
                <button
                  key={o.id}
                  className={targetId === o.id ? "on" : ""}
                  onClick={() => setTarget(o.id)}
                >
                  {o.name}
                </button>
              ))}
            </div>
          )}
          <p className="hint">
            Priced against the size of the farm you're hitting. A big enough shield eats an attack
            whole.
          </p>
          <div className="rows">
            {ATTACKS.map((a) => {
              const used = me.attacksUsed[a.id] ?? 0;
              const cost = attackCost(a, used, targetRate);
              return (
                <Row
                  key={a.id}
                  accent="row-attack"
                  name={a.name}
                  blurb={a.blurb}
                  cost={cost}
                  meta={`power ${a.power}`}
                  affordable={P.gte(budget, cost) && targetId !== ""}
                  onBuy={() =>
                    dispatch({ type: "attack", player: me.id, target: targetId, attack: a.id })
                  }
                />
              );
            })}
          </div>
        </>
      )}

      {tab === "defend" && (
        <>
          {PRODUCERS.some((prod) => (me.broken[prod.id] ?? 0) > 0) && (
            <>
              <p className="hint">
                Nothing mends on its own. Putting it right costs less than rebuilding, but it's still
                potatoes you didn't grow with — that's the price of getting hit.
              </p>
              <div className="rows">
                {PRODUCERS.map((prod) => {
                  const broken = Math.min(me.broken[prod.id] ?? 0, me.producers[prod.id] ?? 0);
                  if (broken <= 0) return null;
                  const cost = repairCost(me, prod.id);
                  const back = broken * prod.baseRate * producerMultiplier(me, prod.id);
                  return (
                    <Row
                      key={`repair-${prod.id}`}
                      accent="row-repair"
                      name={`${prod.mend} ${prod.name}`}
                      blurb={`${broken} ${prod.hurt} · restores +${format(back)}/s`}
                      cost={cost}
                      affordable={P.gte(budget, cost)}
                      onBuy={() => dispatch({ type: "repair", player: me.id, producer: prod.id })}
                    />
                  );
                })}
              </div>
            </>
          )}

          <p className="hint">
            Shield left: <strong>{format(shieldPool(me, now))}</strong>. It's a pool, not a wall —
            every attack it soaks spends some of it.
          </p>
          <div className="rows">
            {DEFENSES.map((d) => {
              const used = me.defensesUsed[d.id] ?? 0;
              const cost = repeatCost(d.baseCost, d.growth, used);
              return (
                <Row
                  key={d.id}
                  accent="row-defend"
                  name={d.name}
                  blurb={d.blurb}
                  cost={cost}
                  meta={`+${d.power} absorb`}
                  affordable={P.gte(budget, cost)}
                  onBuy={() => dispatch({ type: "defend", player: me.id, defense: d.id })}
                />
              );
            })}
          </div>
        </>
      )}

      <footer className="shop-foot">
        <span className="muted">In the barn</span>
        <strong>{format(budget)}</strong>
      </footer>
    </section>
  );
}
