import { flushReachUpdates, type ReachUpdateContext, type ReachUpdateState } from "./runtime-reach-update.js";
import { flushContestedTileReachUpdates, type ReachContestedFlushContext } from "./runtime-reach-contested-flush.js";
import type { ReachContestedDirtyState } from "./runtime-reach-contested-tiles.js";

/**
 * Single call-site combining both reach-change pushes the runtime fires on
 * every command boundary: the per-player REACH_UPDATE list (runtime-reach-
 * update.ts) and the contested-tile TILE_DELTA_BATCH re-broadcast (runtime-
 * reach-contested-tiles.ts / runtime-reach-contested-flush.ts). Kept as one
 * function purely so the runtime's own `flushReachUpdatesForCommand` stays a
 * one-line delegator instead of growing the already-oversized runtime class.
 */
export type ReachFlushAllContext<TTile, TDelta> = ReachUpdateContext & ReachContestedFlushContext<TTile, TDelta>;

export const flushAllReachUpdates = <TTile, TDelta>(
  reachUpdateState: ReachUpdateState,
  contestedDirtyState: ReachContestedDirtyState,
  context: ReachFlushAllContext<TTile, TDelta>,
  causeCommandId: string
): void => {
  flushReachUpdates(reachUpdateState, context, causeCommandId);
  flushContestedTileReachUpdates(contestedDirtyState, context, causeCommandId);
};
