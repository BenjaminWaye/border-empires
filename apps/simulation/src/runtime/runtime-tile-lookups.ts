import type { DomainTileState } from "@border-empires/game-domain";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
import { simulationTileKey } from "../seed-state/seed-state.js";

// Pure tile-map lookups extracted from runtime.ts (over the file-line cap).

/** The live tile states behind `tileKeys`, skipping keys with no tile. */
export function existingTilesForKeys(tiles: ReadonlyMap<string, DomainTileState>, tileKeys: Iterable<string>): DomainTileState[] {
  const result: DomainTileState[] = [];
  for (const key of tileKeys) {
    const tile = tiles.get(key);
    if (tile) result.push(tile);
  }
  return result;
}

/** The existing frontier-neighbour tiles of (x, y). */
export function adjacentTileStates(tiles: ReadonlyMap<string, DomainTileState>, x: number, y: number): DomainTileState[] {
  const result: DomainTileState[] = [];
  forEachFrontierNeighbor(x, y, (nx, ny) => {
    const tile = tiles.get(simulationTileKey(nx, ny));
    if (tile) result.push(tile);
  });
  return result;
}
