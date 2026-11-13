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
