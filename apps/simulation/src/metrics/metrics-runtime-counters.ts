export type RuntimeCounterSnapshot = {
  simMusterRemoteAttackTotal: number;
  simMusterRemoteBlockedTotal: number;
  simMusterRemoteBlockedBarbarianTotal: number;
  simSeasonEndSnapshotWarmTotal: number;
  simSeasonEndSnapshotWarmFailedTotal: number;
  simPostSeasonProtoTileCacheHitTotal: number;
  simPostSeasonProtoTileCacheMissTotal: number;
  simFullVisInlineBuildTotal: number;
  simAutoFillTilesTotal: number;
};

export const createRuntimeCounters = () => {
  let simMusterRemoteAttackTotal = 0;
  let simMusterRemoteBlockedTotal = 0;
  let simMusterRemoteBlockedBarbarianTotal = 0;
  let simSeasonEndSnapshotWarmTotal = 0;
  let simSeasonEndSnapshotWarmFailedTotal = 0;
  let simPostSeasonProtoTileCacheHitTotal = 0;
  let simPostSeasonProtoTileCacheMissTotal = 0;
  let simFullVisInlineBuildTotal = 0;
  let simAutoFillTilesTotal = 0;

  return {
    incrementSimMusterRemoteAttack: (): void => { simMusterRemoteAttackTotal += 1; },
    incrementSimMusterRemoteBlocked: (): void => { simMusterRemoteBlockedTotal += 1; },
    incrementSimMusterRemoteBlockedBarbarian: (): void => { simMusterRemoteBlockedBarbarianTotal += 1; },
    incrementSimSeasonEndSnapshotWarm: (): void => { simSeasonEndSnapshotWarmTotal += 1; },
    incrementSimSeasonEndSnapshotWarmFailed: (): void => { simSeasonEndSnapshotWarmFailedTotal += 1; },
    incrementSimPostSeasonProtoTileCacheHit: (): void => { simPostSeasonProtoTileCacheHitTotal += 1; },
    incrementSimPostSeasonProtoTileCacheMiss: (): void => { simPostSeasonProtoTileCacheMissTotal += 1; },
    incrementSimFullVisInlineBuild: (): void => { simFullVisInlineBuildTotal += 1; },
    incrementSimAutoFillTiles: (count: number): void => { simAutoFillTilesTotal += Math.max(0, count); },
    snapshot: (): RuntimeCounterSnapshot => ({
      simMusterRemoteAttackTotal,
      simMusterRemoteBlockedTotal,
      simMusterRemoteBlockedBarbarianTotal,
      simSeasonEndSnapshotWarmTotal,
      simSeasonEndSnapshotWarmFailedTotal,
      simPostSeasonProtoTileCacheHitTotal,
      simPostSeasonProtoTileCacheMissTotal,
      simFullVisInlineBuildTotal,
      simAutoFillTilesTotal
    })
  };
};
