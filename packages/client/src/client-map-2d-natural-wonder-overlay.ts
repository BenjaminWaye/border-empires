import { naturalWonderOverlayImages } from "./client-map-render/client-map-overlay-images.js";
import { drawCenteredOverlayWithAlpha } from "./client-map-render/client-map-render.js";
import type { Tile } from "./client-types.js";

/**
 * 2D (non-3D-renderer) natural wonder overlay — the sibling of
 * drawWatchtower2D, kept in its own file so the already-oversized
 * client-runtime-loop.ts / client-map-render.ts only need a single call site
 * each (see AGENTS.md file-size discipline) instead of growing inline.
 *
 * Natural wonders are painted by the 3D renderer as dedicated meshes
 * (createNaturalWonderOverlays); this draws the matching SVG sprite on the
 * 2D canvas, falling back to a purple dashed ring while the image loads.
 */
export const naturalWonderOverlayForTile = (tile: Tile): HTMLImageElement | undefined => {
  if (!tile.naturalWonder) return undefined;
  return naturalWonderOverlayImages[tile.naturalWonder.type];
};

export const drawNaturalWonderOverlay2D = (
  ctx: CanvasRenderingContext2D,
  overlay: HTMLImageElement | undefined,
  ownerId: string,
  px: number,
  py: number,
  size: number,
  structureAccentColor: (ownerId: string, fallback: string) => string
): void => {
  if (overlay && overlay.complete && overlay.naturalWidth) {
    drawCenteredOverlayWithAlpha(ctx, overlay, px, py, size, 1.02, 0.96);
    return;
  }
  ctx.strokeStyle = structureAccentColor(ownerId, "rgba(186, 143, 255, 0.9)");
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(px + size / 2, py + size / 2, Math.max(3, size * 0.24), 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
};
