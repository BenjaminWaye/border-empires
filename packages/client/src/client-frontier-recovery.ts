import type { ClientState } from "./client-state.js";
import type { FeedSeverity, FeedType } from "./client-types.js";

type FrontierRecoveryState = Pick<
  ClientState,
  | "frontierSyncWaitUntilByTarget"
  | "frontierLateAckUntilByTarget"
  | "tiles"
  | "actionCurrent"
  | "actionTargetKey"
  | "capture"
  | "autoSettleTargets"
>;

type SweepFrontierRecoveryDeps = {
  clearOptimisticTileState: (tileKey: string, revert?: boolean) => void;
  dropQueuedTargetKeyIfAbsent: (tileKey: string) => void;
  pushFeed: (message: string, type?: FeedType, severity?: FeedSeverity) => void;
  requestViewRefresh: (radius?: number, force?: boolean) => void;
};

const targetMatchesActiveAction = (
  state: Pick<FrontierRecoveryState, "actionCurrent" | "actionTargetKey" | "capture">,
  tileKey: string
): boolean => {
  if (!tileKey) return false;
  if (state.actionTargetKey === tileKey) return true;
  if (state.actionCurrent && `${state.actionCurrent.x},${state.actionCurrent.y}` === tileKey) return true;
  if (state.capture && `${state.capture.target.x},${state.capture.target.y}` === tileKey) return true;
  return false;
};

export const sweepExpiredFrontierRecovery = (
  state: FrontierRecoveryState,
  deps: SweepFrontierRecoveryDeps,
  now: number = Date.now()
): boolean => {
  const expiredTileKeys: string[] = [];
  for (const [tileKey, waitUntil] of state.frontierSyncWaitUntilByTarget) {
    if (waitUntil <= now) expiredTileKeys.push(tileKey);
  }
  if (expiredTileKeys.length === 0) return false;

  let requestedRefresh = false;
  let revertedAnyTile = false;
  for (const tileKey of expiredTileKeys) {
    state.frontierSyncWaitUntilByTarget.delete(tileKey);
    state.frontierLateAckUntilByTarget.delete(tileKey);
    state.autoSettleTargets.delete(tileKey);
    deps.dropQueuedTargetKeyIfAbsent(tileKey);
    if (targetMatchesActiveAction(state, tileKey)) continue;
    const tile = state.tiles.get(tileKey);
    if (tile?.optimisticPending === "expand") {
      deps.clearOptimisticTileState(tileKey, true);
      revertedAnyTile = true;
    }
    deps.requestViewRefresh(1, true);
    requestedRefresh = true;
  }

  if (revertedAnyTile) {
    deps.pushFeed("A delayed frontier sync expired locally. Reverting the stuck tile and refreshing nearby state.", "combat", "warn");
  } else if (requestedRefresh) {
    deps.pushFeed("A delayed frontier sync expired locally. Refreshing nearby state.", "combat", "warn");
  }
  return requestedRefresh;
};
