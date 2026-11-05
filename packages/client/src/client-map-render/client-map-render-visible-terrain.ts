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

// Settled edge masks only change when tiles do, so they're cached per
// tilesRevision instead of re-walking 8 neighbours every frame -- the same
// freshness signal the 3D rebuild uses (tilesRevisionChangedKeys). Bounded by
// the tiles drawn since the last revision; the cap only matters for a long
// pan with no tile updates.
const MAX_CACHED_EDGE_MASKS = 20_000;
const edgeMaskCache = { revision: -1, masks: new Map<string, number>() };
const settledEdgeMaskCached = (key: string, revision: number, compute: () => number): number => {
  if (edgeMaskCache.revision !== revision || edgeMaskCache.masks.size >= MAX_CACHED_EDGE_MASKS) {
    edgeMaskCache.revision = revision;
    edgeMaskCache.masks.clear();
  }
  const cached = edgeMaskCache.masks.get(key);
  if (cached !== undefined) return cached;
  const mask = compute();
  edgeMaskCache.masks.set(key, mask);
  return mask;
};

/** Visible land details, then ownership, then small prospect clues above both. */
export const drawVisibleTerrain2D = (
  deps: VisibleTerrainDeps,
  state: { readonly techIds: readonly string[]; readonly techCatalog: readonly TechInfo[]; readonly tiles: ReadonlyMap<string, Tile>; readonly tilesRevision: number },
  tile: Tile,
  wx: number, wy: number, px: number, py: number, size: number
): void => {
  if (!isNetworkResource(tile.resource)) deps.drawForestOverlay(wx, wy, px, py, size);
  deps.drawHillsOverlay(wx, wy, px, py, size);
  if (tile.ownerId) {
    const ownerId = tile.ownerId;
    const edgeMask = tile.ownershipState === "SETTLED"
      ? settledEdgeMaskCached(`${ownerId}|${wx},${wy}`, state.tilesRevision, () =>
        settledEdgeMaskForOwner(wx, wy, ownerId, { tiles: state.tiles, keyFor: deps.keyFor, wrapX: deps.wrapX, wrapY: deps.wrapY }))
      : undefined;
    drawLiveOwnershipTint2D(deps.ctx, tile, deps.effectiveOverlayColor(tile.ownerId), wx, wy, px, py, size, Date.now(), edgeMask);
  }
  const clue = prospectClueDrawFor(tile, true, retiredClues(state.techIds, state.techCatalog));
  drawProspectSignatureOverlay(deps.ctx, clue, wx, wy, px, py, size);
};
