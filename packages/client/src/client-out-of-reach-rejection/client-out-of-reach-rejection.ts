import type { ClientState } from "../client-state/client-state.js";

export type OutOfReachRejectionState = Pick<
  ClientState,
  "lastDevelopmentAttempt" | "actionTargetKey" | "autoSettleTargets" | "autoBuildTargets" | "queuedDevelopmentDispatchPending"
>;

export type OutOfReachRejectionDeps = {
  clearOptimisticTileState: (tileKey: string, revert: boolean) => void;
  clearSettlementProgress: (tileKey: string) => void;
};

/**
 * Releases the garrison (or build) an OUT_OF_REACH refusal belongs to.
 *
 * "Build" on an owned FRONTIER tile queues `autoBuildTargets` and sends SETTLE
 * first (client-action-flow.ts handleBuildAction). When the sim refused that
 * SETTLE as OUT_OF_REACH, nothing cleared the queued build, so the tile was
 * stuck on "Build already queued" with every slot free until a reload
 * (2026-11 staging playtest, tile 573,300).
 *
 * The refusal carries no x/y. A SETTLE attempt is matched on `errorTileKey`
 * (which falls back to the latest SETTLE target); a BUILD attempt is taken as
 * the refused command only when no frontier action is in flight, since EXPAND
 * can be refused OUT_OF_REACH too. Returns the tile key released, if any.
 */
export const releaseDevelopmentRefusedOutOfReach = (
  state: OutOfReachRejectionState,
  errorTileKey: string,
  deps: OutOfReachRejectionDeps
): string | undefined => {
  const attempt = state.lastDevelopmentAttempt;
  if (!attempt) return undefined;
  const matches = attempt.kind === "SETTLE" ? attempt.tileKey === errorTileKey : !state.actionTargetKey;
  if (!matches) return undefined;
  const tileKey = attempt.tileKey;
  deps.clearOptimisticTileState(tileKey, true);
  if (attempt.kind === "SETTLE") deps.clearSettlementProgress(tileKey);
  state.autoSettleTargets.delete(tileKey);
  state.autoBuildTargets.delete(tileKey);
  state.queuedDevelopmentDispatchPending = false;
  state.lastDevelopmentAttempt = undefined;
  return tileKey;
};
