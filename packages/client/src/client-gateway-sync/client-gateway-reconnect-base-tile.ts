import type { Tile } from "../client-types.js";

/**
 * Base a reconnect INIT snapshot tile is merged onto, in place of the cached
 * tile. A snapshot tile is the server's complete current state for that tile
 * and omits whatever isn't there (no structure, no town, no wreck...), so
 * merging it over the full cached tile let a structure razed while the socket
 * was down (a captured Relay Beacon) survive as "unchanged". Keeping only
 * terrain and the full-detail fields the snapshot never carries gives the same
 * result as a fresh load, while a selected tile's yield/history panel data
 * still carries over exactly as on an ordinary delta (mergeIncomingTileDetail).
 */
export const reconnectSnapshotBaseTile = (cached: Tile): Tile => {
  const base: Tile = { x: cached.x, y: cached.y, terrain: cached.terrain };
  if (cached.landBiome) base.landBiome = cached.landBiome;
  if (cached.regionType) base.regionType = cached.regionType;
  if (cached.detailLevel) base.detailLevel = cached.detailLevel;
  if (cached.dock) base.dock = cached.dock;
  if (cached.yieldRate) base.yieldRate = cached.yieldRate;
  if (cached.upkeepEntries) base.upkeepEntries = cached.upkeepEntries;
  if (cached.history) base.history = cached.history;
  return base;
};
