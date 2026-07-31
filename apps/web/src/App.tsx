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

/**
 * The four things you can open, named after what's inside them.
 *
 * The old set was Grow / Land / Legacy / Report / Farm / House — six tabs, and
 * the first three were interchangeable-sounding words that didn't say which one
 * sold you a tractor and which one fixed it. These are the nouns the game
 * already uses on the panels themselves.
 */
type FarmSheet = "shop" | "weather" | "seeds" | "books";

/** Both of the one-sentence hints. Each is worth showing once, ever. */
const TAUGHT_KEY = "potatoes-inc:taught-tap";
const OMEN_KEY = "potatoes-inc:told-omen";

/** A blocked localStorage reports everything as already seen. Harmless. */
function wasSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return true;
  }
}

function markSeen(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // A blocked localStorage just means the hint comes back. Harmless.
  }
}

/**
 * How long the omen owns the screen, start of the blackout to the last frame of
 * the farm coming back. Kept in step with the `omen-veil` keyframes.
 *
 * It used to be fourteen seconds of text breathing over the sky, which is a long
 * time to hold a player still for one sentence — and because it was a label on
 * the scene rather than an event, buying the Singularity from an open shop meant
 * the whole thing played out behind the sheet. This is short because it's a cut,
 * not a notice: the lights go out, you're told to keep going, the lights come up
 * on a horizon that's moved.
 */
const OMEN_MS = 4600;

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
  const [taught, setTaught] = useState(() => wasSeen(TAUGHT_KEY));
  // The only nudge in the game. The first Tuber Singularity is where the run
  // stops being "buy the next rung" and starts being a climb toward something,
  // and nothing on the screen said so — the ceiling has begun bleeding through
  // the sky by now, but a player who hasn't seen the fold before has no reason
  // to read that as a promise rather than as a sunset.
  const [omen, setOmen] = useState<"unseen" | "showing" | "done">(() =>
    wasSeen(OMEN_KEY) ? "done" : "unseen",
  );
  const looming = solo.convergenceProgress(farm);
  useEffect(() => {
    // If the fold lands while it's still up, it goes immediately: "keep going"
    // is a strange thing to be told about something that has just happened.
    if (farm.converged) {
      markSeen(OMEN_KEY);
      setOmen((was) => (was === "done" ? was : "done"));
      return;
    }
    if (omen !== "unseen" || looming <= 0) return;
    setOmen("showing");
    markSeen(OMEN_KEY);
    // The purchase that triggers this happens in the shop, and the point of the
    // omen is the sky. Take the sheet away under the blackout so the lights come
    // up on the farm rather than on the row of buttons you were just reading.
    setSheet(null);
    const id = setTimeout(() => setOmen("done"), OMEN_MS);
    return () => clearTimeout(id);
  }, [omen, looming, farm.converged]);

  const perDig = solo.clickYield(farm);
  const rate = solo.currentRate(farm);
  const needsAttention = solo.brokenRate(farm) > 0 || farm.soil < 1;
  // Held until the world has folded, and then never taken away.
  //
  // `SEED_DIVISOR` puts the first hand-down in day 1-2 of a run, which is a day
  // or two *before* the Convergence — so revealing this the moment it pays
  // would offer a reset just short of the payoff, and a player who takes the
  // hint doesn't see the fold until their second run at the earliest. The whole
  // point of the first run is that it's one unbroken climb to the fold. Prestige
  // arrives afterwards, as the thing that makes the folded world repeatable.
  //
  // Anyone who already has seeds or has already handed a farm down keeps the
  // tab regardless. Seeds can only be got by prestiging and prestige can only
  // be reached from here, so that costs a first run nothing — and without it a
  // save that converged and then prestiged *before* the flag existed would come
  // back with `upgrades` wiped, `converged` backfilling to false, and no way to
  // spend the seeds it's holding short of re-climbing to the fold.
  const showSeeds = farm.converged || farm.seeds > 0 || farm.generation > 1;

  // Right to left in order of how often you reach for it. The far left of a
  // bottom bar is the corner a thumb has to travel for, and Shop is where you
  // go every time you can afford anything — so it gets the near end, and Seeds
  // slots in at the far end where appearing later doesn't shuffle the rest.
  const nav: { id: FarmSheet; label: string; icon: Parameters<typeof PxIcon>[0]["name"] }[] = [
    ...(showSeeds ? ([{ id: "seeds", label: "Seeds", icon: "sprout" }] as const) : []),
    { id: "books", label: "Books", icon: "clipboard" },
    { id: "weather", label: "Weather", icon: "cloud" },
    { id: "shop", label: "Shop", icon: "basket" },
  ];

  const onDig = useCallback((at?: { x: number; y: number }) => {
    dig();
    sceneRef.current?.dig(at);
    setTaught((was) => {
      if (was) return was;
      markSeen(TAUGHT_KEY);
      return true;
    });
    const id = popId.current++;
    setPops((p) => [...p.slice(-6), { id, text: `+${format(solo.clickYield(farm))}` }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 700);
  }, [dig, farm]);

  useSpaceToDig(onDig, report === null && sheet === null && omen !== "showing");

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

      <FarmScene ref={sceneRef} farm={farm} hoard={budget} onDig={onDig}>
        {/* The whole scene digs, which is not something a farm looks like it
            does. One sentence, once, and then never again. */}
        {!taught && <p className="tap-hint">Tap the farm to dig</p>}
      </FarmScene>

      {/* The button is no longer the way you dig — the scene is. What's left is
          the label that says so and the number that says how hard, which is the
          part worth keeping around. */}
      <div className="digbar">
        <button className="dig" onClick={() => onDig()}>
          <PxIcon name="potato" size={16} />
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
        {nav.map((item) => (
          <button
            key={item.id}
            className={item.id === "weather" && needsAttention ? "alert" : undefined}
            onClick={() => setSheet(item.id)}
          >
            <PxIcon name={item.icon} size={20} />
            <span>{item.label}</span>
            {item.id === "weather" && needsAttention && <span className="nav-dot" />}
          </button>
        ))}
      </nav>

      {sheet === "shop" && (
        <Sheet
          title="Shop"
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
      {/* Damage, defence and the log of what caused it are one subject, and
          splitting them across two tabs meant reading the report in one place
          and paying for it in another. */}
      {sheet === "weather" && (
        <Sheet
          title="Weather"
          sub="What it broke, what it costs, and what stops it next time."
          onClose={() => setSheet(null)}
          foot={
            <>
              <span className="muted">To spend</span>
              <strong>{format(budget)}</strong>
            </>
          }
        >
          <LandPanel farm={farm} budget={budget} dispatch={dispatch} />
          <h3 className="sheet-section">Field report</h3>
          <FarmFeed farm={farm} now={now} />
        </Sheet>
      )}
      {sheet === "seeds" && (
        <Sheet
          title="Seeds"
          sub="Hand the farm down, or spend what the last one left you."
          onClose={() => setSheet(null)}
        >
          <LegacyPanel farm={farm} dispatch={dispatch} />
        </Sheet>
      )}
      {sheet === "books" && (
        <Sheet
          title="The books"
          sub={`Generation ${farm.generation}`}
          onClose={() => setSheet(null)}
        >
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
          {/* The side doors used to hold a sixth of the bottom bar for a
              parked prototype and three dev buttons. They live at the back of
              the ledger now, which is about what they're worth. */}
          <h3 className="sheet-section">Side doors</h3>
          <BackRoom
            onVersus={() => onGo({ kind: "versus-lobby" })}
            onTitle={() => onGo({ kind: "home" })}
            dispatch={dispatch}
          />
        </Sheet>
      )}

      {report && <AwayReport report={report} onDismiss={dismissReport} />}

      {/* The first Tuber Singularity, and the only time the game takes the
          screen off you. Everything goes out, one sentence and one instruction
          arrive in the dark, and the farm fades back up underneath them.
          Deliberately says nothing about what's coming — the punchline has to
          land on a button the player chose to press, not on a label that gave it
          away. It eats taps for its four seconds, which is the point. */}
      {omen === "showing" && (
        <div className="omen-veil" role="presentation">
          <p className="omen-line">The horizon isn't where you left it</p>
          <p className="omen-call">Keep going</p>
        </div>
      )}
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
