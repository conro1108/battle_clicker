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
  // Digs you've made but that haven't been flushed into the sim yet still
  // count, the same way they do in the barn figure.
  const harvested = P.add(solo.projectedHarvested(farm, now), P.mul(perDig, pendingDigs));
  const rate = solo.currentRate(farm);
  const lostToBreak = solo.brokenRate(farm);
  const lostToSoil = solo.soilLossRate(farm);
  const repairBill = solo.totalRepairCost(farm);
  const soilBill = solo.soilRestoreCost(farm);

  return (
    <section className="panel farm">
      <header className="panel-head">
        <h2>Your farm</h2>
        <span className="muted small">Generation {farm.generation}</span>
      </header>

      <div className="tally">
        <div className="bank">
          <div className="bank-value">{format(budget)}</div>
          <div className="bank-label">in the barn</div>
        </div>
        <div className="tally-score">
          <span className="tally-score-value">{format(harvested)}</span>
          <span className="tally-score-label">harvested this generation</span>
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

      <button className="dig" onClick={onDig}>
        <span className="dig-emoji" aria-hidden>
          🥔
        </span>
        <span className="dig-label">Dig</span>
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
                <span className="hurt">−{format(lostToBreak)}/s</span> broken kit ·{" "}
                <span className="muted">{format(repairBill)} to fix</span>
              </div>
            )}
            {lostToSoil > 0 && (
              <div>
                <span className="hurt">−{format(lostToSoil)}/s</span> tired soil ·{" "}
                <span className="muted">{format(soilBill)} to put right</span>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
