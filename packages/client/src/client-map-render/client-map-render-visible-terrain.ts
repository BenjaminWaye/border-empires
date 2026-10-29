import { isNetworkResource } from "@border-empires/shared";
import type { TechInfo, Tile } from "../client-types.js";
import { createRetiredProspectCluesLookup } from "../client-prospect-clue/client-prospect-clue.js";
import { drawProspectSignatureOverlay, prospectClueDrawFor } from "../client-prospect-signature-overlay.js";
import { drawLiveOwnershipTint2D } from "./client-map-render-live-ownership-tint.js";
import { settledEdgeMaskForOwner } from "../client-settled-edge-glow/client-settled-edge-glow.js";

interface VisibleTerrainDeps {
  ctx: CanvasRenderingContext2D;
  drawForestOverlay: (wx: number, wy: number, px: number, py: number, size: number) => void;
  drawHillsOverlay: (wx: number, wy: number, px: number, py: number, size: number) => void;
  effectiveOverlayColor: (ownerId: string) => string;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
}

// The existing lookup retains only the latest tech-array pair and result.
const retiredClues = createRetiredProspectCluesLookup();

/** Visible land details, then ownership, then small prospect clues above both. */
export const drawVisibleTerrain2D = (
  deps: VisibleTerrainDeps,
  state: { readonly techIds: readonly string[]; readonly techCatalog: readonly TechInfo[]; readonly tiles: ReadonlyMap<string, Tile> },
  tile: Tile,
  wx: number, wy: number, px: number, py: number, size: number
): void => {
  if (!isNetworkResource(tile.resource)) deps.drawForestOverlay(wx, wy, px, py, size);
  deps.drawHillsOverlay(wx, wy, px, py, size);
  if (tile.ownerId) {
    const edgeMask = tile.ownershipState === "SETTLED"
      ? settledEdgeMaskForOwner(wx, wy, tile.ownerId, { tiles: state.tiles, keyFor: deps.keyFor, wrapX: deps.wrapX, wrapY: deps.wrapY })
      : undefined;
    drawLiveOwnershipTint2D(deps.ctx, tile, deps.effectiveOverlayColor(tile.ownerId), wx, wy, px, py, size, Date.now(), edgeMask);
  }
  const clue = prospectClueDrawFor(tile, true, retiredClues(state.techIds, state.techCatalog));
  drawProspectSignatureOverlay(deps.ctx, clue, wx, wy, px, py, size);
};
