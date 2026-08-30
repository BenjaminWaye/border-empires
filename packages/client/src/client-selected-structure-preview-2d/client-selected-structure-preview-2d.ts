import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileVisibilityState } from "../client-types.js";
import { structureAreaPreviewForTile } from "../client-structure-effects/client-structure-effects.js";
import { ownObservatoryRange } from "../client-observatory-rules/client-observatory-rules.js";

// Extracted out of client-runtime-loop.ts (500-line file cap, AGENTS.md):
// the observatory-range ring and structure-area-preview ring drawn around
// whichever tile is currently selected are a single cohesive "selection
// preview" concern, distinct from the per-tile overlay pass around them.

export type SelectedStructurePreview2DDeps = {
  ctx: CanvasRenderingContext2D;
  worldToScreen: (wx: number, wy: number, size: number, halfW: number, halfH: number) => { sx: number; sy: number };
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
};

export const renderSelectedStructurePreview2D = (
  state: ClientState,
  selectedWorld: Tile | undefined,
  deps: SelectedStructurePreview2DDeps,
  size: number,
  halfW: number,
  halfH: number
): void => {
  if (selectedWorld && selectedWorld.observatory) {
    const selectedVisibility = deps.tileVisibilityStateAt(selectedWorld.x, selectedWorld.y, selectedWorld);
    if (
      selectedVisibility === "visible" &&
      selectedWorld.ownerId === state.me &&
      selectedWorld.observatory.status === "active"
    ) {
      const center = deps.worldToScreen(selectedWorld.x, selectedWorld.y, size, halfW, halfH);
      const effectiveRange = ownObservatoryRange(state);
      const rangeRadius = effectiveRange + 0.5;
      const squareSize = rangeRadius * 2 * size;
      deps.ctx.save();
      deps.ctx.strokeStyle = "rgba(106, 180, 255, 0.35)";
      deps.ctx.fillStyle = "rgba(106, 180, 255, 0.02)";
      deps.ctx.setLineDash([14, 10]);
      deps.ctx.lineWidth = 2;
      deps.ctx.strokeRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
      deps.ctx.fillRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
      deps.ctx.restore();
    }
  }
  const selectedStructurePreview = selectedWorld ? structureAreaPreviewForTile(selectedWorld) : undefined;
  if (selectedWorld && selectedStructurePreview) {
    const selectedVisibility = deps.tileVisibilityStateAt(selectedWorld.x, selectedWorld.y, selectedWorld);
    if (selectedVisibility === "visible") {
      const center = deps.worldToScreen(selectedWorld.x, selectedWorld.y, size, halfW, halfH);
      const ringRadius = selectedStructurePreview.radius + 0.5;
      const squareSize = ringRadius * 2 * size;
      deps.ctx.save();
      deps.ctx.strokeStyle = selectedStructurePreview.strokeStyle;
      deps.ctx.fillStyle = selectedStructurePreview.fillStyle;
      deps.ctx.setLineDash(selectedStructurePreview.lineDash);
      deps.ctx.lineWidth = 2;
      deps.ctx.strokeRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
      deps.ctx.fillRect(center.sx - squareSize / 2, center.sy - squareSize / 2, squareSize, squareSize);
      deps.ctx.restore();
    }
  }
};
