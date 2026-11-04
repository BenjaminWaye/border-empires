import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

// Extracted out of gateway-app.ts (already well over the repo's 500-line file
// cap and may not grow -- see AGENTS.md's file-and-type-discipline rule) so
// the merge logic below is independently unit-testable.
export const mergeTileDetailIntoSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  freshTiles: PlayerSubscriptionSnapshot["tiles"],
  upkeepLastTick: NonNullable<PlayerSubscriptionSnapshot["player"]>["upkeepLastTick"] | undefined
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
      nextTiles[idx] = { ...nextTiles[idx], ...fresh };
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
