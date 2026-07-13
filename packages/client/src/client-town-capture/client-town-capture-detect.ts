import type { Tile } from "../client-types.js";
import { showTownCaptureOverlay, type TownCaptureInfo } from "./client-town-capture.js";

export type TownCaptureUpdate = { x: number; y: number };

/**
 * Scans a TILE_DELTA_BATCH for a tile that just flipped from an enemy/neutral
 * owner to the local player and now carries a town. Shows the capture hero
 * overlay for at most one town per batch (multi-town batches are rare and a
 * single celebratory popup is preferable to several stacking instantly).
 */
export const emitTownCaptureIfCaptured = (
  input: {
    tileUpdates: TownCaptureUpdate[];
    previousOwnerByKey: Map<string, string | undefined>;
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
    if (!tile?.town || tile.ownerId !== input.me) continue;
    const previousOwnerId = input.previousOwnerByKey.get(key);
    if (!previousOwnerId || previousOwnerId === input.me) continue;
    deps.showOverlay({
      x: update.x,
      y: update.y,
      townName: tile.town.name ?? "",
      populationTier: tile.town.populationTier,
      population: tile.town.population,
      maxPopulation: tile.town.maxPopulation,
      empireName: input.meName || "Your Empire",
      ownedTownCount: settledTownCountExcluding(input.tiles, input.me, key),
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
