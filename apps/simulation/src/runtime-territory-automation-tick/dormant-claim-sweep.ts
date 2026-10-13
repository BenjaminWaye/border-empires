import type { DomainTileState } from "@border-empires/game-domain";

/**
 * Owned tiles whose watchtower is still dormant. Activation used to be skipped
 * by the territory-automation and frontier-auto-heal claim paths, so existing
 * worlds hold claimed-but-never-activated sites. One O(tiles) pass, run once
 * after boot; activation itself is a one-shot no-op once a site is active.
 * Barbarian land is skipped: it is environment.
 *
 * Waystations are deliberately NOT swept. Until snapshot compaction persisted
 * the `waystation` field, every restart reverted activated waystations to
 * dormant, so "owned and dormant" cannot tell a never-activated waystation
 * from one whose activation a restart erased. Sweeping them re-rolled a
 * permanent reward (gold, tech, resource slot, +1000 over-cap manpower) for
 * every owned waystation on every deploy. A re-fired watchtower only grants a
 * temporary reveal, so it is safe to keep sweeping those.
 */
export const dormantOwnedActivatables = (tiles: ReadonlyMap<string, DomainTileState>): Array<{ tileKey: string; ownerId: string }> => {
  const dormant: Array<{ tileKey: string; ownerId: string }> = [];
  for (const [tileKey, tile] of tiles) {
    if (!tile.ownerId || tile.ownerId.startsWith("barbarian-")) continue;
    if (tile.watchtower?.activated === false) dormant.push({ tileKey, ownerId: tile.ownerId });
  }
  return dormant;
};
