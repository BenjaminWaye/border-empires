// 2D canvas: the live (visible-tile) ownership tint, extracted from
// client-runtime-loop.ts. After the tint it redraws the tile's river bank
// and water, so territory colour stops at the bank instead of covering the
// river at 0.92 opacity (docs/rivers-remake-plan.md, Phase 1a option A).
import type { Tile } from "../client-types.js";
import { terrainReliefPx, useTerrainReliefRenderer } from "./client-map-render-terrain-relief.js";
import { drawRiverEdges } from "./client-map-render-river-edges.js";

const SETTLED_ALPHA = 0.92;
const FRONTIER_ALPHA = 0.2;
const BREACH_SHOCK_MAX_ALPHA = 0.62;
const FRONTIER_DECAY_BLINK_WINDOW_MS = 60_000;

/** Owner tint opacity for a visible owned land tile at `nowMs`. */
export const liveOwnershipTintAlpha = (tile: Pick<Tile, "ownershipState" | "breachShockUntil" | "frontierDecayAt">, nowMs: number): number => {
  let alpha = tile.ownershipState === "FRONTIER" ? FRONTIER_ALPHA : SETTLED_ALPHA;
  if (typeof tile.breachShockUntil === "number" && tile.breachShockUntil > nowMs) {
    alpha = Math.min(alpha, BREACH_SHOCK_MAX_ALPHA);
  }
  if (tile.ownershipState === "FRONTIER" && typeof tile.frontierDecayAt === "number") {
    const remainingMs = tile.frontierDecayAt - nowMs;
    if (remainingMs > 0 && remainingMs <= FRONTIER_DECAY_BLINK_WINDOW_MS) {
      const blink = 0.5 + 0.5 * Math.sin((nowMs / 2_000) * Math.PI * 2);
      alpha *= 0.55 + blink * 0.6;
    }
  }
  return alpha;
};

/** Fills a visible owned land tile with its owner's tint, then redraws its river water on top. */
export const drawLiveOwnershipTint2D = (
  ctx: CanvasRenderingContext2D,
  tile: Pick<Tile, "ownershipState" | "breachShockUntil" | "frontierDecayAt">,
  ownerColor: string,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number,
  nowMs: number = Date.now()
): void => {
  ctx.fillStyle = ownerColor;
  ctx.globalAlpha = liveOwnershipTintAlpha(tile, nowMs);
  if (tile.ownershipState === "SETTLED") ctx.fillRect(px, py, size, size);
  else ctx.fillRect(px, py, size - 1, size - 1);
  ctx.globalAlpha = 1;
  // Same top-face height the terrain draw used (client-map-render.ts drawTerrainTile).
  const topHeight = useTerrainReliefRenderer ? Math.max(2, size - terrainReliefPx(wx, wy, "LAND", size)) : size;
  drawRiverEdges(ctx, wx, wy, px, py, size, topHeight, "bank-and-water");
};
