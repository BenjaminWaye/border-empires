/**
 * Which barbarian tiles can some non-barbarian player currently see?
 *
 * A barbarian tile may act only while it is "seen". This reads the SAME
 * incrementally-maintained coverage the client's fog of war is built from
 * (VisibilityCoverageTracker), so it automatically honours every vision source
 * the player sees: territory radius (tech-scaled), the 1-tile FRONTIER halo,
 * town rings, outposts / relay beacons, observatories, watchtower reveals and
 * allied vision. The previous implementation re-derived vision by hand from
 * territory + radius and missed all of those, and cost ~11ms of main thread per
 * recompute (it scanned every non-barb owned tile).
 *
 * Cost is O(barb tiles x viewers) map lookups with an early exit per tile —
 * bounded by MAX_BARBARIAN_TILES, independent of map and empire size.
 */
export type BarbSeenDeps = {
  /** Territory keys of every barbarian player. */
  readonly barbTileKeys: () => Iterable<string>;
  /** Ids of every non-barbarian player that could be viewing the map. */
  readonly viewerIds: () => Iterable<string>;
  readonly isVisibleTo: (viewerId: string, tileKey: string) => boolean;
};

export const computeBarbTilesSeenByAnyPlayer = (deps: BarbSeenDeps): string[] => {
  const viewerIds = [...deps.viewerIds()];
  const seen: string[] = [];
  if (viewerIds.length === 0) return seen;
  for (const tileKey of deps.barbTileKeys()) {
    for (const viewerId of viewerIds) {
      if (deps.isVisibleTo(viewerId, tileKey)) {
        seen.push(tileKey);
        break;
      }
    }
  }
  return seen;
};

/** Runtime wiring: every barbarian-* player's tiles, checked against every other player's real coverage. */
export const barbTilesSeenByAnyPlayer = (ctx: {
  readonly playerIds: () => Iterable<string>;
  readonly territoryTileKeys: (playerId: string) => ReadonlySet<string>;
  readonly isVisibleTo: (viewerId: string, tileKey: string) => boolean;
}): string[] => {
  const isBarb = (id: string): boolean => id.startsWith("barbarian-");
  return computeBarbTilesSeenByAnyPlayer({
    barbTileKeys: () => [...ctx.playerIds()].filter(isBarb).flatMap((id) => [...ctx.territoryTileKeys(id)]),
    viewerIds: () => [...ctx.playerIds()].filter((id) => !isBarb(id)),
    isVisibleTo: ctx.isVisibleTo
  });
};
