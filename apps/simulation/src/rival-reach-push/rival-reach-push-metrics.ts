// Counters for rival-reach-push.ts (RIVAL_REACH_UPDATE). Every guard/skip/cap
// path in that module increments one of these — per the repo's "emit a
// counter on every skip/cap" rule, since a silently-dead guard has shipped
// undetected before (PR #439, PR #455 v1).
export const createRivalReachPushMetrics = () => {
  let mutationPushEmittedTotal = 0;
  let pushDedupSkippedTotal = 0;
  let mutationPushNoVisibleOverlapTotal = 0;
  let connectPushEmittedTotal = 0;
  let connectPushOwnersScannedTotal = 0;
  let connectPushNoVisibleOverlapTotal = 0;
  let connectPushTileScanCappedTotal = 0;
  let connectPushFailedTotal = 0;
  let mutationPushFailedTotal = 0;
  let connectPushWallTimeMsTotal = 0;

  return {
    snapshot: () => ({
      mutationPushEmittedTotal,
      pushDedupSkippedTotal,
      mutationPushNoVisibleOverlapTotal,
      connectPushEmittedTotal,
      connectPushOwnersScannedTotal,
      connectPushNoVisibleOverlapTotal,
      connectPushTileScanCappedTotal,
      connectPushFailedTotal,
      mutationPushFailedTotal,
      connectPushWallTimeMsTotal
    }),
    incrementMutationPushEmitted(): void {
      mutationPushEmittedTotal += 1;
    },
    incrementPushDedupSkipped(): void {
      pushDedupSkippedTotal += 1;
    },
    incrementMutationPushNoVisibleOverlap(): void {
      mutationPushNoVisibleOverlapTotal += 1;
    },
    incrementConnectPushEmitted(): void {
      connectPushEmittedTotal += 1;
    },
    incrementConnectPushOwnersScanned(): void {
      connectPushOwnersScannedTotal += 1;
    },
    incrementConnectPushNoVisibleOverlap(): void {
      connectPushNoVisibleOverlapTotal += 1;
    },
    incrementConnectPushTileScanCapped(): void {
      connectPushTileScanCappedTotal += 1;
    },
    incrementConnectPushFailed(): void {
      connectPushFailedTotal += 1;
    },
    incrementMutationPushFailed(): void {
      mutationPushFailedTotal += 1;
    },
    addConnectPushWallTimeMs(ms: number): void {
      connectPushWallTimeMsTotal += ms;
    }
  };
};

export type RivalReachPushMetrics = ReturnType<typeof createRivalReachPushMetrics>;
