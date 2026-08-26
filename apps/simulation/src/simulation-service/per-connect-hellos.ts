/**
 * Per-connect "hello" pushes for a preparing player.
 *
 * Each push is isolated so one failing does not block the others or fail the
 * whole PreparePlayer call. The reach resend is forced rather than
 * change-filtered (runtime-reach-update.ts): the border usually matches what
 * this player was last sent, but a freshly connected client has never seen it
 * and needs the authoritative set immediately — without it the client falls
 * back to its own approximation, which is what let the visible border disagree
 * with what the server would actually allow.
 *
 * The dev-queue drain kick covers the same class of gap for SETTLE/BUILD
 * queue entries: draining (tryDrainDevQueue, runtime-dev-queue-command-handlers.ts)
 * is otherwise purely event-driven off settle/build completion, so a dev
 * slot that freed up while this player was disconnected would otherwise
 * leave their next queued entry stalled until some unrelated completion
 * happens to trigger a drain.
 *
 * The resource-slot cache refresh forces one fresh supply/demand/dormancy
 * recompute for the connecting player, straight from live tile state,
 * bypassing every resource-slot cache (see refreshResourceSlotCachesForPlayer,
 * runtime.ts). Those caches only get invalidated by that player's own tile
 * changes, so a value that went wrong with no tile change to bust it would
 * otherwise stay wrong indefinitely with no way for the player to fix it
 * themselves. This runs once per connect, not on any hot per-tick path, so it
 * costs nothing beyond what a login already costs.
 */
export type PerConnectHelloRuntime = {
  emitShardRainHelloFor: (playerId: string) => void;
  resendReachForPlayer: (playerId: string) => void;
  drainDevQueueForPlayer: (playerId: string) => void;
  refreshResourceSlotCachesForPlayer: (playerId: string) => void;
};

export type PerConnectHelloLog = {
  error: (payload: Record<string, unknown>, message: string) => void;
};

export const emitPerConnectHellos = (
  runtime: PerConnectHelloRuntime,
  playerId: string,
  log: PerConnectHelloLog
): void => {
  const hellos: Array<[string, () => void]> = [
    ["shard rain hello", () => runtime.emitShardRainHelloFor(playerId)],
    ["reach resend", () => runtime.resendReachForPlayer(playerId)],
    ["dev queue drain", () => runtime.drainDevQueueForPlayer(playerId)],
    ["resource slot cache refresh", () => runtime.refreshResourceSlotCachesForPlayer(playerId)]
  ];
  for (const [label, hello] of hellos) {
    try {
      hello();
    } catch (error) {
      log.error({ err: error, playerId }, `${label} failed`);
    }
  }
};
