import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

// Extracted out of gateway-app.ts (already well over the repo's 500-line file
// cap and may not grow -- see AGENTS.md's file-and-type-discipline rule) so
// the merge logic below is independently unit-testable.
export const mergeTileDetailIntoSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  freshTiles: PlayerSubscriptionSnapshot["tiles"],
  upkeepLastTick: NonNullable<PlayerSubscriptionSnapshot["player"]>["upkeepLastTick"] | undefined,
  viewerPlayerId: string
): PlayerSubscriptionSnapshot => {
  if (freshTiles.length === 0 && !upkeepLastTick) return snapshot;
  const tileIndex = new Map<string, number>();
  snapshot.tiles.forEach((tile: PlayerSubscriptionSnapshot["tiles"][number], idx: number) => tileIndex.set(`${tile.x},${tile.y}`, idx));
  const nextTiles = [...snapshot.tiles];
  let appended = false;
  for (const fresh of freshTiles) {
    const key = `${fresh.x},${fresh.y}`;
    const idx = tileIndex.get(key);
    if (typeof idx === "number") {
      const old = nextTiles[idx] as PlayerSubscriptionSnapshot["tiles"][number] & Record<string, unknown>;
      const merged = { ...old, ...fresh } as PlayerSubscriptionSnapshot["tiles"][number] & Record<string, unknown>;
      // `fresh` comes from FetchTileDetail, serialized by the sim's
      // toFullSnapshotProtoTile -- a "no clear-signaling" full-snapshot
      // format whose own doc comment says absent means "not present, never
      // was removed". The spread above is a partial per-tile merge, not a
      // full replacement, so it wrongly reads an absent fresh field as
      // "unchanged" and can never clear a stale truthy one. That left a
      // shard that expired (or was collected) while this tile was outside
      // this player's live vision stuck as a phantom in the cache forever --
      // every REQUEST_TILE_DETAIL re-fetch kept re-serving it, so Collect
      // Shard failed with COLLECT_EMPTY no matter how many times the tile
      // was reselected (see tile-detail-snapshot.ts's shardSiteJson comment
      // for the client-facing half of this).
      //
      // Scoped to the viewer's own tile: shardSite on a tile owned by
      // someone else (or neutral) is subject to per-player reveal gating
      // elsewhere in the sim's projection, where "absent" can legitimately
      // mean "not revealed to you yet" rather than "gone".
      if (merged.ownerId === viewerPlayerId && "shardSiteJson" in old && !("shardSiteJson" in fresh)) {
        merged.shardSiteJson = undefined;
      }
      nextTiles[idx] = merged as typeof nextTiles[number];
    } else {
      nextTiles.push(fresh);
      tileIndex.set(key, nextTiles.length - 1);
      appended = true;
    }
  }
  if (appended) nextTiles.sort((left, right) => (left.x - right.x) || (left.y - right.y));
  const nextPlayer =
    upkeepLastTick && snapshot.player
      ? { ...snapshot.player, upkeepLastTick }
      : snapshot.player;
  return {
    ...snapshot,
    ...(nextPlayer ? { player: nextPlayer } : {}),
    tiles: nextTiles
  };
};
