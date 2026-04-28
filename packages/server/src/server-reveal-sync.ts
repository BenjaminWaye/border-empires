import type { Tile, TileKey } from "@border-empires/shared";

export interface BuildForcedRevealTileUpdatesDeps {
  parseKey: (tileKey: TileKey) => [number, number];
  playerTile: (x: number, y: number) => Tile;
}

export interface SyncForcedRevealTileUpdatesDeps extends BuildForcedRevealTileUpdatesDeps {
  sendBulkToPlayer: (playerId: string, payload: { type: "TILE_DELTA"; updates: Tile[] }) => void;
}

export const buildForcedRevealTileUpdates = (
  tileKeys: Iterable<TileKey>,
  deps: BuildForcedRevealTileUpdatesDeps
): Tile[] => {
  const updates: Tile[] = [];
  const seen = new Set<TileKey>();
  for (const tileKey of tileKeys) {
    if (seen.has(tileKey)) continue;
    seen.add(tileKey);
    const [x, y] = deps.parseKey(tileKey);
    updates.push({ ...deps.playerTile(x, y), fogged: false });
  }
  return updates;
};

export const syncForcedRevealTileUpdatesForPlayer = (
  playerId: string,
  tileKeys: Iterable<TileKey>,
  deps: SyncForcedRevealTileUpdatesDeps
): Tile[] => {
  const updates = buildForcedRevealTileUpdates(tileKeys, deps);
  if (updates.length === 0) return updates;
  deps.sendBulkToPlayer(playerId, { type: "TILE_DELTA", updates });
  return updates;
};
