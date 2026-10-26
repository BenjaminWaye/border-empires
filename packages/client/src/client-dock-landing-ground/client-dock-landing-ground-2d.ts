import { resolveMyReachCached } from "../client-reach-authoritative/client-reach-authoritative.js";
import { drawSlipways2D } from "../client-harbour-slipways/client-harbour-slipways-2d.js";
import { drawFrontierSupplyForState2D, type FrontierSupply2DDeps } from "../client-frontier-supply/client-frontier-supply-2d.js";
import type { FrontierSupplyState } from "../client-frontier-supply/client-frontier-supply-state.js";
import { landingAshoreDirection, landingGroundKeysForSelection, type DockLandingState } from "./client-dock-landing-ground.js";
import { hostileLandingGroundKeys, type HostileLandingState } from "./client-dock-landing-ground-threat.js";
import {
  HOSTILE_LANDING_BORDER_ALPHA,
  HOSTILE_LANDING_COLOR,
  HOSTILE_LANDING_FILL_ALPHA,
  LANDING_GROUND_BORDER_ALPHA,
  LANDING_GROUND_COLOR,
  LANDING_GROUND_FILL_ALPHA
} from "./client-dock-landing-ground-style.js";

type LandingTileLook = { color: string; fillAlpha: number; borderAlpha: number };
type LandingDrawDeps = Pick<FrontierSupply2DDeps, "tileCenter" | "size" | "viewportWidth" | "viewportHeight">;

const WATER_SIDES: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
// How far the waterline glow reaches out to sea, in tiles (matches the true-3D marker layer).
const WATERLINE_REACH = 0.42;

const isWaterTile = (tiles: DockLandingState["tiles"], x: number, y: number): boolean => {
  const terrain = tiles.get(`${x},${y}`)?.terrain;
  return terrain === "SEA" || terrain === "COASTAL_SEA";
};

// A glow band fading out to sea off each water side, then a chevron pointing
// ashore: the same landing cue the true-3D marker layer draws
// (dock-landing-marker-layer.ts), static here.
const drawLandingCue2D = (
  ctx: CanvasRenderingContext2D,
  tiles: DockLandingState["tiles"],
  x: number,
  y: number,
  sx: number,
  sy: number,
  look: LandingTileLook,
  size: number
): void => {
  const half = size / 2;
  for (const [ox, oy] of WATER_SIDES) {
    if (!isWaterTile(tiles, x + ox, y + oy)) continue;
    const edgeX = sx + ox * half;
    const edgeY = sy + oy * half;
    const reach = size * WATERLINE_REACH;
    const gradient = ctx.createLinearGradient(edgeX, edgeY, edgeX + ox * reach, edgeY + oy * reach);
    gradient.addColorStop(0, look.color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = look.borderAlpha;
    ctx.fillStyle = gradient;
    if (ox === 0) ctx.fillRect(sx - half, Math.min(edgeY, edgeY + oy * reach), size, reach);
    else ctx.fillRect(Math.min(edgeX, edgeX + ox * reach), sy - half, reach, size);
  }
  const ashore = landingAshoreDirection(tiles, x, y);
  const across = { x: -ashore.dy, y: ashore.dx };
  const tipX = sx + ashore.dx * size * 0.16;
  const tipY = sy + ashore.dy * size * 0.16;
  const armX = sx - ashore.dx * size * 0.08;
  const armY = sy - ashore.dy * size * 0.08;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = look.color;
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(1.5, size * 0.09);
  ctx.beginPath();
  ctx.moveTo(armX + across.x * size * 0.26, armY + across.y * size * 0.26);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(armX - across.x * size * 0.26, armY - across.y * size * 0.26);
  ctx.stroke();
};

const drawLandingTiles2D = (
  ctx: CanvasRenderingContext2D,
  tiles: DockLandingState["tiles"],
  keys: ReadonlySet<string>,
  look: LandingTileLook,
  deps: LandingDrawDeps
): void => {
  if (keys.size === 0) return;
  const size = deps.size;
  ctx.save();
  for (const key of keys) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const { sx, sy } = deps.tileCenter(x, y);
    if (sx < -size || sy < -size || sx > deps.viewportWidth + size || sy > deps.viewportHeight + size) continue;
    const left = sx - size / 2;
    const top = sy - size / 2;
    ctx.fillStyle = look.color;
    ctx.strokeStyle = look.color;
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.setLineDash([Math.max(2, size * 0.18), Math.max(2, size * 0.12)]);
    ctx.globalAlpha = look.fillAlpha;
    ctx.fillRect(left, top, size, size);
    ctx.globalAlpha = look.borderAlpha;
    const inset = ctx.lineWidth;
    ctx.strokeRect(left + inset, top + inset, size - inset * 2, size - inset * 2);
    drawLandingCue2D(ctx, tiles, x, y, sx, sy, look, size);
  }
  ctx.restore();
};

/**
 * 2D canvas landing-ground highlight (the true-3D counterpart is
 * client-map-3d-dock-landing-overlay.ts; both read
 * landingGroundKeysForSelection): selecting a dock tints the ground its sea
 * lanes can land on, at both ends, with a dashed edge per tile, a glow off
 * its water side and a chevron pointing ashore.
 */
export const drawLandingGround2D = (
  ctx: CanvasRenderingContext2D,
  state: DockLandingState & { readonly selected: { x: number; y: number } | undefined },
  deps: LandingDrawDeps
): void =>
  drawLandingTiles2D(ctx, state.tiles, landingGroundKeysForSelection(state), {
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
  drawLandingTiles2D(ctx, state.tiles, hostileLandingGroundKeys(state, reach, nowEpochMs), {
    color: HOSTILE_LANDING_COLOR,
    fillAlpha: HOSTILE_LANDING_FILL_ALPHA,
    borderAlpha: HOSTILE_LANDING_BORDER_ALPHA
  }, deps);

/**
 * The 2D map's maritime pass, after the tile loop: the harbours' landing
 * slipways, hostile landing ground, the selection's landing ground, then the
 * frontier supply lines.
 */
export const drawLandingGroundAndSupply2D = (
  ctx: CanvasRenderingContext2D,
  state: FrontierSupplyState & HostileLandingState & { readonly selected: { x: number; y: number } | undefined },
  deps: FrontierSupply2DDeps & { readonly tileVisible: (x: number, y: number) => boolean }
): void => {
  drawSlipways2D(ctx, state, deps);
  drawHostileLandingGround2D(ctx, state, resolveMyReachCached(state), Date.now(), deps);
  drawLandingGround2D(ctx, state, deps);
  drawFrontierSupplyForState2D(ctx, state, deps);
};
