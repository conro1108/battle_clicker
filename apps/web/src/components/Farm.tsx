import {
  P,
  brokenRate,
  clickYield,
  format,
  potatoesAt,
  rateAt,
  scoreOf,
  slowMultiplier,
  totalRepairCost,
  type MatchState,
  type Millis,
  type PlayerState,
} from "@battle/sim";

function EffectChip({ effect, now }: { effect: PlayerState["effects"][number]; now: Millis }) {
  const left = Math.max(0, effect.expiresAt - now) / 1000;
  const detail =
    effect.kind === "slow"
      ? `−${Math.round((1 - effect.multiplier) * 100)}% output`
      : `${format(effect.power)} absorb left`;
  return (
    <li className={`chip chip-${effect.kind}`}>
      <span className="chip-name">{effect.label}</span>
      <span className="chip-detail">{detail}</span>
      <span className="chip-timer">{left.toFixed(1)}s</span>
    </li>
  );
}

export function Farm({
  state,
  me,
  now,
  pendingClicks,
  onClick,
  disabled,
}: {
  state: MatchState;
  me: PlayerState;
  now: Millis;
  pendingClicks: number;
  onClick: () => void;
  disabled: boolean;
}) {
  const perClick = clickYield(me);
  // Unflushed clicks are shown optimistically so the button feels instant.
  const onHand = P.add(potatoesAt(me, now), P.mul(perClick, pendingClicks));
  const score = P.add(scoreOf(me, now, state.config.scoring), P.mul(perClick, pendingClicks));
  const rate = rateAt(me, now);
  const slow = slowMultiplier(me, now);
  const lost = brokenRate(me);
  const bill = totalRepairCost(me);

  return (
    <section className="panel farm">
      <header className="panel-head">
        <h2>Your farm</h2>
      </header>

      <div className="score">
        <div className="score-main">{format(score)}</div>
        <div className="score-label">
          {state.config.scoring === "on_hand" ? "potatoes on hand" : "potatoes harvested"}
        </div>
      </div>

      <dl className="stats">
        <div>
          <dt>On hand</dt>
          <dd>{format(onHand)}</dd>
        </div>
        <div>
          <dt>Per second</dt>
          <dd className={slow < 1 ? "hurt" : undefined}>
            {format(rate)}
            {slow < 1 && <span className="stat-note"> ({Math.round((1 - slow) * 100)}% cut)</span>}
          </dd>
        </div>
        <div>
          <dt>Per click</dt>
          <dd>{format(perClick)}</dd>
        </div>
      </dl>

      <button className="dig" onClick={onClick} disabled={disabled}>
        <span className="dig-emoji" aria-hidden>
          🥔
        </span>
        <span className="dig-label">Dig</span>
      </button>

      {lost > 0 && (
        <div className="damage">
          <div className="damage-head">Broken kit</div>
          <div className="damage-body">
            <span className="hurt">−{format(lost)}/s</span> until repaired ·{" "}
            <span className="muted">{format(bill)} to fix</span>
          </div>
        </div>
      )}

      <div className="effects">
        <h3>Conditions</h3>
        {me.effects.length === 0 ? (
          <p className="muted">Clear skies.</p>
        ) : (
          <ul className="chips">
            {me.effects.map((e) => (
              <EffectChip key={e.id} effect={e} now={now} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
