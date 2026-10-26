// Close-up camera for the new HUD's detail screens (town, battle): glide in on
// the tile when the screen opens and back to where you were when it closes.
// Both renderers read the same camX/camY/zoom state every frame, so setting it
// here covers 2D and 3D alike.

import { MAX_ZOOM, MIN_ZOOM } from "../client-constants.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";

/** Pixels per tile: town shows its whole support ring, battle frames the two tiles. */
export const TOWN_ZOOM = 72;
export const BATTLE_ZOOM = 84;
const GLIDE_MS = 320;

type CameraDeps = Pick<HudV2Deps, "state" | "wrapX" | "wrapY" | "requestViewRefresh">;
type Saved = { zoom: number; camX: number; camY: number; camSubX: number; camSubY: number };

let saved: Saved | undefined;
let frame: number | undefined;

const ease = (t: number): number => 1 - (1 - t) ** 3;

export const clampZoom = (zoom: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom)));

const glideZoom = (deps: CameraDeps, to: number): void => {
  if (frame !== undefined) cancelAnimationFrame(frame);
  const from = deps.state.zoom;
  const target = clampZoom(to);
  if (from === target || typeof requestAnimationFrame === "undefined") {
    deps.state.zoom = target;
    deps.requestViewRefresh();
    return;
  }
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / GLIDE_MS);
    deps.state.zoom = Math.round(from + (target - from) * ease(t));
    if (t < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    frame = undefined;
    deps.requestViewRefresh();
  };
  frame = requestAnimationFrame(step);
};

/** Centres on (x, y) and zooms in, remembering the view to return to (only the first call of a visit). */
export const closeUpOn = (deps: CameraDeps, x: number, y: number, zoom: number): void => {
  const { state } = deps;
  saved ??= { zoom: state.zoom, camX: state.camX, camY: state.camY, camSubX: state.camSubX, camSubY: state.camSubY };
  state.camX = deps.wrapX(x);
  state.camY = deps.wrapY(y);
  state.camSubX = 0;
  state.camSubY = 0;
  // Never zoom out to reach the close-up level: someone already zoomed in further keeps their view.
  glideZoom(deps, Math.max(state.zoom, zoom));
};

/** Returns to the view from before the close-up; `keepPosition` stays where the camera is now (e.g. after "Show tile"). */
export const endCloseUp = (deps: CameraDeps, keepPosition = false): void => {
  if (!saved) return;
  const back = saved;
  saved = undefined;
  if (!keepPosition) {
    deps.state.camX = back.camX;
    deps.state.camY = back.camY;
    deps.state.camSubX = back.camSubX;
    deps.state.camSubY = back.camSubY;
  }
  glideZoom(deps, back.zoom);
};

export const isCloseUp = (): boolean => saved !== undefined;
