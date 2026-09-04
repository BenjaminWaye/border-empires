// Extracted from client-runtime-loop.ts to keep that file from growing past
// its line cap. Draws the economic-structure marker (built-in sprite or a
// per-type fallback shape) for the high-detail 2D tile pass, then redraws
// the forest overlay on top: a structure sprite paints over the full tile,
// which would otherwise erase the trees drawn earlier in the same pass even
// though the tile's forest-ness is never actually cleared underneath.
import { isTrue3DRendererActive } from "./client-renderer-mode.js";
import { isStructureHandledBy3D } from "./client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import type { Tile, TileVisibilityState } from "./client-types.js";

export type StructureFallbackOverlay2DDeps = {
  ctx: CanvasRenderingContext2D;
  drawForestOverlay: (wx: number, wy: number, px: number, py: number, size: number) => void;
  drawCenteredOverlay: (overlay: HTMLImageElement | undefined, px: number, py: number, size: number, scale?: number) => void;
  builtResourceOverlayForTile: (tile: Tile) => HTMLImageElement | undefined;
  structureOverlayImages: Record<string, HTMLImageElement>;
  structureAccentColor: (ownerId: string, fallback: string) => string;
};

export const drawStructureFallbackOverlay2D = (
  deps: StructureFallbackOverlay2DDeps,
  t: Tile,
  wx: number,
  wy: number,
  px: number,
  py: number,
  size: number,
  vis: TileVisibilityState
): void => {
  if (!t.economicStructure) return;
  const markerSize = Math.max(3, Math.floor(size * 0.2));
  const active = t.economicStructure.status === "active";
  const hasBuiltResourceOverlay = Boolean(deps.builtResourceOverlayForTile(t));
  const overlay = deps.structureOverlayImages[t.economicStructure.type];
  const handled3DStructure = isTrue3DRendererActive() && isStructureHandledBy3D(t.economicStructure.type);
  if (handled3DStructure) {
    // 3D-rendered; no 2D fallback.
  } else if (overlay && overlay.complete && overlay.naturalWidth) {
    deps.drawCenteredOverlay(overlay, px, py, size, 1.02);
  } else if (t.economicStructure.type === "FARMSTEAD" && !hasBuiltResourceOverlay) {
    deps.ctx.fillStyle = deps.structureAccentColor(t.ownerId ?? "", active ? "rgba(192, 229, 117, 0.95)" : "rgba(148, 176, 104, 0.72)");
    deps.ctx.fillRect(px + 2, py + size - markerSize - 2, markerSize + 1, markerSize);
  } else if (t.economicStructure.type === "UMBRITE_RIG" && !hasBuiltResourceOverlay) {
    deps.ctx.fillStyle = deps.structureAccentColor(t.ownerId ?? "", active ? "rgba(147, 92, 201, 0.95)" : "rgba(114, 71, 156, 0.74)");
    deps.ctx.beginPath();
    deps.ctx.moveTo(px + size / 2, py + 3);
    deps.ctx.lineTo(px + size - 4, py + markerSize + 4);
    deps.ctx.lineTo(px + 4, py + markerSize + 4);
    deps.ctx.closePath();
    deps.ctx.fill();
  } else if (t.economicStructure.type === "MINE" && !hasBuiltResourceOverlay) {
    deps.ctx.fillStyle = deps.structureAccentColor(t.ownerId ?? "", active ? "rgba(188, 197, 214, 0.96)" : "rgba(120, 130, 148, 0.74)");
    deps.ctx.fillRect(px + 2, py + 2, markerSize + 1, markerSize + 1);
  } else {
    deps.ctx.strokeStyle = deps.structureAccentColor(t.ownerId ?? "", active ? "rgba(255, 212, 111, 0.96)" : "rgba(191, 162, 102, 0.72)");
    deps.ctx.lineWidth = 2;
    deps.ctx.strokeRect(px + 2, py + 2, markerSize + 2, markerSize + 2);
    deps.ctx.lineWidth = 1;
  }
  if (!isTrue3DRendererActive() && vis === "visible" && t.terrain === "LAND") deps.drawForestOverlay(wx, wy, px, py, size);
};
