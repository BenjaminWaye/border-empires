import type { Tile } from "../client-types.js";
import { showTownCaptureOverlay, type TownCaptureInfo } from "./client-town-capture.js";

export type TownCaptureUpdate = { x: number; y: number };

/** Snapshot of a tile's owner and town taken before a TILE_DELTA_BATCH is merged in. */
export type PreviousTileSnapshot = { ownerId?: string; town?: Tile["town"] };

/**
 * Scans a TILE_DELTA_BATCH for a tile that just flipped from an enemy/neutral
 * owner to the local player and carried a town, either just before or just
 * after the flip. Capturing a SETTLEMENT-tier town via combat destroys it
 * server-side (its population disperses rather than joining the empire), so
 * the tile can legitimately have no `.town` after the merge even though a
 * real capture just happened — in that case we fall back to the pre-capture
 * snapshot so the popup still fires, just with a "destroyed" presentation.
 * Shows the capture hero overlay for at most one town per batch (multi-town
 * batches are rare and a single celebratory popup is preferable to several
 * stacking instantly).
 */
export const emitTownCaptureIfCaptured = (
  input: {
    tileUpdates: TownCaptureUpdate[];
    previousTileByKey: Map<string, PreviousTileSnapshot | undefined>;
    tiles: Map<string, Tile>;
    me: string;
    meName: string;
    keyFor: (x: number, y: number) => string;
    onJumpToTown: (x: number, y: number) => void;
  },
  deps: { showOverlay: (info: TownCaptureInfo) => void } = { showOverlay: showTownCaptureOverlay }
): void => {
  for (const update of input.tileUpdates) {
    const key = input.keyFor(update.x, update.y);
    const tile = input.tiles.get(key);
    if (tile?.ownerId !== input.me) continue;
    const previous = input.previousTileByKey.get(key);
    if (!previous?.ownerId || previous.ownerId === input.me) continue;
    const survivingTown = tile.town;
    const town = survivingTown ?? previous.town;
    if (!town) continue;
    deps.showOverlay({
      x: update.x,
      y: update.y,
      townName: town.name ?? "",
      populationTier: town.populationTier,
      population: town.population,
      maxPopulation: town.maxPopulation,
      empireName: input.meName || "Your Empire",
      ownedTownCount: settledTownCountExcluding(input.tiles, input.me, key),
      destroyed: !survivingTown,
      onJumpToTown: () => input.onJumpToTown(update.x, update.y)
    });
    return;
  }
};

const settledTownCountExcluding = (tiles: Map<string, Tile>, me: string, excludeKey: string): number => {
  let count = 0;
  for (const [key, tile] of tiles) {
    if (key === excludeKey) continue;
    if (tile.ownerId === me && tile.town && tile.ownershipState === "SETTLED") count += 1;
  }
  return count;
};
