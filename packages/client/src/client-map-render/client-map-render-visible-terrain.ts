import type { TechInfo, Tile } from "../client-types.js";
import { createRetiredProspectCluesLookup } from "../client-prospect-clue/client-prospect-clue.js";
import { drawProspectSignatureOverlay, prospectClueDrawFor } from "../client-prospect-signature-overlay.js";
import { drawLiveOwnershipTint2D } from "./client-map-render-live-ownership-tint.js";

interface VisibleTerrainDeps {
  ctx: CanvasRenderingContext2D;
  drawForestOverlay: (wx: number, wy: number, px: number, py: number, size: number) => void;
  drawHillsOverlay: (wx: number, wy: number, px: number, py: number, size: number) => void;
  effectiveOverlayColor: (ownerId: string) => string;
}

// The existing lookup retains only the latest tech-array pair and result.
const retiredClues = createRetiredProspectCluesLookup();

/** Visible land details, then ownership, then small prospect clues above both. */
export const drawVisibleTerrain2D = (
  deps: VisibleTerrainDeps,
  techState: { readonly techIds: readonly string[]; readonly techCatalog: readonly TechInfo[] },
  tile: Tile,
  wx: number, wy: number, px: number, py: number, size: number
): void => {
  deps.drawForestOverlay(wx, wy, px, py, size);
  deps.drawHillsOverlay(wx, wy, px, py, size);
  if (tile.ownerId) drawLiveOwnershipTint2D(deps.ctx, tile, deps.effectiveOverlayColor(tile.ownerId), wx, wy, px, py, size);
  const clue = prospectClueDrawFor(tile, true, retiredClues(techState.techIds, techState.techCatalog));
  drawProspectSignatureOverlay(deps.ctx, clue, wx, wy, px, py, size);
};
