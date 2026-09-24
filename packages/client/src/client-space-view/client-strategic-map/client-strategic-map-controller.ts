// Mounts the 2D strategic map (design doc §22) as an overlay canvas on top of
// the 3D Space View canvas. Zooming the 3D camera out past the wide view
// reveals it; clicking a system flies the 3D camera in on that system and
// hides it again. The map is flat, so it doubles as the 2D accessibility path
// for devices that can't run the 3D scene.
import type { SpacePlanetViewModel } from "../client-space-view-state.js";
import { drawStrategicMap, type StrategicMapModel } from "./client-strategic-map-renderer.js";
import {
  buildStarlanes,
  buildStrategicNodes,
  computeTerritoryPatches,
  fitTransform,
  pickNodeAt
} from "./client-strategic-map-layout.js";

export type StrategicMapControllerDeps = {
  screen: HTMLElement;
  // Called with a seasonId when a system is clicked; the caller flies the 3D
  // camera in on it. The controller hides itself first.
  onSelectSystem: (seasonId: string) => void;
  // Called when the map closes because the player zoomed back in.
  onClose: () => void;
  // Fires whenever the map appears or disappears, so the chrome button can relabel.
  onVisibleChange?: (visible: boolean) => void;
};

export type StrategicMapController = {
  setPlanets: (models: ReadonlyArray<SpacePlanetViewModel>) => void;
  // Marks systems the player's Probes are orbiting (§26.7).
  setOrbiting: (seasonIds: ReadonlySet<string>) => void;
  show: () => void;
  hide: () => void;
  isVisible: () => boolean;
  resize: () => void;
  dispose: () => void;
};

export const buildStrategicMapModel = (
  models: ReadonlyArray<SpacePlanetViewModel>,
  orbiting: ReadonlySet<string> = new Set()
): StrategicMapModel => {
  const nodes = buildStrategicNodes(models);
  const lanes = buildStarlanes(nodes);
  return { nodes, lanes, patches: computeTerritoryPatches(nodes, lanes), orbiting };
};

export const createStrategicMapController = (deps: StrategicMapControllerDeps): StrategicMapController => {
  const canvas = document.createElement("canvas");
  canvas.className = "sv-strategic-canvas";
  canvas.dataset.spaceViewStrategicCanvas = "";
  canvas.hidden = true;
  deps.screen.appendChild(canvas);

  // A second way out that lives on the map itself, so it is never scrolled
  // off a narrow top bar.
  const exitButton = document.createElement("button");
  exitButton.type = "button";
  exitButton.className = "sv-btn sv-strategic-exit";
  exitButton.dataset.spaceViewStrategicExit = "";
  exitButton.textContent = "🌌 Galaxy View";
  exitButton.hidden = true;
  deps.screen.appendChild(exitButton);

  let orbiting: ReadonlySet<string> = new Set();
  let model: StrategicMapModel = buildStrategicMapModel([]);
  let frame = 0;
  let visible = false;
  let width = 1;
  let height = 1;

  const resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, deps.screen.clientWidth);
    height = Math.max(1, deps.screen.clientHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const render = (): void => {
    if (!visible) return;
    const ctx = canvas.getContext("2d");
    if (ctx) drawStrategicMap(ctx, model, width, height, Date.now());
    frame = requestAnimationFrame(render);
  };

  const hide = (): void => {
    if (!visible) return;
    visible = false;
    canvas.hidden = true;
    exitButton.hidden = true;
    cancelAnimationFrame(frame);
    deps.onVisibleChange?.(false);
  };

  const show = (): void => {
    if (visible) return;
    visible = true;
    canvas.hidden = false;
    exitButton.hidden = false;
    resize();
    frame = requestAnimationFrame(render);
    deps.onVisibleChange?.(true);
  };

  const pointerPick = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const { toScreen } = fitTransform(width, height);
    return pickNodeAt(model.nodes, toScreen, event.clientX - rect.left, event.clientY - rect.top);
  };

  const onPointerUp = (event: PointerEvent): void => {
    const node = pointerPick(event);
    if (!node) return;
    hide();
    deps.onSelectSystem(node.model.seasonId);
  };
  // Zooming in with the wheel (or pinch) leaves the strategic view.
  const onWheel = (event: WheelEvent): void => {
    if (event.deltaY >= 0) return;
    event.preventDefault();
    hide();
    deps.onClose();
  };
  const onExit = (): void => {
    hide();
    deps.onClose();
  };
  exitButton.addEventListener("click", onExit);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return {
    setPlanets: (models) => {
      model = buildStrategicMapModel(models, orbiting);
    },
    setOrbiting: (seasonIds) => {
      orbiting = seasonIds;
      model = { ...model, orbiting };
    },
    show,
    hide,
    isVisible: () => visible,
    resize: () => {
      if (visible) resize();
    },
    dispose: () => {
      hide();
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      exitButton.removeEventListener("click", onExit);
      exitButton.remove();
      canvas.remove();
    }
  };
};
