import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";
import {
  placementPreviewForStructure,
  placementRadius,
  tileIsPlacementBeneficiary
} from "../client-structure-effects/client-structure-effects.js";
import { REACH_RADIUS_BY_KIND } from "../client-reach-overlay/client-reach-overlay-anchor-disk.js";
import {
  beaconExpansionElapsedMs,
  beaconExpansionOutlineCached,
  beaconExpansionTileFill,
  beaconReachExpansionCached,
  OUTLINE_EDGE_CORNERS,
  prefersReducedMotion
} from "../client-beacon-reach-expansion/client-beacon-reach-expansion.js";

// Outpost-family structures (RELAY_BEACON/SIEGE_BATTERY/SIEGE_TOWER/
// DREAD_TOWER) all project a radius-5 reach disk once active (see
// packages/shared/src/reach/reach.ts). While the player is siting one of
// these via the building-placement flow, ghost-preview the new reach disk
// it would add so beacon siting is an informed spatial choice — item 5 of
// the reach overlay plan.
const OUTPOST_FAMILY_STRUCTURE_TYPES = new Set(["RELAY_BEACON", "SIEGE_BATTERY", "SIEGE_TOWER", "DREAD_TOWER"]);
const REACH_PREVIEW_STROKE_STYLE = "rgba(190, 240, 255, 0.95)";
const REACH_PREVIEW_INVALID_STROKE_STYLE = "rgba(220, 80, 80, 0.9)";
const REACH_PREVIEW_NEW_FILL_STYLE = "rgba(120, 220, 255, 0.34)";

export type PlacementPreview2DDeps = {
  ctx: CanvasRenderingContext2D;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  worldToScreen: (wx: number, wy: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
  isPlacementValidForTile: (tile: Tile | undefined) => boolean;
};

const BENEFICIARY_FILL_STYLE = "rgba(80, 220, 110, 0.35)";
const BENEFICIARY_STROKE_STYLE = "rgba(80, 220, 110, 0.85)";

// Bounded to (2*radius+1)^2 tiles (max 441 for the largest current radius,
// Hydroworks at 10) — a fixed, small iteration independent of world/map size.
const renderPlacementBeneficiaryTiles = (
  state: ClientState,
  deps: PlacementPreview2DDeps,
  structureType: "HYDROWORKS",
  centerX: number,
  centerY: number,
  radius: number,
  size: number,
  halfW: number,
  halfH: number
): void => {
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const wx = deps.wrapX(centerX + dx);
      const wy = deps.wrapY(centerY + dy);
      const tile = state.tiles.get(deps.keyFor(wx, wy));
      if (!tile) continue;
      if (deps.tileVisibilityStateAt(wx, wy, tile) !== "visible") continue;
      if (!tileIsPlacementBeneficiary(tile, structureType, state.me)) continue;
      const { sx, sy } = deps.worldToScreen(wx, wy, size, halfW, halfH);
      deps.ctx.save();
      deps.ctx.fillStyle = BENEFICIARY_FILL_STYLE;
      deps.ctx.strokeStyle = BENEFICIARY_STROKE_STYLE;
      deps.ctx.lineWidth = 2;
      deps.ctx.fillRect(sx - size / 2 + 1, sy - size / 2 + 1, size - 2, size - 2);
      deps.ctx.strokeRect(sx - size / 2 + 1, sy - size / 2 + 1, size - 2, size - 2);
      deps.ctx.restore();
    }
  }
};

// The reach an outpost-family structure would add, growing out from the placement tile
// (client-beacon-reach-expansion.ts): the newly reachable ground fills in ring by ring inside a solid
// outline of where it ends. Ground already in reach is left alone. An invalid spot gets a red ring instead.
const renderOutpostReachGhostPreview = (
  state: ClientState,
  deps: PlacementPreview2DDeps,
  size: number,
  halfW: number,
  halfH: number,
  nowMs: number
): void => {
  const { x, y, structureType: st } = state.buildingPlacement;
  const placementTile = state.tiles.get(deps.keyFor(x, y));
  if (deps.tileVisibilityStateAt(x, y, placementTile) !== "visible") return;
  const valid = st !== "RELAY_BEACON" || deps.isPlacementValidForTile(placementTile);
  if (!valid) {
    const center = deps.worldToScreen(x, y, size, halfW, halfH);
    const squareSize = (REACH_RADIUS_BY_KIND.OUTPOST + 0.5) * 2 * size;
    deps.ctx.save();
    deps.ctx.strokeStyle = REACH_PREVIEW_INVALID_STROKE_STYLE;
    deps.ctx.setLineDash([6, 4]);
    deps.ctx.lineWidth = 2;
    deps.ctx.strokeRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
    deps.ctx.restore();
    return;
  }
  const expansion = beaconReachExpansionCached(state, x, y);
  const elapsed = beaconExpansionElapsedMs(x, y, nowMs);
  const still = prefersReducedMotion();
  deps.ctx.save();
  for (const tile of expansion.tiles) {
    const fill = beaconExpansionTileFill(tile.ring, elapsed, still);
    if (fill <= 0) continue;
    const { sx, sy } = deps.worldToScreen(tile.x, tile.y, size, halfW, halfH);
    // A tile grows from its centre as the wave reaches it.
    const side = (size - 2) * fill;
    deps.ctx.fillStyle = REACH_PREVIEW_NEW_FILL_STYLE;
    deps.ctx.fillRect(sx - side / 2, sy - side / 2, side, side);
  }
  deps.ctx.strokeStyle = REACH_PREVIEW_STROKE_STYLE;
  deps.ctx.setLineDash([]);
  deps.ctx.lineWidth = Math.max(1.5, size * 0.08);
  deps.ctx.beginPath();
  for (const edge of beaconExpansionOutlineCached(expansion, deps.keyFor, deps.wrapX, deps.wrapY)) {
    const { sx, sy } = deps.worldToScreen(edge.x, edge.y, size, halfW, halfH);
    const [[ax, ay], [bx, by]] = OUTLINE_EDGE_CORNERS[edge.side];
    deps.ctx.moveTo(sx + (ax - 0.5) * size, sy + (ay - 0.5) * size);
    deps.ctx.lineTo(sx + (bx - 0.5) * size, sy + (by - 0.5) * size);
  }
  deps.ctx.stroke();
  deps.ctx.restore();
};

export const renderBuildingPlacementPreview2D = (
  state: ClientState,
  deps: PlacementPreview2DDeps,
  size: number,
  halfW: number,
  halfH: number,
  nowMs: number = performance.now()
): void => {
  const pending = state.afcRecovery?.pending;
  const placement = state.buildingPlacement.active ? state.buildingPlacement : pending ? { x: pending.x, y: pending.y, structureType: "AFC" as const } : undefined;
  if (!placement) return;
  const st = placement.structureType;
  if (OUTPOST_FAMILY_STRUCTURE_TYPES.has(st)) {
    renderOutpostReachGhostPreview(state, deps, size, halfW, halfH, nowMs);
    return;
  }
  if (st === "AFC") {
    const { x, y } = placement;
    const placementTile = state.tiles.get(deps.keyFor(x, y));
    if (deps.tileVisibilityStateAt(x, y, placementTile) !== "visible") return;
    const center = deps.worldToScreen(x, y, size, halfW, halfH);
    const valid = Boolean(pending) || deps.isPlacementValidForTile(placementTile);
    deps.ctx.save();
    deps.ctx.strokeStyle = valid ? "rgba(102, 220, 255, 0.95)" : "rgba(220, 80, 80, 0.9)";
    deps.ctx.lineWidth = 3;
    deps.ctx.strokeRect(center.sx - size * 1.5 + 2, center.sy - size * 1.5 + 2, size * 3 - 4, size * 3 - 4);
    deps.ctx.restore();
    return;
  }
  if (st !== "HYDROWORKS") return;
  const { x, y } = state.buildingPlacement;
  const placementTile = state.tiles.get(deps.keyFor(x, y));
  if (deps.tileVisibilityStateAt(x, y, placementTile) !== "visible") return;
  const valid = deps.isPlacementValidForTile(placementTile);
  const preview = placementPreviewForStructure(st, valid);

  renderPlacementBeneficiaryTiles(state, deps, st, x, y, placementRadius(st), size, halfW, halfH);

  const center = deps.worldToScreen(x, y, size, halfW, halfH);
  const ringRadius = preview.radius + 0.5;
  const squareSize = ringRadius * 2 * size;
  deps.ctx.save();
  deps.ctx.strokeStyle = preview.strokeStyle;
  deps.ctx.fillStyle = preview.fillStyle;
  deps.ctx.setLineDash(preview.lineDash);
  deps.ctx.lineWidth = 2;
  deps.ctx.strokeRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
  deps.ctx.fillRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
  deps.ctx.restore();
  deps.ctx.save();
  deps.ctx.fillStyle = valid ? "rgba(56, 176, 60, 0.7)" : "rgba(220, 80, 80, 0.7)";
  deps.ctx.beginPath();
  deps.ctx.arc(center.sx, center.sy, 4, 0, Math.PI * 2);
  deps.ctx.fill();
  deps.ctx.restore();
};
