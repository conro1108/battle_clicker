import { solo, type Millis } from "@battle/sim";

/** Wall-clock-ish, since a homestead has no match clock to count against. */
function ago(at: Millis, now: Millis): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86_400)}d`;
}

export function FarmFeed({ farm, now }: { farm: solo.FarmState; now: Millis }) {
  const entries = [...farm.log].reverse().slice(0, 40);
  return (
    <section className="panel feed">
      <header className="panel-head">
        <h2>Field report</h2>
      </header>
      {entries.length === 0 ? (
        <p className="muted">Quiet so far.</p>
      ) : (
        <ul className="feed-list">
          {entries.map((e) => (
            <li key={e.index} className={`feed-item feed-${e.tone}`}>
              <span className="feed-time">{ago(e.at, now)}</span>
              <span className="feed-text">{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
