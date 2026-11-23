import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import type { FogMemory } from "../runtime/runtime-snapshot-sidecars.js";

type SubscribePlayer = NonNullable<PlayerSubscriptionSnapshot["player"]>;

/**
 * Adds the player's server-held fog memory to a SubscribePlayer reply: explored tiles
 * (explored-tiles-store.ts) and the land they lost with who took it. Applied to the reply only, after any
 * snapshot-cache lookup, so a cached snapshot can never serve stale fog memory and the cache itself never
 * carries it.
 */
export const withFogMemory = (player: SubscribePlayer, memory: FogMemory): SubscribePlayer => ({
  ...player,
  ...(memory.exploredTiles ? { exploredTiles: memory.exploredTiles } : {}),
  ...(memory.lostTiles.length > 0 ? { lostTiles: memory.lostTiles } : {})
});

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
