import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";
import {
  placementPreviewForStructure,
  placementRadius,
  tileIsPlacementBeneficiary
} from "../client-structure-effects/client-structure-effects.js";
import { computeOutpostReachPreview } from "../client-reach-overlay-beacon-preview/client-reach-overlay-beacon-preview.js";

// Outpost-family structures (RELAY_BEACON/SIEGE_OUTPOST/SIEGE_TOWER/
// DREAD_TOWER) all project a radius-5 reach disk once active (see
// packages/shared/src/reach/reach.ts). While the player is siting one of
// these via the building-placement flow, ghost-preview the new reach disk
// it would add so beacon siting is an informed spatial choice — item 5 of
// the reach overlay plan.
const OUTPOST_FAMILY_STRUCTURE_TYPES = new Set(["RELAY_BEACON", "SIEGE_OUTPOST", "SIEGE_TOWER", "DREAD_TOWER"]);
const REACH_PREVIEW_STROKE_STYLE = "rgba(150, 220, 255, 0.9)";
const REACH_PREVIEW_NEW_FILL_STYLE = "rgba(150, 220, 255, 0.10)";

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
// Waterworks at 10) — a fixed, small iteration independent of world/map size.
const renderPlacementBeneficiaryTiles = (
  state: ClientState,
  deps: PlacementPreview2DDeps,
  structureType: "WATERWORKS" | "FOUNDRY",
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

// Ghost-outlines the new reach disk an outpost-family structure would add.
// Tiles already inside the player's current reach (state.myReach — see
// client-reach-overlay.ts's MOCK-DATA SEAM) are left alone so the ghost
// only highlights *newly* reachable ground, which is the actual siting
// decision the player is making.
const renderOutpostReachGhostPreview = (
  state: ClientState,
  deps: PlacementPreview2DDeps,
  size: number,
  halfW: number,
  halfH: number
): void => {
  const { x, y } = state.buildingPlacement;
  const placementTile = state.tiles.get(deps.keyFor(x, y));
  if (deps.tileVisibilityStateAt(x, y, placementTile) !== "visible") return;
  const preview = computeOutpostReachPreview(x, y);
  const existingReach = state.myReach;
  for (const key of preview) {
    const [kxRaw, kyRaw] = key.split(",");
    const kx = Number(kxRaw);
    const ky = Number(kyRaw);
    if (!Number.isFinite(kx) || !Number.isFinite(ky)) continue;
    if (existingReach?.has(key)) continue; // already in reach — nothing new to show here
    const { sx, sy } = deps.worldToScreen(kx, ky, size, halfW, halfH);
    deps.ctx.save();
    deps.ctx.fillStyle = REACH_PREVIEW_NEW_FILL_STYLE;
    deps.ctx.fillRect(sx - size / 2 + 1, sy - size / 2 + 1, size - 2, size - 2);
    deps.ctx.restore();
  }
  const center = deps.worldToScreen(x, y, size, halfW, halfH);
  const ringRadius = 5.5; // OUTPOST_REACH_RADIUS (5) + 0.5 tile margin, matches the square-ring convention below
  const squareSize = ringRadius * 2 * size;
  deps.ctx.save();
  deps.ctx.strokeStyle = REACH_PREVIEW_STROKE_STYLE;
  deps.ctx.setLineDash([6, 4]);
  deps.ctx.lineWidth = 2;
  deps.ctx.strokeRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
  deps.ctx.restore();
};

export const renderBuildingPlacementPreview2D = (
  state: ClientState,
  deps: PlacementPreview2DDeps,
  size: number,
  halfW: number,
  halfH: number
): void => {
  if (!state.buildingPlacement.active) return;
  const st = state.buildingPlacement.structureType;
  if (OUTPOST_FAMILY_STRUCTURE_TYPES.has(st)) {
    renderOutpostReachGhostPreview(state, deps, size, halfW, halfH);
    return;
  }
  if (st !== "WATERWORKS" && st !== "FOUNDRY") return;
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
