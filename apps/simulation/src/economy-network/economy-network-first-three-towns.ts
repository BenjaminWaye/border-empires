// firstThreeTownKeysForPlayer split out of economy-network.ts to keep that
// file under the repo's 500-line cap.

/**
 * Returns the keys of the player's first three settled CITIES (SETTLEMENT
 * tier excluded — see Mercantile Charter's own catalog description, "your
 * first three cities") in the iteration order of the supplied entries — the
 * same semantics as the old implementation that scanned all tiles, but O(3)
 * instead of O(all_map_tiles).
 *
 * The single source of truth for "which towns are the owner's first three":
 * every wire/economy path that needs this set should call through here
 * rather than re-deriving it. A second, independently-drifted
 * implementation (buildFirstThreeTownKeysByPlayer in snapshot-tile-cache.ts
 * — kept separate for its own single-pass-over-every-player perf shape, see
 * its own doc comment) is exactly what let a bare, unnamed starting
 * SETTLEMENT silently occupy a first-three slot ahead of the player's
 * actual named towns: keep both exclusion rules in sync.
 *
 * Callers should pass `summary.ownedTownTierByTile.entries()` (or
 * equivalent) rather than `tiles.values()`, avoiding the full tile-map scan.
 */
export const firstThreeTownKeysForPlayer = (
  _playerId: string,
  ownedSettledTownEntries: Iterable<readonly [string, string | undefined]>
): Set<string> => {
  const result = new Set<string>();
  for (const [key, tier] of ownedSettledTownEntries) {
    if (tier === "SETTLEMENT") continue;
    result.add(key);
    if (result.size >= 3) break;
  }
  return result;
};
