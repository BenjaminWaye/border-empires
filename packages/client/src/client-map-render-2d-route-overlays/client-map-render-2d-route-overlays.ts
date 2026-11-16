import { WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import { drawArrowGesture2D } from "../client-map-render-2d-combat-overlays.js";
import { drawScoutDrone2D } from "../client-map-render-2d-scout-drone/client-map-render-2d-scout-drone.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import type { ClientState } from "../client-state/client-state.js";

// The 2D canvas's route overlays, drawn once per frame after the tile pass
// (client-runtime-loop.ts): the March To arrow (F4, parity with the 3D arrow
// overlay F1/F2) and the scout drone in flight (docs/explore-scout-plan.md,
// parity with client-map-3d-scout-drone/). True-3D draws its own.
export const drawRouteOverlays2D = (
  ctx: CanvasRenderingContext2D,
  state: Pick<ClientState, "arrowGesture" | "scoutDroneFlight" | "me" | "allies" | "tiles">,
  tileCenterOnScreen: (wx: number, wy: number) => { sx: number; sy: number },
  size: number,
  nowMs: number
): void => {
  if (isTrue3DRendererActive()) return;
  if (state.arrowGesture) drawArrowGesture2D(ctx, state.arrowGesture, tileCenterOnScreen, size);
  drawScoutDrone2D(ctx, state.scoutDroneFlight, nowMs, { width: WORLD_WIDTH, height: WORLD_HEIGHT }, tileCenterOnScreen, size, state);
};
