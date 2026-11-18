import type { ClientState } from "../client-state/client-state.js";
import { MIN_ZOOM } from "../client-constants.js";
import { clampedTileHalfExtents, resolveTileBudget } from "../client-map-3d-tile-budget/client-map-3d-tile-budget.js";
import { tickAfcJoinDropForFrame } from "../client-afc-join-drop/client-afc-join-drop-frame.js";
import type { GuideTileProjector } from "../client-tutorial-guide/tutorial-guide-placement.js";
import { tickOnboardingUiGateForFrame } from "./client-onboarding-ui-overlays.js";

/** The map canvas and the runtime loop's world-to-canvas projection (renderer-aware: true-3D when active, else 2D). */
export type JoinExperienceMap = {
  readonly canvas: HTMLCanvasElement;
  readonly worldToScreen: (wx: number, wy: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
};

/**
 * Tile -> CSS pixels for the tutorial guide's placement. Uses the 2D frame's
 * tile size and half extents exactly as client-runtime-loop.ts computes them
 * (the 3D projection ignores them), then scales canvas pixels to CSS pixels.
 */
export const guideTileProjectorFor = (map: JoinExperienceMap, zoom: number): GuideTileProjector => (x, y) => {
  const { canvas } = map;
  if (canvas.width === 0 || canvas.height === 0) return undefined;
  const { halfW, halfH } = clampedTileHalfExtents(Math.floor(canvas.width / zoom / 2), Math.floor(canvas.height / zoom / 2), resolveTileBudget(MIN_ZOOM));
  const { sx, sy } = map.worldToScreen(x, y, zoom, halfW, halfH);
  const rect = canvas.getBoundingClientRect();
  return { x: rect.left + (sx * rect.width) / canvas.width, y: rect.top + (sy * rect.height) / canvas.height };
};

/** Once-per-frame join sequence for the runtime loop: advance the AFC join drop, then show/hide the onboarding corner UI that waits on it. */
export const tickJoinExperienceForFrame = (
  state: ClientState,
  nowMs: number,
  viewport: { readonly canvasWidth: number; readonly canvasHeight: number; readonly tilePx: number },
  keyFor: (x: number, y: number) => string,
  renderHud: () => void,
  map?: JoinExperienceMap
): void => {
  tickAfcJoinDropForFrame(state, nowMs, viewport, keyFor);
  tickOnboardingUiGateForFrame(state, renderHud, map ? guideTileProjectorFor(map, state.zoom) : undefined);
};
