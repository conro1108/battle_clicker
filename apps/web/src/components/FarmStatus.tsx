import { P, format, solo, type Millis, type Potatoes } from "@battle/sim";

/**
 * The numbers behind the picture.
 *
 * The scene now carries what the farm *feels* like — how much kit is out there,
 * how much is parked and grey, how big the pile in the yard is — so this panel
 * is free to be the ledger rather than the dashboard.
 */
export function FarmStatus({
  farm,
  now,
  budget,
  pendingDigs,
  onAbandon,
}: {
  farm: solo.FarmState;
  now: Millis;
  budget: Potatoes;
  pendingDigs: number;
  onAbandon: () => void;
}) {
  const perDig = solo.clickYield(farm);
  const harvested = P.add(solo.projectedHarvested(farm, now), P.mul(perDig, pendingDigs));
  const rate = solo.currentRate(farm);
  const lostToBreak = solo.brokenRate(farm);
  const lostToSoil = solo.soilLossRate(farm);
  const repairBill = solo.totalRepairCost(farm);
  const soilBill = solo.soilRestoreCost(farm);
  // Each loss is measured against its own cause rather than a common total,
  // because that's what each one is exactly worth: damage is the share of
  // units offline, tired soil is the multiplier itself.
  const breakPct = Math.round((lostToBreak / Math.max(1e-9, lostToBreak + rate)) * 100);
  const soilPct = Math.round((1 - farm.soil) * 100);
  const owned = solo.SOLO_PRODUCERS.reduce((n, p) => n + (farm.producers[p.id] ?? 0), 0);

  return (
    <>
      <dl className="stat-list">
        <div>
          <dt>To spend</dt>
          <dd>{format(budget)}</dd>
        </div>
        <div>
          <dt>Harvested</dt>
          <dd>{format(harvested)}</dd>
        </div>
        <div>
          <dt>Per second</dt>
          <dd className={lostToBreak + lostToSoil > 0 ? "hurt" : undefined}>{format(rate)}</dd>
        </div>
        <div>
          <dt>Per dig</dt>
          <dd>{format(perDig)}</dd>
        </div>
        <div>
          <dt>Kit on the land</dt>
          <dd>{owned}</dd>
        </div>
        <div>
          <dt>Soil health</dt>
          <dd className={farm.soil < 0.75 ? "hurt" : undefined}>
            {Math.round(farm.soil * 100)}%
          </dd>
        </div>
        <div>
          <dt>Generation</dt>
          <dd>{farm.generation}</dd>
        </div>
        <div>
          <dt>Heirloom Seed</dt>
          <dd>{farm.seeds}</dd>
        </div>
      </dl>

      {(lostToBreak > 0 || lostToSoil > 0) && (
        <div className="damage">
          <div className="damage-head">What the weather's costing you</div>
          <div className="damage-body">
            {lostToBreak > 0 && (
              <div>
                <span className="hurt">−{breakPct}% production</span> damage ·{" "}
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

      <button
        className="ghost danger wide"
        onClick={() => {
          if (window.confirm("Plough it all under? This keeps nothing — not even seeds.")) {
            onAbandon();
          }
        }}
      >
        Plough it all under
      </button>
    </>
  );
}
