import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  P,
  clickYield,
  format,
  formatDuration,
  seconds,
  solo,
  standings,
  type ScoringRule,
} from "@battle/sim";

import { AwayReport } from "./components/AwayReport.js";
import { Farm } from "./components/Farm.js";
import { FarmFeed } from "./components/FarmFeed.js";
import { FarmScene, TitleScene, type FarmSceneHandle } from "./components/FarmScene.js";
import { GrowPanel, LandPanel, LegacyPanel } from "./components/FarmShop.js";
import { FarmStatus } from "./components/FarmStatus.js";
import { Feed } from "./components/Feed.js";
import { Opponents } from "./components/Opponents.js";
import { PxIcon } from "./components/PxIcon.js";
import { Sheet } from "./components/Sheet.js";
import { Shop } from "./components/Shop.js";
import { hasSavedFarm, useFarm } from "./useFarm.js";
import { YOU, useMatch, type MatchSetup } from "./useMatch.js";

/** `greedy` exists as a control group for the balance harness, not as an opponent. */
const PLAYABLE_BOTS: MatchSetup["botProfile"][] = ["chill", "scrappy", "nasty"];

const LENGTHS = [
  { label: "2 min", ms: seconds(120) },
  { label: "5 min", ms: seconds(300) },
  { label: "10 min", ms: seconds(600) },
];

type Screen = { kind: "home" } | { kind: "farm" } | { kind: "versus-lobby" } | { kind: "versus"; setup: MatchSetup };

/**
 * Space always digs, so the shop stays a mouse-only surface. Without the blur,
 * space would re-fire whichever shop button you last clicked.
 */
function useSpaceToDig(dig: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (el && el.tagName === "BUTTON") el.blur();
      e.preventDefault();
      dig();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dig, enabled]);
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

/**
 * The splash, and nothing else. You see this once — the moment you have a farm,
 * the app opens straight onto it, because a homestead game whose front door is
 * a menu makes you ask for your farm every time instead of just being there.
 */
function Home({ onGo }: { onGo: (screen: Screen) => void }) {
  const returning = hasSavedFarm();
  return (
    <div className="lobby">
      <h1>
        Potatoes, <span>Inc.</span>
      </h1>
      <p className="tagline">
        Grow potatoes. The weather will have opinions about that.
      </p>

      {/* Somebody's farm, running. A title screen for a game about a place
          shouldn't be a page of type. */}
      <TitleScene />

      <button className="start" onClick={() => onGo({ kind: "farm" })}>
        {returning ? "Back to your farm" : "Start your farm"}
      </button>
      <p className="muted small home-note">
        A farm you keep. It grows while you're gone — and so does everything that's wrong with it.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The homestead
// ---------------------------------------------------------------------------

type FarmSheet = "status" | "grow" | "land" | "legacy" | "report" | "backroom";

const NAV: { id: FarmSheet; label: string; icon: Parameters<typeof PxIcon>[0]["name"] }[] = [
  { id: "status", label: "Farm", icon: "clipboard" },
  { id: "grow", label: "Grow", icon: "basket" },
  { id: "land", label: "Land", icon: "shield" },
  { id: "legacy", label: "Legacy", icon: "sprout" },
  { id: "report", label: "Report", icon: "cloud" },
  { id: "backroom", label: "House", icon: "house" },
];

/**
 * Everything that isn't the farm: the parked head-to-head prototype and the
 * handful of levers that exist for poking at the game rather than playing it.
 * One door, clearly labelled, out of the way of the loop.
 */
function BackRoom({
  onVersus,
  onTitle,
  dispatch,
}: {
  onVersus: () => void;
  onTitle: () => void;
  dispatch: (cmd: solo.FarmCommand) => void;
}) {
  return (
    <div className="backroom">
      <section>
        <h3>Versus a bot</h3>
        <p className="muted small">
          The older head-to-head prototype: two farms, one clock, and upgrades that reach across the
          table. Parked, but it still runs.
        </p>
        <button className="ghost" onClick={onVersus}>
          Open the lobby
        </button>
      </section>

      <section>
        <h3>Dev tooling</h3>
        <p className="muted small">
          Shortcuts for looking at the game rather than playing it. These are real digs, so they
          respect every multiplier you own — and they will absolutely ruin your save's pacing.
        </p>
        <div className="choices">
          {([
            ["+100 digs", 100],
            ["+10k digs", 10_000],
            ["+1M digs", 1_000_000],
          ] as const).map(([label, digs]) => (
            <button key={digs} className="ghost" onClick={() => dispatch({ type: "dev_grant", digs })}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Title screen</h3>
        <p className="muted small">Your farm keeps running. This just goes back to the front door.</p>
        <button className="ghost" onClick={onTitle}>
          Back to the title
        </button>
      </section>
    </div>
  );
}

/**
 * The homestead screen: a HUD you can read at a glance, the farm itself filling
 * everything between, and one verb at the bottom. Everything else is a sheet.
 *
 * The old layout put the farm's whole state in three columns of text and the
 * farm itself nowhere. Now the two numbers you actually play against — what
 * you've built and what you're holding — are the picture, and the panels are
 * where you go to change them.
 */
function Homefarm({ onGo }: { onGo: (screen: Screen) => void }) {
  const { farm, now, report, dismissReport, budget, pendingDigs, error, dig, dispatch, abandon } =
    useFarm();
  const [sheet, setSheet] = useState<FarmSheet | null>(null);
  const sceneRef = useRef<FarmSceneHandle>(null);
  const [pops, setPops] = useState<{ id: number; text: string }[]>([]);
  const popId = useRef(0);

  const perDig = solo.clickYield(farm);
  const rate = solo.currentRate(farm);
  const needsAttention = solo.brokenRate(farm) > 0 || farm.soil < 1;

  const onDig = useCallback(() => {
    dig();
    sceneRef.current?.dig();
    const id = popId.current++;
    setPops((p) => [...p.slice(-6), { id, text: `+${format(solo.clickYield(farm))}` }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 700);
  }, [dig, farm]);

  useSpaceToDig(onDig, report === null && sheet === null);

  const soilPct = Math.round(farm.soil * 100);

  return (
    <div className="app farm-app">
      <header className="hud">
        <div className="hud-bank">
          <PxIcon name="potato" size={22} />
          <div>
            <div className="hud-value">{format(budget)}</div>
            <div className="hud-label">in the yard</div>
          </div>
        </div>
        <div className="hud-side">
          <div className="hud-rate">{format(rate)}/s</div>
          <div className="soil" title="Soil health">
            <div className="soil-track">
              <div
                className={`soil-fill ${farm.soil < 0.75 ? "low" : ""}`}
                style={{ width: `${soilPct}%` }}
              />
            </div>
            <span className={farm.soil < 1 ? "hurt" : "muted"}>soil {soilPct}%</span>
          </div>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <FarmScene ref={sceneRef} farm={farm} hoard={budget} onDig={onDig} />

      <div className="digbar">
        <button className="dig" onClick={onDig}>
          <PxIcon name="potato" size={20} />
          <span className="dig-label">Dig</span>
          <span className="dig-yield">+{format(perDig)}</span>
        </button>
        <div className="pops" aria-hidden>
          {pops.map((p) => (
            <span key={p.id} className="pop">
              {p.text}
            </span>
          ))}
        </div>
      </div>

      <nav className="nav">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={item.id === "land" && needsAttention ? "alert" : undefined}
            onClick={() => setSheet(item.id)}
          >
            <PxIcon name={item.icon} size={20} />
            <span>{item.label}</span>
            {item.id === "land" && needsAttention && <span className="nav-dot" />}
          </button>
        ))}
      </nav>

      {sheet === "status" && (
        <Sheet title="Your farm" sub={`Generation ${farm.generation}`} onClose={() => setSheet(null)}>
          <FarmStatus
            farm={farm}
            now={now}
            budget={budget}
            pendingDigs={pendingDigs}
            onAbandon={() => {
              abandon();
              setSheet(null);
            }}
          />
        </Sheet>
      )}
      {sheet === "grow" && (
        <Sheet
          title="Grow"
          sub="More kit on the land, and the upgrades that make it worth more."
          onClose={() => setSheet(null)}
          foot={
            <>
              <span className="muted">To spend</span>
              <strong>{format(budget)}</strong>
            </>
          }
        >
          <GrowPanel farm={farm} budget={budget} dispatch={dispatch} />
        </Sheet>
      )}
      {sheet === "land" && (
        <Sheet
          title="Land"
          sub="Repairs, and the buildings that mean fewer of them."
          onClose={() => setSheet(null)}
          foot={
            <>
              <span className="muted">To spend</span>
              <strong>{format(budget)}</strong>
            </>
          }
        >
          <LandPanel farm={farm} budget={budget} dispatch={dispatch} />
        </Sheet>
      )}
      {sheet === "legacy" && (
        <Sheet
          title="Legacy"
          sub="Hand the farm down, or spend what the last one left you."
          onClose={() => setSheet(null)}
        >
          <LegacyPanel farm={farm} dispatch={dispatch} />
        </Sheet>
      )}
      {sheet === "report" && (
        <Sheet title="Field report" sub="What the weather has been up to." onClose={() => setSheet(null)}>
          <FarmFeed farm={farm} now={now} />
        </Sheet>
      )}

      {sheet === "backroom" && (
        <Sheet
          title="The house"
          sub="Side doors: the versus prototype, and the levers that aren't the game."
          onClose={() => setSheet(null)}
        >
          <BackRoom
            onVersus={() => onGo({ kind: "versus-lobby" })}
            onTitle={() => onGo({ kind: "home" })}
            dispatch={dispatch}
          />
        </Sheet>
      )}

      {report && <AwayReport report={report} onDismiss={dismissReport} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Versus (the older prototype)
// ---------------------------------------------------------------------------

function VersusLobby({ onStart, onBack }: { onStart: (setup: MatchSetup) => void; onBack: () => void }) {
  const [playerName, setPlayerName] = useState("");
  const [durationMs, setDurationMs] = useState(seconds(300));
  const [botProfile, setBotProfile] = useState<MatchSetup["botProfile"]>("chill");
  const [scoring, setScoring] = useState<ScoringRule>("total_harvested");

  return (
    <div className="lobby">
      <h1>
        Potatoes, <span>Inc.</span>
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
      <div className="home-aside">
        <button className="ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function Match({ setup, onExit }: { setup: MatchSetup; onExit: () => void }) {
  const { state, now, me, pendingClicks, over, error, click, dispatch, restart } = useMatch(setup);
  useSpaceToDig(click);

  const table = standings(state, now);
  const opponentIds = state.order.filter((id) => id !== YOU);
  const opponents = opponentIds.map((id) => state.players[id]!);
  // Clicks you've made but that haven't been flushed into the sim yet still
  // count — `dispatch` banks them before it spends, so this is honest.
  const budget = useMemo(
    () => P.add(me.potatoes, P.mul(clickYield(me), pendingClicks)),
    [me, pendingClicks],
  );
  const yourScore = table.find((s) => s.player.id === YOU)?.score ?? 0;
  const timeLeft = state.startedAt + state.config.durationMs - now;

  return (
    <div className="app">
      {/* Pinned, because the two numbers you actually play against — the clock
          and what's in the bank — are otherwise scrolled off the moment you go
          shopping, which is exactly when you need them. */}
      <header className="topbar">
        <div className="brand">
          Potatoes, <span>Inc.</span>
        </div>
        <div className={`clock ${timeLeft < seconds(30) ? "urgent" : ""}`}>
          {formatDuration(timeLeft)}
        </div>
        <div className="topbar-bank">
          <span className="topbar-bank-value">{format(budget)}</span>
          <span className="topbar-bank-label">to spend</span>
        </div>
        <div className="topbar-right">
          <span className="muted rule">
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
  // A farm you already own is the app. The splash is for the one session where
  // you don't have one yet.
  const [screen, setScreen] = useState<Screen>(() =>
    hasSavedFarm() ? { kind: "farm" } : { kind: "home" },
  );

  switch (screen.kind) {
    case "farm":
      return <Homefarm onGo={setScreen} />;
    case "versus-lobby":
      return (
        <VersusLobby
          onStart={(setup) => setScreen({ kind: "versus", setup })}
          onBack={() => setScreen({ kind: "farm" })}
        />
      );
    case "versus":
      return (
        <Match
          key={`${screen.setup.durationMs}-${screen.setup.botProfile}-${screen.setup.scoring}`}
          setup={screen.setup}
          onExit={() => setScreen({ kind: "versus-lobby" })}
        />
      );
    default:
      return <Home onGo={setScreen} />;
  }
}
