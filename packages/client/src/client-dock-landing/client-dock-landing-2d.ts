import { drawFrontierSupplyForState2D, type FrontierSupply2DDeps } from "../client-frontier-supply/client-frontier-supply-2d.js";
import type { FrontierSupplyState } from "../client-frontier-supply/client-frontier-supply-state.js";
import { landingGroundKeysForSelection, type DockLandingState } from "./client-dock-landing.js";
import { LANDING_GROUND_BORDER_ALPHA, LANDING_GROUND_COLOR, LANDING_GROUND_FILL_ALPHA } from "./client-dock-landing-style.js";

/**
 * 2D canvas landing-ground highlight (the true-3D counterpart is
 * client-map-3d-dock-landing-overlay.ts; both read
 * landingGroundKeysForSelection): selecting a dock tints the ground its sea
 * lanes can land on, at both ends, with a dashed edge per tile.
 */
export const drawLandingGround2D = (
  ctx: CanvasRenderingContext2D,
  state: DockLandingState & { readonly selected: { x: number; y: number } | undefined },
  deps: Pick<FrontierSupply2DDeps, "tileCenter" | "size" | "viewportWidth" | "viewportHeight">
): void => {
  const keys = landingGroundKeysForSelection(state);
  if (keys.size === 0) return;
  const size = deps.size;
  ctx.save();
  ctx.fillStyle = LANDING_GROUND_COLOR;
  ctx.strokeStyle = LANDING_GROUND_COLOR;
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.setLineDash([Math.max(2, size * 0.18), Math.max(2, size * 0.12)]);
  for (const key of keys) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const { sx, sy } = deps.tileCenter(x, y);
    if (sx < -size || sy < -size || sx > deps.viewportWidth + size || sy > deps.viewportHeight + size) continue;
    const left = sx - size / 2;
    const top = sy - size / 2;
    ctx.globalAlpha = LANDING_GROUND_FILL_ALPHA;
    ctx.fillRect(left, top, size, size);
    ctx.globalAlpha = LANDING_GROUND_BORDER_ALPHA;
    const inset = ctx.lineWidth;
    ctx.strokeRect(left + inset, top + inset, size - inset * 2, size - inset * 2);
  }
  ctx.restore();
};

/** The 2D map's maritime pass, after the tile loop: landing ground under the frontier supply lines. */
export const drawLandingGroundAndSupply2D = (
  ctx: CanvasRenderingContext2D,
  state: FrontierSupplyState & { readonly selected: { x: number; y: number } | undefined },
  deps: FrontierSupply2DDeps
): void => {
  drawLandingGround2D(ctx, state, deps);
  drawFrontierSupplyForState2D(ctx, state, deps);
};
