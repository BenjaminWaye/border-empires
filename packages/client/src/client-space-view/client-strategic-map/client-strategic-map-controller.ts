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
  DEFAULT_MAP_VIEW,
  fitTransform,
  pickNodeAt,
  type MapView
} from "./client-strategic-map-layout.js";
import { DRAG_THRESHOLD_PX, clampView, zoomAbout } from "./client-strategic-map-gestures.js";

export type StrategicMapControllerDeps = {
  screen: HTMLElement;
  // Called with a seasonId when a system is clicked; the caller flies the 3D
  // camera in on it. The controller hides itself first.
  onSelectSystem: (seasonId: string) => void;
  // Called when the Court landmark at the centre is pressed.
  onSelectCourt?: () => void;
  // Called when the map closes through its Galaxy View button.
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
  // Recentres and zooms on the Court landmark at the middle of the map.
  focusCore: () => void;
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
  let view: MapView = DEFAULT_MAP_VIEW;

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
    if (ctx) drawStrategicMap(ctx, model, width, height, Date.now(), view);
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
    view = DEFAULT_MAP_VIEW;
    canvas.hidden = false;
    exitButton.hidden = false;
    resize();
    frame = requestAnimationFrame(render);
    deps.onVisibleChange?.(true);
  };

  const fitScale = (): number => fitTransform(width, height).scale;

  const pick = (x: number, y: number) => pickNodeAt(model.nodes, fitTransform(width, height, 28, view).toScreen, x, y);
  const coreHit = (x: number, y: number): boolean => {
    const c = fitTransform(width, height, 28, view).toScreen({ x: 0, y: 0 });
    return Math.hypot(c.x - x, c.y - y) <= 22;
  };

  // Drag to pan, wheel or pinch to zoom; a press that barely moves is a click.
  const pointers = new Map<number, { x: number; y: number }>();
  let dragged = 0;
  let pinchDistance = 0;
  const local = (event: PointerEvent | WheelEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const onPointerDown = (event: PointerEvent): void => {
    pointers.set(event.pointerId, local(event));
    dragged = 0;
    pinchDistance = 0;
    canvas.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent): void => {
    const before = pointers.get(event.pointerId);
    if (!before) return;
    const now = local(event);
    pointers.set(event.pointerId, now);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (pinchDistance > 0) view = zoomAbout(view, distance / pinchDistance, (a!.x + b!.x) / 2, (a!.y + b!.y) / 2, width, height, fitScale());
      pinchDistance = distance;
      dragged = DRAG_THRESHOLD_PX + 1;
      return;
    }
    dragged += Math.hypot(now.x - before.x, now.y - before.y);
    if (dragged > DRAG_THRESHOLD_PX) view = clampView({ ...view, panX: view.panX + now.x - before.x, panY: view.panY + now.y - before.y }, fitScale());
  };
  const onPointerUp = (event: PointerEvent): void => {
    const start = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    canvas.releasePointerCapture?.(event.pointerId);
    if (!start || dragged > DRAG_THRESHOLD_PX) return;
    const node = pick(start.x, start.y);
    if (node) {
      hide();
      deps.onSelectSystem(node.model.seasonId);
    } else if (coreHit(start.x, start.y)) deps.onSelectCourt?.();
  };
  const onPointerCancel = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const at = local(event);
    view = zoomAbout(view, event.deltaY < 0 ? 1.15 : 1 / 1.15, at.x, at.y, width, height, fitScale());
  };
  const onExit = (): void => {
    hide();
    deps.onClose();
  };
  exitButton.addEventListener("click", onExit);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
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
    focusCore: () => {
      view = clampView({ zoom: 2.2, panX: 0, panY: 0 }, fitScale());
    },
    isVisible: () => visible,
    resize: () => {
      if (visible) resize();
    },
    dispose: () => {
      hide();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("wheel", onWheel);
      exitButton.removeEventListener("click", onExit);
      exitButton.remove();
      canvas.remove();
    }
  };
};
