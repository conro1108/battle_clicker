import { format, solo } from "@battle/sim";

/**
 * What's currently being taken off the top, and what it costs to stop.
 *
 * This used to head a ledger of eight numbers, six of which were already on the
 * HUD or the dig bar. The ledger is gone; this is the part that wasn't repeated
 * anywhere, and it belongs above the repair bill rather than in a tab of its
 * own — reading what broke and paying for it are the same errand.
 */
export function Damage({ farm }: { farm: solo.FarmState }) {
  const rate = solo.currentRate(farm);
  const lostToBreak = solo.brokenRate(farm);
  const lostToSoil = solo.soilLossRate(farm);
  if (lostToBreak <= 0 && lostToSoil <= 0) return null;

  // Each loss is measured against its own cause rather than a common total,
  // because that's what each one is exactly worth: damage is the share of
  // units offline, tired soil is the multiplier itself.
  const breakPct = Math.round((lostToBreak / Math.max(1e-9, lostToBreak + rate)) * 100);
  const soilPct = Math.round((1 - farm.soil) * 100);

  return (
    <div className="damage">
      <div className="damage-head">
        What {farm.converged ? "the tuber's" : "the weather's"} costing you
      </div>
      <div className="damage-body">
        {lostToBreak > 0 && (
          <div>
            <span className="hurt">−{breakPct}% production</span> damage ·{" "}
            <span className="muted">{format(solo.totalRepairCost(farm))} to fix</span>
          </div>
        )}
        {lostToSoil > 0 && (
          <div>
            <span className="hurt">−{soilPct}% production</span> tired soil ·{" "}
            <span className="muted">{format(solo.soilRestoreCost(farm))} to put right</span>
          </div>
        )}
      </div>
    </div>
  );
}
