import { formatDuration, type MatchState } from "@battle/sim";

export function Feed({ state }: { state: MatchState }) {
  const entries = [...state.log].reverse().slice(0, 40);
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
              <span className="feed-time">{formatDuration(e.at - state.startedAt)}</span>
              <span className="feed-text">
                <strong>{state.players[e.actor]?.name ?? e.actor}</strong> {e.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
