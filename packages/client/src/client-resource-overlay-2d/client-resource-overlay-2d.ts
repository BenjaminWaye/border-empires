import { terrainAt } from "@border-empires/shared";
import { fishingSiteOffset, fishingWaterDirection } from "../client-food-tile-placement.js";
import { isTrue3DRendererActive } from "../client-renderer-mode.js";
import { drawConstructionStructure2D } from "../client-construction-2d/client-construction-2d.js";
import { constructionSiteForTile } from "../client-construction-phase/client-construction-phase.js";
import type { Tile } from "../client-types.js";

// The per-tile resource / built-structure overlay draw, shared by the runtime
// loop's two tile loops (it was duplicated verbatim in both). Structures under
// construction or removal are drawn through the construction renderer
// (docs/construction-animation-plan.md) instead of a flat translucent sprite.
export type ResourceOverlayDrawDeps = {
  readonly wrapX?: (x: number) => number;
  readonly wrapY?: (y: number) => number;
  readonly ctx: CanvasRenderingContext2D;
  readonly builtResourceOverlayForTile: (tile: Tile) => HTMLImageElement | undefined;
  readonly resourceOverlayForTile: (tile: Tile) => HTMLImageElement | undefined;
  readonly economicStructureOverlayAlpha: (tile: Tile) => number;
  readonly drawCenteredOverlayWithAlpha: (
    overlay: HTMLImageElement | undefined,
    px: number,
    py: number,
    size: number,
    scale: number,
    alpha: number
  ) => void;
  readonly resourceOverlayScaleForTile: (tile: Tile) => number;
  readonly drawResourceCornerMarker: (tile: Tile, px: number, py: number, size: number) => void;
  readonly resourceColor: (resource: Tile["resource"]) => string | undefined;
};

// Returns false when the tile has a resource but no colour to draw a fallback
// marker with, so callers can skip the rest of that tile's per-tile work (the
// loops used to `return`/`continue` right here).
export const drawResourceOverlay2D = (deps: ResourceOverlayDrawDeps, tile: Tile, px: number, py: number, size: number, nowMs: number): boolean => {
  const builtOverlay = deps.builtResourceOverlayForTile(tile);
  const overlay = builtOverlay ?? deps.resourceOverlayForTile(tile);
  if (overlay?.complete && overlay.naturalWidth) {
    if (!isTrue3DRendererActive()) {
      const scale = deps.resourceOverlayScaleForTile(tile);
      // Only the economic structure's sprite is the one being built; a fort or siege camp on the same tile keeps the flat look.
      const epochMs = Date.now();
      const site = builtOverlay ? constructionSiteForTile(tile, epochMs, "economicStructure") : undefined;
      if (site) drawConstructionStructure2D(deps.ctx, overlay, px, py, size, scale, site, epochMs);
      else {
        const water = !builtOverlay && tile.resource === "FISH" ? fishingWaterDirection((x, y) => {
          const terrain = terrainAt(deps.wrapX?.(x) ?? x, deps.wrapY?.(y) ?? y);
          return terrain === "SEA" || terrain === "COASTAL_SEA";
        }, tile.x, tile.y) : undefined;
        const offset = size * fishingSiteOffset(water);
        deps.drawCenteredOverlayWithAlpha(overlay, px + (water?.dx ?? 0) * offset,
          py + (water?.dy ?? 0) * offset, size, scale, builtOverlay ? deps.economicStructureOverlayAlpha(tile) : 1);
      }
    }
    deps.drawResourceCornerMarker(tile, px, py, size);
    return true;
  }
  if (!isTrue3DRendererActive()) {
    const rc = deps.resourceColor(tile.resource);
    if (!rc) return false;
    const marker = Math.max(3, Math.floor(size * 0.22));
    const mx = px + Math.floor((size - marker) / 2);
    const my = py + Math.floor((size - marker) / 2);
    deps.ctx.fillStyle = "rgba(12, 16, 28, 0.7)";
    deps.ctx.fillRect(mx - 1, my - 1, marker + 2, marker + 2);
    deps.ctx.fillStyle = rc;
    deps.ctx.fillRect(mx, my, marker, marker);
  }
  deps.drawResourceCornerMarker(tile, px, py, size);
  return true;
};
