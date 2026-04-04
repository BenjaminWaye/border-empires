import type { ClientState } from "./client-state.js";
import type { Tile } from "./client-types.js";

type DragSelectionDeps = {
  state: ClientState;
  canvas: HTMLCanvasElement;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
  keyFor: (x: number, y: number) => string;
  hasCollectableYield: (tile: Tile | undefined) => boolean;
};

export const worldTileRawFromPointer = (
  state: ClientState,
  canvas: HTMLCanvasElement,
  offsetX: number,
  offsetY: number
): { gx: number; gy: number } => {
  const size = state.zoom;
  const halfW = Math.floor(canvas.width / size / 2);
  const halfH = Math.floor(canvas.height / size / 2);
  return {
    gx: Math.floor(offsetX / size) - halfW + state.camX,
    gy: Math.floor(offsetY / size) - halfH + state.camY
  };
};

export const computeDragPreview = (deps: DragSelectionDeps): void => {
  const { state, wrapX, wrapY, keyFor, hasCollectableYield } = deps;
  const start = state.boxSelectStart;
  const current = state.boxSelectCurrent;
  state.dragPreviewKeys.clear();
  if (!start || !current) return;
  const minX = Math.min(start.gx, current.gx);
  const maxX = Math.max(start.gx, current.gx);
  const minY = Math.min(start.gy, current.gy);
  const maxY = Math.max(start.gy, current.gy);
  const area = (maxX - minX + 1) * (maxY - minY + 1);
  if (area > 2500) return;
  for (let gy = minY; gy <= maxY; gy += 1) {
    for (let gx = minX; gx <= maxX; gx += 1) {
      const wx = wrapX(gx);
      const wy = wrapY(gy);
      const tile = state.tiles.get(keyFor(wx, wy));
      if (!tile || tile.fogged || tile.terrain !== "LAND") continue;
      if (tile.ownerId === state.me && !hasCollectableYield(tile)) continue;
      state.dragPreviewKeys.add(keyFor(wx, wy));
    }
  }
};
