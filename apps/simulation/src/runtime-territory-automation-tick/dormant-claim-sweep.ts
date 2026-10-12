import type { DomainTileState } from "@border-empires/game-domain";

/**
 * Owned tiles whose waystation/watchtower is still dormant. Activation used to
 * be skipped by the territory-automation and frontier-auto-heal claim paths, so
 * existing worlds hold claimed-but-never-activated sites. One O(tiles) pass, run
 * once after boot; activation itself is a one-shot no-op once a site is active.
 * Barbarian land is skipped: it is environment, and barbarians are never
 * granted waystation bonuses.
 */
export const dormantOwnedActivatables = (tiles: ReadonlyMap<string, DomainTileState>): Array<{ tileKey: string; ownerId: string }> => {
  const dormant: Array<{ tileKey: string; ownerId: string }> = [];
  for (const [tileKey, tile] of tiles) {
    if (!tile.ownerId || tile.ownerId.startsWith("barbarian-")) continue;
    if (tile.waystation?.activated === false || tile.watchtower?.activated === false) dormant.push({ tileKey, ownerId: tile.ownerId });
  }
  return dormant;
};
