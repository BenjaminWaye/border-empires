import type { Tile } from "../client-types.js";
import {
  drawCenteredOverlayRotatedWithAlpha,
  drawCenteredOverlayWithAlpha
} from "../client-map-render/client-map-render-centered-overlay.js";
import {
  fortificationOverlayAlphaForTile,
  siegeBatteryFacingRadiansForTile,
  type FortificationOverlayDeps,
  type FortificationOverlayKind
} from "./client-fortification-overlays.js";

// Split out of client-runtime-loop.ts (already over the repo's 500-line
// file-growth cap): the 2D-canvas draw for a fortification overlay tile.
// Every kind gets a plain centered draw except SIEGE_OUTPOST/Siege Battery,
// which aims itself at the nearest known rival tile (see
// siegeBatteryFacingRadiansForTile) -- the 2D counterpart to the 3D
// renderer's facingRad on the siege machine overlay.
export const drawFortificationOverlay2D = (
  ctx: CanvasRenderingContext2D,
  tile: Tile,
  kind: FortificationOverlayKind,
  overlay: HTMLImageElement | undefined,
  px: number,
  py: number,
  size: number,
  facingDeps: FortificationOverlayDeps
): void => {
  if (!overlay || !overlay.complete || !overlay.naturalWidth) return;
  const alpha = fortificationOverlayAlphaForTile(tile);
  if (kind === "SIEGE_OUTPOST") {
    const facingRad = siegeBatteryFacingRadiansForTile(tile, facingDeps);
    // Canvas rotate() is visually clockwise for +angle in this y-down screen
    // space, the opposite handedness from the 3D renderer's Y-axis rotation
    // -- negate so both renderers turn to face the same screen direction.
    drawCenteredOverlayRotatedWithAlpha(ctx, overlay, px, py, size, -facingRad, 1, alpha);
    return;
  }
  drawCenteredOverlayWithAlpha(ctx, overlay, px, py, size, 1, alpha);
};
