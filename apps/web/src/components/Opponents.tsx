import { format, opponentView, type MatchState, type Millis, type PlayerId } from "@battle/sim";

/**
 * Everything shown here comes from `opponentView`, which is the only thing the
 * fog rule permits: their count and their production rate. No upgrade tree, no
 * defenses — you're guessing about their shield when you swing.
 */
export function Opponents({
  state,
  now,
  ids,
  yourScore,
}: {
  state: MatchState;
  now: Millis;
  ids: PlayerId[];
  yourScore: number;
}) {
  return (
    <section className="panel opponents">
      <header className="panel-head">
        <h2>Opponents</h2>
      </header>
      <ul className="opp-list">
        {ids.map((id) => {
          const view = opponentView(state, id, now);
          const delta = yourScore - view.count;
          return (
            <li key={id} className="opp">
              <div className="opp-name">{view.name}</div>
              <div className="opp-count">{format(view.count)}</div>
              <div className="opp-rate">{format(view.rate)}/s</div>
              <div className={`opp-delta ${delta >= 0 ? "ahead" : "behind"}`}>
                {delta >= 0 ? "you lead by " : "you trail by "}
                {format(Math.abs(delta))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted fog">
        Count and rate is all you get. Their defenses are their business.
      </p>
    </section>
  );
}
