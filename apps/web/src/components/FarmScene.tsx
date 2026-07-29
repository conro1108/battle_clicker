import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { solo, type Potatoes } from "@battle/sim";

import { producerMark } from "../marks.js";
import { EMPTY_VIEW, FarmScene as Scene, type FarmView } from "../render/farmScene.js";

export interface FarmSceneHandle {
  /** Fling a potato onto the pile. Called on every dig. */
  dig(): void;
}

/** The canvas and its rAF loop. React only ever hands it a view. */
const SceneCanvas = forwardRef<FarmSceneHandle, {
  view: FarmView;
  onPointerDown?: PointerEventHandler<HTMLCanvasElement>;
}>(function SceneCanvas({ view, onPointerDown }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new Scene(canvas);
    sceneRef.current = scene;
    scene.update(view);
    scene.start();
    return () => {
      scene.stop();
      sceneRef.current = null;
    };
    // Mount-only on purpose: the view is pushed by the effect below, and
    // re-creating the scene on every tick would restart its clock and reset
    // every animation on it.
  }, []);

  useEffect(() => {
    sceneRef.current?.update(view);
  }, [view]);

  useImperativeHandle(ref, () => ({ dig: () => sceneRef.current?.dig() }), []);

  return <canvas ref={canvasRef} className="scene" onPointerDown={onPointerDown} />;
});

/**
 * The farm, on a canvas.
 *
 * The whole surface digs. That's deliberate — the thing you're looking at and
 * the thing you're tapping should be the same thing — and the dig bar below it
 * is the discoverable version of the same verb.
 */
export const FarmScene = forwardRef<FarmSceneHandle, {
  farm: solo.FarmState;
  hoard: Potatoes;
  onDig: () => void;
  /** Anything that belongs over the farm rather than beside it. */
  children?: ReactNode;
}>(function FarmScene({ farm, hoard, onDig, children }, ref) {
  const view = useMemo<FarmView>(() => {
    const working: FarmView["working"] = {};
    const broken: FarmView["broken"] = {};
    const marks: FarmView["marks"] = {};
    for (const prod of solo.SOLO_PRODUCERS) {
      const owned = farm.producers[prod.id] ?? 0;
      const dead = solo.brokenCount(farm, prod.id);
      if (owned - dead > 0) working[prod.id] = owned - dead;
      if (dead > 0) broken[prod.id] = dead;
      const level = producerMark(farm, prod.id);
      if (level > 0) marks[prod.id] = level;
    }
    return { ...EMPTY_VIEW, working, broken, marks, soil: farm.soil, hoard, seed: farm.seed };
  }, [farm, hoard]);

  return (
    <div className="stage">
      <SceneCanvas
        ref={ref}
        view={view}
        onPointerDown={(e) => {
          e.preventDefault();
          onDig();
        }}
      />
      {children}
    </div>
  );
});

/** A farm nobody owns, running on the title screen so it isn't a blank page. */
const DEMO_VIEW: FarmView = {
  ...EMPTY_VIEW,
  working: { plot: 9, hand: 2, irrigation: 1, tractor: 1 },
  hoard: 400,
  seed: "title",
};

export function TitleScene() {
  return (
    <div className="title-scene">
      <SceneCanvas view={DEMO_VIEW} />
    </div>
  );
}
