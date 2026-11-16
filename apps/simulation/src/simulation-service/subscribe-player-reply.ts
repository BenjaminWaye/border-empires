import type { ExploredTilesRuns } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

type SubscribePlayer = NonNullable<PlayerSubscriptionSnapshot["player"]>;

/**
 * Adds the player's server-held explored-tile memory to a SubscribePlayer
 * reply. Applied to the reply only, after any snapshot-cache lookup, so a
 * cached snapshot can never serve stale fog memory and the cache itself never
 * carries it (explored-tiles-store.ts).
 */
export const withExploredTiles = (player: SubscribePlayer, exploredTiles: ExploredTilesRuns | undefined): SubscribePlayer =>
  exploredTiles ? { ...player, exploredTiles } : player;

/** DEBUG_SIM_SUBSCRIBE=1 size line for one SubscribePlayer reply. */
export const logDebugSubscribePlayer = (
  log: Pick<Console, "info">,
  playerId: string,
  snapshotPayload: Pick<PlayerSubscriptionSnapshot, "tiles">
): void => {
  if (process.env.DEBUG_SIM_SUBSCRIBE !== "1") return;
  log.info(
    JSON.stringify({
      type: "debug_subscribe_player",
      playerId,
      runtimeTiles: snapshotPayload.tiles.length,
      snapshotTiles: snapshotPayload.tiles.length,
      snapshotLength: JSON.stringify(snapshotPayload).length
    })
  );
};
