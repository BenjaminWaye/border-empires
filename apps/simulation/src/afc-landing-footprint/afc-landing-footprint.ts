import { AFC_LANDING_FOOTPRINT_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, clearForestAroundAfcTile, wrapX, wrapY } from "@border-empires/shared";
import type { DomainTileState } from "@border-empires/game-domain";

import { simulationTileKey } from "../seed-state/seed-state.js";

export type AfcLandingFootprintContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  replaceTileState: (tileKey: string, tile: DomainTileState, commandId?: string) => void;
  bumpTerrainEpoch: () => void;
};

/**
 * Prepares the 3x3 footprint an AFC lands on at (x, y): clears its forest
 * (see @border-empires/shared forest-clearing.ts) and flattens every
 * mountain in it to LAND, the same terrain edit REMOVE_MOUNTAIN makes. Placement
 * already guarantees the footprint has no water (hasWaterNeighbor), so
 * flattening mountains here is what lets a site next to one still qualify.
 *
 * Call before the AFC tile itself is written, so the AFC's first vision
 * footprint is computed against the cleared terrain. Returns the flattened
 * tiles so the caller can include them in its TILE_DELTA_BATCH.
 */
export const prepareAfcLandingFootprint = (
  ctx: AfcLandingFootprintContext,
  x: number,
  y: number,
  commandId: string,
  options: { crushNeighbourFeatures?: boolean } = {}
): DomainTileState[] => {
  clearForestAroundAfcTile(x, y);
  const flattened: DomainTileState[] = [];
  let terrainChanged = false;
  for (let dy = -AFC_LANDING_FOOTPRINT_RADIUS; dy <= AFC_LANDING_FOOTPRINT_RADIUS; dy += 1) {
    for (let dx = -AFC_LANDING_FOOTPRINT_RADIUS; dx <= AFC_LANDING_FOOTPRINT_RADIUS; dx += 1) {
      const tileKey = simulationTileKey(wrapX(x + dx, WORLD_WIDTH), wrapY(y + dy, WORLD_HEIGHT));
      const tile = ctx.tiles.get(tileKey);
      if (!tile) continue;
      // Spawn fallback only (no clear site existed): the landing crushes unowned towns and
      // resources on its neighbouring tiles. The landing tile itself is rewritten by the caller.
      const crush = options.crushNeighbourFeatures === true && (dx !== 0 || dy !== 0) && !tile.ownerId && (tile.town || tile.resource);
      if (tile.terrain !== "MOUNTAIN" && !crush) continue;
      const { town: _crushedTown, resource: _crushedResource, ...survivors } = tile;
      const updatedTile: DomainTileState = { ...(crush ? survivors : tile), terrain: tile.terrain === "MOUNTAIN" ? "LAND" : tile.terrain };
      if (updatedTile.terrain !== tile.terrain) terrainChanged = true;
      ctx.replaceTileState(tileKey, updatedTile, commandId);
      flattened.push(updatedTile);
    }
  }
  if (terrainChanged) ctx.bumpTerrainEpoch();
  return flattened;
};
