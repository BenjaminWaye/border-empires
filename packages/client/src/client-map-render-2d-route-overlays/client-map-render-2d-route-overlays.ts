import { WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import { drawArrowGesture2D } from "../client-map-render-2d-combat-overlays.js";
import { drawScoutDrone2D } from "../client-map-render-2d-scout-drone/client-map-render-2d-scout-drone.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { drawMusterCaptureLabels2D } from "../client-muster-capture/client-map-2d-muster-capture-labels.js";
import type { ClientState } from "../client-state/client-state.js";
import { drawScoutRange2D } from "../client-map-render-2d-scout-range/client-map-render-2d-scout-range.js";
import type { ScoutPlanState } from "../client-scout-drone/client-scout-drone-plan.js";
import { drawSalvageDeliveries2D } from "../client-salvage-delivery-fx/client-map-2d-salvage-delivery.js";

// The 2D canvas's route overlays, drawn once per frame after the tile pass
// (client-runtime-loop.ts): the March To arrow (F4, parity with the 3D arrow
// overlay F1/F2) and the scout drone in flight (docs/explore-scout-plan.md,
// parity with client-map-3d-scout-drone/), and the "+N / −N manpower" label
// over a captured muster flag (client-muster-capture/), and the Court's salvage
// delivery dropship and its Ancillaries (client-salvage-delivery-fx/), which
// span several tiles. True-3D draws its own.
export const drawRouteOverlays2D = (
  ctx: CanvasRenderingContext2D,
  state: Pick<ClientState, "arrowGesture" | "scoutDroneFlight" | "me" | "allies" | "tiles" | "musterCaptureLabels" | "musterCaptureLabelSeq" | "salvageDeliveryFxByKey"> & ScoutPlanState,
  tileCenterOnScreen: (wx: number, wy: number) => { sx: number; sy: number },
  size: number,
  nowMs: number
): void => {
  if (isTrue3DRendererActive()) return;
  if (state.arrowGesture) drawArrowGesture2D(ctx, state.arrowGesture, tileCenterOnScreen, size);
  // While planning, the dotted ring where the next leg reaches its range limit (parity with the true-3D beads).
  drawScoutRange2D(ctx, state, tileCenterOnScreen, size, nowMs);
  drawScoutDrone2D(ctx, state.scoutDroneFlight, nowMs, { width: WORLD_WIDTH, height: WORLD_HEIGHT }, tileCenterOnScreen, size, state);
  drawMusterCaptureLabels2D(ctx, state, tileCenterOnScreen, size, nowMs);
  // nowMs is Date.now() here (client-runtime-loop.ts), the deliveries' clock too.
  drawSalvageDeliveries2D(ctx, state, tileCenterOnScreen, size, nowMs);
};
