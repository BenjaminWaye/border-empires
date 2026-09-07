import type { ClientShardRainAlert } from "../client-shard-alert/client-shard-alert.js";

/**
 * Shard Rain client-render state, extracted out of client-state.ts (already
 * at the file-line cap) so new fields don't grow that file. `shardRainStatus`
 * survives toast dismissal, unlike `shardAlert` — see client-shard-alert.ts.
 */
export const createInitialShardRainState = () => ({
  shardRainPingsByTile: new Map<string, { x: number; y: number; createdAt: number; activateAt: number }>(),
  shardRainFxUntil: 0,
  shardAlert: undefined as ClientShardRainAlert | undefined,
  shardRainStatus: undefined as ClientShardRainAlert | undefined
});
