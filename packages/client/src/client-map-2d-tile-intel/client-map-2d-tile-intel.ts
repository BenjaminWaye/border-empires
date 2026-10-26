// 2D per-tile "intel" overlays: the weak-defensibility warning and the
// Diplomacy map tint. Extracted from client-runtime-loop.ts, where the
// weak-defensibility block was duplicated in both tile passes, so that file
// (well over the line cap) shrinks as overlays are added. 3D parity:
// client-map-3d-defensibility-overlay.ts and client-map-3d-diplomacy-overlay.ts.

import type { Terrain } from "@border-empires/shared";
import { DIPLOMACY_OVERLAY_COLORS, diplomacyStanceLookup, type DiplomacyStanceLookup } from "../client-diplomacy-overlay/client-diplomacy-overlay.js";
import { exposedSidesForTile, isOwnedSettledLandTile, weakDefensibilitySeverity } from "../client-defensibility-tile.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";

export type TileIntelDeps2D = {
  state: Pick<ClientState, "tiles" | "me" | "showWeakDefensibility" | "showDiplomacyOverlay">;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  terrainAt: (x: number, y: number) => Terrain;
  /** Present only while the Diplomacy overlay is on and the 2D renderer draws the map. */
  stanceOf: DiplomacyStanceLookup | undefined;
};

/** Hoisted once per frame: the stance lookup builds Sets of allies and truces. */
export const tileIntelDeps2D = (
  state: TileIntelDeps2D["state"] & Pick<ClientState, "allies" | "activeTruces">,
  deps: Omit<TileIntelDeps2D, "state" | "stanceOf">,
  true3DActive: boolean
): TileIntelDeps2D => ({ ...deps, state, stanceOf: state.showDiplomacyOverlay && !true3DActive ? diplomacyStanceLookup(state) : undefined });

const hexToRgba = (hex: string, alpha: number): string => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const FILL = Object.fromEntries(Object.entries(DIPLOMACY_OVERLAY_COLORS).map(([k, v]) => [k, hexToRgba(v, 0.36)])) as Record<keyof typeof DIPLOMACY_OVERLAY_COLORS, string>;
const EDGE = Object.fromEntries(Object.entries(DIPLOMACY_OVERLAY_COLORS).map(([k, v]) => [k, hexToRgba(v, 0.85)])) as Record<keyof typeof DIPLOMACY_OVERLAY_COLORS, string>;

const drawDiplomacyTint2D = (ctx: CanvasRenderingContext2D, t: Tile, px: number, py: number, size: number, stanceOf: DiplomacyStanceLookup): void => {
  const stance = stanceOf(t.ownerId);
  if (!stance) return;
  ctx.fillStyle = FILL[stance];
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  if (size >= 10) {
    ctx.strokeStyle = EDGE[stance];
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
    ctx.lineWidth = 1;
  }
};

const drawWeakDefensibility2D = (ctx: CanvasRenderingContext2D, t: Tile, px: number, py: number, size: number, deps: TileIntelDeps2D): void => {
  const exposedSides = exposedSidesForTile(t, {
    tiles: deps.state.tiles,
    me: deps.state.me,
    keyFor: deps.keyFor,
    wrapX: deps.wrapX,
    wrapY: deps.wrapY,
    terrainAt: deps.terrainAt
  });
  const severity = weakDefensibilitySeverity(exposedSides.length);
  if (!severity) return;
  const critical = severity === "critical";
  ctx.fillStyle = critical ? "rgba(255, 84, 84, 0.18)" : "rgba(255, 173, 92, 0.12)";
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
  ctx.strokeStyle = critical ? "rgba(255, 84, 84, 0.92)" : "rgba(255, 173, 92, 0.88)";
  ctx.lineWidth = critical ? 4 : 3;
  ctx.beginPath();
  if (exposedSides.includes("north")) {
    ctx.moveTo(px + 1, py + 2);
    ctx.lineTo(px + size - 1, py + 2);
  }
  if (exposedSides.includes("east")) {
    ctx.moveTo(px + size - 2, py + 1);
    ctx.lineTo(px + size - 2, py + size - 1);
  }
  if (exposedSides.includes("south")) {
    ctx.moveTo(px + 1, py + size - 2);
    ctx.lineTo(px + size - 1, py + size - 2);
  }
  if (exposedSides.includes("west")) {
    ctx.moveTo(px + 2, py + 1);
    ctx.lineTo(px + 2, py + size - 1);
  }
  ctx.stroke();
  if (size >= 12) {
    ctx.fillStyle = critical ? "rgba(255, 84, 84, 0.96)" : "rgba(255, 196, 92, 0.96)";
    ctx.beginPath();
    ctx.arc(px + size * 0.5, py + size * 0.5, critical ? 2.3 : 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 1;
};

/** Both tile passes call this where the weak-defensibility block used to sit. */
export const drawTileIntelOverlays2D = (
  ctx: CanvasRenderingContext2D,
  t: Tile | undefined,
  vis: TileVisibilityState,
  px: number,
  py: number,
  size: number,
  deps: TileIntelDeps2D
): void => {
  if (t && deps.stanceOf && vis !== "unexplored") drawDiplomacyTint2D(ctx, t, px, py, size, deps.stanceOf);
  if (deps.state.showWeakDefensibility && vis === "visible" && t && isOwnedSettledLandTile(t, deps.state.me)) drawWeakDefensibility2D(ctx, t, px, py, size, deps);
};
