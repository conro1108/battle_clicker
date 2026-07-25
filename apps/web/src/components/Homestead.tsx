import { P, format, solo, type Millis, type Potatoes } from "@battle/sim";

/**
 * Soil is the number that only ever falls on its own, so it gets a bar rather
 * than a figure — you should be able to see it slipping without reading it.
 */
function SoilBar({ soil }: { soil: number }) {
  const pct = Math.round(soil * 100);
  const tired = soil < 0.75;
  return (
    <div className="soil">
      <div className="soil-head">
        <span>Soil health</span>
        <strong className={tired ? "hurt" : undefined}>{pct}%</strong>
      </div>
      <div className="soil-track">
        <div className={`soil-fill ${tired ? "low" : ""}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Homestead({
  farm,
  now,
  budget,
  pendingDigs,
  onDig,
}: {
  farm: solo.FarmState;
  now: Millis;
  budget: Potatoes;
  pendingDigs: number;
  onDig: () => void;
}) {
  const perDig = solo.clickYield(farm);
  // Digs banked client-side but not yet flushed still count, the same way they
  // do in the spendable total.
  const harvested = P.add(solo.projectedHarvested(farm, now), P.mul(perDig, pendingDigs));
  const rate = solo.currentRate(farm);
  const lostToBreak = solo.brokenRate(farm);
  const lostToSoil = solo.soilLossRate(farm);
  const repairBill = solo.totalRepairCost(farm);
  const soilBill = solo.soilRestoreCost(farm);
  // Damage reads as a share of what the farm would otherwise be making — a rate
  // in potatoes is a number you have to divide before it means anything. The two
  // are measured against their own cause rather than a common total, because
  // that's what each one is exactly worth: broken kit is the share of units
  // offline, tired soil is the multiplier itself.
  const breakPct = Math.round((lostToBreak / Math.max(1e-9, lostToBreak + rate)) * 100);
  const soilPct = Math.round((1 - farm.soil) * 100);

  return (
    <section className="panel farm homestead">
      <header className="panel-head">
        <h2>Your farm</h2>
        <span className="muted small">Generation {farm.generation}</span>
      </header>

      {/* What you can spend is the number every row in the shop is judged
          against, so it's the big one, sitting next to the shop and above the
          dig button. Harvested is the one you only glance at. */}
      <div className="tally">
        <div className="bank">
          <div className="bank-value">{format(budget)}</div>
          <div className="bank-label">to spend</div>
        </div>
        <div className="tally-score">
          <span className="tally-score-value">{format(harvested)}</span>
          <span className="tally-score-label">harvested</span>
        </div>
      </div>

      <dl className="stats">
        <div>
          <dt>Per second</dt>
          <dd className={lostToBreak + lostToSoil > 0 ? "hurt" : undefined}>{format(rate)}</dd>
        </div>
        <div>
          <dt>Per dig</dt>
          <dd>{format(perDig)}</dd>
        </div>
      </dl>

      {/* The one thing you're always able to do, so it gets the room. The yield
          rides on the button because "what is a dig worth right now" is the
          only question that decides whether to keep tapping. */}
      <button className="dig" onClick={onDig}>
        <span className="dig-emoji" aria-hidden>
          🥔
        </span>
        <span className="dig-label">Dig</span>
        <span className="dig-yield">+{format(perDig)}</span>
      </button>

      <SoilBar soil={farm.soil} />

      {/* One block for everything the weather is currently costing you, with
          the bill attached. Damage that you have to go hunting for in a shop
          tab is damage you leave sitting there. */}
      {(lostToBreak > 0 || lostToSoil > 0) && (
        <div className="damage">
          <div className="damage-head">What the weather's costing you</div>
          <div className="damage-body">
            {lostToBreak > 0 && (
              <div>
                <span className="hurt">−{breakPct}% production</span> broken kit ·{" "}
                <span className="muted">{format(repairBill)} to fix</span>
              </div>
            )}
            {lostToSoil > 0 && (
              <div>
                <span className="hurt">−{soilPct}% production</span> tired soil ·{" "}
                <span className="muted">{format(soilBill)} to put right</span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
