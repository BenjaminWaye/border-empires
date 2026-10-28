import type { Tile } from "../client-types.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { isStructureHandledBy3D } from "../client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";

export interface EconomicOverlay2DDeps {
  ctx: CanvasRenderingContext2D;
  builtResourceOverlayForTile: (tile: Tile) => HTMLImageElement | undefined;
  structureOverlayImages: Record<string, HTMLImageElement>;
  structureAccentColor: (ownerId: string, fallback: string) => string;
  drawCenteredOverlay: (overlay: HTMLImageElement | undefined, x: number, y: number, size: number, scale?: number) => void;
}

/** Resource installations are drawn by the construction-aware resource pass exactly once. */
export function drawEconomicStructureOverlay2D(deps: EconomicOverlay2DDeps, tile: Tile,
  px: number, py: number, size: number, skipRelay: boolean): void {
  const structure = tile.economicStructure;
  if (!structure) return;
  const hasBuiltResourceOverlay = Boolean(deps.builtResourceOverlayForTile(tile));
  if (hasBuiltResourceOverlay || (skipRelay && structure.type === "RELAY_BEACON") ||
      (isTrue3DRendererActive() && isStructureHandledBy3D(structure.type))) return;
  const markerSize = Math.max(3, Math.floor(size * 0.2));
  const active = structure.status === "active";
  const overlay = deps.structureOverlayImages[structure.type];
  if (overlay && overlay.complete && overlay.naturalWidth) {
    deps.drawCenteredOverlay(overlay, px, py, size, 1.02);
  } else if (structure.type === "HYDROGARDEN" && !hasBuiltResourceOverlay) {
    deps.ctx.fillStyle = deps.structureAccentColor(
      tile.ownerId ?? "",
      active ? "rgba(192, 229, 117, 0.95)" : "rgba(148, 176, 104, 0.72)"
    );
    deps.ctx.fillRect(px + 2, py + size - markerSize - 2, markerSize + 1, markerSize);
  } else if (structure.type === "UMBRITE_RIG" && !hasBuiltResourceOverlay) {
    deps.ctx.fillStyle = deps.structureAccentColor(
      tile.ownerId ?? "",
      active ? "rgba(147, 92, 201, 0.95)" : "rgba(114, 71, 156, 0.74)"
    );
    deps.ctx.beginPath();
    deps.ctx.moveTo(px + size / 2, py + 3);
    deps.ctx.lineTo(px + size - 4, py + markerSize + 4);
    deps.ctx.lineTo(px + 4, py + markerSize + 4);
    deps.ctx.closePath();
    deps.ctx.fill();
  } else if (structure.type === "MINE" && !hasBuiltResourceOverlay) {
    deps.ctx.fillStyle = deps.structureAccentColor(
      tile.ownerId ?? "",
      active ? "rgba(188, 197, 214, 0.96)" : "rgba(120, 130, 148, 0.74)"
    );
    deps.ctx.fillRect(px + 2, py + 2, markerSize + 1, markerSize + 1);
  } else {
    deps.ctx.strokeStyle = deps.structureAccentColor(
      tile.ownerId ?? "",
      active ? "rgba(255, 212, 111, 0.96)" : "rgba(191, 162, 102, 0.72)"
    );
    deps.ctx.lineWidth = 2;
    deps.ctx.strokeRect(px + 2, py + 2, markerSize + 2, markerSize + 2);
    deps.ctx.lineWidth = 1;
  }
}
