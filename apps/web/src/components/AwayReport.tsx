import { format, solo } from "@battle/sim";

function describeAway(msAway: number): string {
  const minutes = Math.round(msAway / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.round(hours / 24)} days`;
}

/**
 * The payoff for a mode you're meant to leave alone. Coming back to a number
 * that's simply bigger isn't a reason to check in — coming back to a season
 * that happened without you is.
 */
export function AwayReport({
  report,
  onDismiss,
}: {
  report: solo.OfflineReport;
  onDismiss: () => void;
}) {
  // The feed keeps the blow-by-blow; this wants the shape of the season, so
  // repeated weather is counted rather than listed.
  const byKind = new Map<string, number>();
  for (const e of report.events) byKind.set(e.name, (byKind.get(e.name) ?? 0) + 1);
  const summary = [...byKind.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="overlay">
      <div className="result">
        <h2>While you were out</h2>
        <p className="muted">
          {describeAway(report.awayMs)} away. The farm kept going, and so did the weather.
        </p>

        <ol className="final">
          <li>
            <span>Harvested</span>
            <strong>{format(report.earned)}</strong>
          </li>
          {report.gained > 0 && (
            <li>
              <span>Good years and payouts</span>
              <strong>{format(report.gained)}</strong>
            </li>
          )}
          {report.brokeTotal > 0 && (
            <li>
              <span>Broken</span>
              <strong className="hurt">{report.brokeTotal} units</strong>
            </li>
          )}
          {report.soilLost > 0.001 && (
            <li>
              <span>Soil lost</span>
              <strong className="hurt">{(report.soilLost * 100).toFixed(0)} points</strong>
            </li>
          )}
        </ol>

        {summary.length > 0 && (
          <ul className="away-kinds">
            {summary.map(([name, count]) => (
              <li key={name}>
                {name}
                {count > 1 && <span className="muted"> ×{count}</span>}
              </li>
            ))}
          </ul>
        )}

        <div className="result-actions">
          <button className="start" onClick={onDismiss}>
            Get back to work
          </button>
        </div>
      </div>
    </div>
  );
}
