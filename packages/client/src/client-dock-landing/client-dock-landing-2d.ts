import { resolveMyReachCached } from "../client-reach-authoritative/client-reach-authoritative.js";
import { drawFrontierSupplyForState2D, type FrontierSupply2DDeps } from "../client-frontier-supply/client-frontier-supply-2d.js";
import type { FrontierSupplyState } from "../client-frontier-supply/client-frontier-supply-state.js";
import { landingGroundKeysForSelection, type DockLandingState } from "./client-dock-landing.js";
import { hostileLandingGroundKeys, type HostileLandingState } from "./client-dock-landing-threat.js";
import {
  HOSTILE_LANDING_BORDER_ALPHA,
  HOSTILE_LANDING_COLOR,
  HOSTILE_LANDING_FILL_ALPHA,
  LANDING_GROUND_BORDER_ALPHA,
  LANDING_GROUND_COLOR,
  LANDING_GROUND_FILL_ALPHA
} from "./client-dock-landing-style.js";

type LandingTileLook = { color: string; fillAlpha: number; borderAlpha: number };
type LandingDrawDeps = Pick<FrontierSupply2DDeps, "tileCenter" | "size" | "viewportWidth" | "viewportHeight">;

const drawLandingTiles2D = (ctx: CanvasRenderingContext2D, keys: ReadonlySet<string>, look: LandingTileLook, deps: LandingDrawDeps): void => {
  if (keys.size === 0) return;
  const size = deps.size;
  ctx.save();
  ctx.fillStyle = look.color;
  ctx.strokeStyle = look.color;
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.setLineDash([Math.max(2, size * 0.18), Math.max(2, size * 0.12)]);
  for (const key of keys) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const { sx, sy } = deps.tileCenter(x, y);
    if (sx < -size || sy < -size || sx > deps.viewportWidth + size || sy > deps.viewportHeight + size) continue;
    const left = sx - size / 2;
    const top = sy - size / 2;
    ctx.globalAlpha = look.fillAlpha;
    ctx.fillRect(left, top, size, size);
    ctx.globalAlpha = look.borderAlpha;
    const inset = ctx.lineWidth;
    ctx.strokeRect(left + inset, top + inset, size - inset * 2, size - inset * 2);
  }
  ctx.restore();
};

/**
 * 2D canvas landing-ground highlight (the true-3D counterpart is
 * client-map-3d-dock-landing-overlay.ts; both read
 * landingGroundKeysForSelection): selecting a dock tints the ground its sea
 * lanes can land on, at both ends, with a dashed edge per tile.
 */
export const drawLandingGround2D = (
  ctx: CanvasRenderingContext2D,
  state: DockLandingState & { readonly selected: { x: number; y: number } | undefined },
  deps: LandingDrawDeps
): void =>
  drawLandingTiles2D(ctx, landingGroundKeysForSelection(state), {
    color: LANDING_GROUND_COLOR,
    fillAlpha: LANDING_GROUND_FILL_ALPHA,
    borderAlpha: LANDING_GROUND_BORDER_ALPHA
  }, deps);

/** Always-on: the viewer's coast where a hostile dock's crossings can land (hostileLandingGroundKeys). */
export const drawHostileLandingGround2D = (
  ctx: CanvasRenderingContext2D,
  state: HostileLandingState,
  reach: ReadonlySet<string>,
  nowEpochMs: number,
  deps: LandingDrawDeps
): void =>
  drawLandingTiles2D(ctx, hostileLandingGroundKeys(state, reach, nowEpochMs), {
    color: HOSTILE_LANDING_COLOR,
    fillAlpha: HOSTILE_LANDING_FILL_ALPHA,
    borderAlpha: HOSTILE_LANDING_BORDER_ALPHA
  }, deps);

/** The 2D map's maritime pass, after the tile loop: hostile landing ground, the selection's landing ground, then the frontier supply lines. */
export const drawLandingGroundAndSupply2D = (
  ctx: CanvasRenderingContext2D,
  state: FrontierSupplyState & HostileLandingState & { readonly selected: { x: number; y: number } | undefined },
  deps: FrontierSupply2DDeps
): void => {
  drawHostileLandingGround2D(ctx, state, resolveMyReachCached(state), Date.now(), deps);
  drawLandingGround2D(ctx, state, deps);
  drawFrontierSupplyForState2D(ctx, state, deps);
};
