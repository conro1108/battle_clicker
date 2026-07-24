import { useEffect, useMemo, useState } from "react";
import {
  format,
  formatDuration,
  seconds,
  standings,
  type ScoringRule,
} from "@battle/sim";

import { Farm } from "./components/Farm.js";
import { Feed } from "./components/Feed.js";
import { Opponents } from "./components/Opponents.js";
import { Shop } from "./components/Shop.js";
import { YOU, useMatch, type MatchSetup } from "./useMatch.js";

/** `greedy` exists as a control group for the balance harness, not as an opponent. */
const PLAYABLE_BOTS: MatchSetup["botProfile"][] = ["chill", "scrappy", "nasty"];

const LENGTHS = [
  { label: "2 min", ms: seconds(120) },
  { label: "5 min", ms: seconds(300) },
  { label: "10 min", ms: seconds(600) },
];

function Lobby({ onStart }: { onStart: (setup: MatchSetup) => void }) {
  const [playerName, setPlayerName] = useState("");
  const [durationMs, setDurationMs] = useState(seconds(300));
  const [botProfile, setBotProfile] = useState<MatchSetup["botProfile"]>("chill");
  const [scoring, setScoring] = useState<ScoringRule>("total_harvested");

  return (
    <div className="lobby">
      <h1>
        Battle <span>Clicker</span>
      </h1>
      <p className="tagline">
        Grow potatoes. Ruin someone else's. You can't afford to do both.
      </p>

      <label className="field">
        <span>Your name</span>
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Farmer"
          maxLength={16}
        />
      </label>

      <div className="field">
        <span>Match length</span>
        <div className="choices">
          {LENGTHS.map((l) => (
            <button
              key={l.label}
              className={durationMs === l.ms ? "on" : ""}
              onClick={() => setDurationMs(l.ms)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Opponent</span>
        <div className="choices">
          {PLAYABLE_BOTS.map((k) => (
            <button key={k} className={botProfile === k ? "on" : ""} onClick={() => setBotProfile(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Winner is</span>
        <div className="choices">
          <button
            className={scoring === "total_harvested" ? "on" : ""}
            onClick={() => setScoring("total_harvested")}
          >
            most harvested
          </button>
          <button className={scoring === "on_hand" ? "on" : ""} onClick={() => setScoring("on_hand")}>
            biggest pile
          </button>
        </div>
        <p className="muted small">
          Harvested counts everything you ever dug up, so spending is free. Biggest pile counts what
          you're holding at the buzzer, so late purchases cost you the game.
        </p>
      </div>

      <button
        className="start"
        onClick={() => onStart({ playerName, durationMs, botProfile, scoring })}
      >
        Start match
      </button>
    </div>
  );
}

function Match({ setup, onExit }: { setup: MatchSetup; onExit: () => void }) {
  const { state, now, me, pendingClicks, over, error, click, dispatch, restart } = useMatch(setup);

  // Space always digs, so the shop stays a mouse-only surface. Without the
  // blur, space would re-fire whichever shop button you last clicked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (el && el.tagName === "BUTTON") el.blur();
      e.preventDefault();
      click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [click]);

  const table = standings(state, now);
  const opponentIds = state.order.filter((id) => id !== YOU);
  const opponents = opponentIds.map((id) => state.players[id]!);
  const budget = useMemo(() => me.potatoes, [me]);
  const yourScore = table.find((s) => s.player.id === YOU)?.score ?? 0;
  const timeLeft = state.startedAt + state.config.durationMs - now;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Battle <span>Clicker</span>
        </div>
        <div className={`clock ${timeLeft < seconds(30) ? "urgent" : ""}`}>
          {formatDuration(timeLeft)}
        </div>
        <div className="topbar-right">
          <span className="muted">
            {state.config.scoring === "on_hand" ? "biggest pile wins" : "most harvested wins"}
          </span>
          <button className="ghost" onClick={onExit}>
            Leave
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <main className="grid">
        <Farm
          state={state}
          me={me}
          now={now}
          pendingClicks={pendingClicks}
          onClick={click}
          disabled={over}
        />
        <Shop me={me} now={now} budget={budget} opponents={opponents} dispatch={dispatch} />
        <div className="sidebar">
          <Opponents state={state} now={now} ids={opponentIds} yourScore={yourScore} />
          <Feed state={state} />
        </div>
      </main>

      {over && (
        <div className="overlay">
          <div className="result">
            <h2>{table[0]?.player.id === YOU ? "You win." : `${table[0]?.player.name} wins.`}</h2>
            <ol className="final">
              {table.map((s) => (
                <li key={s.player.id}>
                  <span>{s.player.name}</span>
                  <strong>{format(s.score)}</strong>
                </li>
              ))}
            </ol>
            <div className="result-actions">
              <button className="start" onClick={restart}>
                Rematch
              </button>
              <button className="ghost" onClick={onExit}>
                Change setup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  const [setup, setSetup] = useState<MatchSetup | null>(null);
  if (!setup) return <Lobby onStart={setSetup} />;
  return (
    <Match
      key={`${setup.durationMs}-${setup.botProfile}-${setup.scoring}`}
      setup={setup}
      onExit={() => setSetup(null)}
    />
  );
}
