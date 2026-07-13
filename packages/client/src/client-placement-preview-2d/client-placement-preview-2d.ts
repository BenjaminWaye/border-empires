import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";
import {
  placementPreviewForStructure,
  placementRadius,
  tileIsPlacementBeneficiary
} from "../client-structure-effects/client-structure-effects.js";

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

export const renderBuildingPlacementPreview2D = (
  state: ClientState,
  deps: PlacementPreview2DDeps,
  size: number,
  halfW: number,
  halfH: number
): void => {
  if (!state.buildingPlacement.active) return;
  const st = state.buildingPlacement.structureType;
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
