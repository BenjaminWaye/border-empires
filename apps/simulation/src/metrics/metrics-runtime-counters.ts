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
  simGuestJoinRejectedFullTotal: number;
  simGuestUpgradedTotal: number;
  simSeasonGuestPlayers: number;
};

// `increments` is spread straight into the simulation metrics object, so a
// new runtime counter only needs adding here plus the sample type and the
// Prometheus output — not threading through metrics.ts by hand.
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
  let simGuestJoinRejectedFullTotal = 0;
  let simGuestUpgradedTotal = 0;
  let simSeasonGuestPlayers = 0;

  return {
    increments: {
      incrementSimMusterRemoteAttack: (): void => { simMusterRemoteAttackTotal += 1; },
      incrementSimMusterRemoteBlocked: (): void => { simMusterRemoteBlockedTotal += 1; },
      incrementSimMusterRemoteBlockedBarbarian: (): void => { simMusterRemoteBlockedBarbarianTotal += 1; },
      incrementSimSeasonEndSnapshotWarm: (): void => { simSeasonEndSnapshotWarmTotal += 1; },
      incrementSimSeasonEndSnapshotWarmFailed: (): void => { simSeasonEndSnapshotWarmFailedTotal += 1; },
      incrementSimPostSeasonProtoTileCacheHit: (): void => { simPostSeasonProtoTileCacheHitTotal += 1; },
      incrementSimPostSeasonProtoTileCacheMiss: (): void => { simPostSeasonProtoTileCacheMissTotal += 1; },
      incrementSimFullVisInlineBuild: (): void => { simFullVisInlineBuildTotal += 1; },
      incrementSimAutoFillTiles: (count: number): void => { simAutoFillTilesTotal += Math.max(0, count); },
      incrementSimGuestJoinRejectedFull: (): void => { simGuestJoinRejectedFullTotal += 1; },
      incrementSimGuestUpgraded: (): void => { simGuestUpgradedTotal += 1; },
      setSimSeasonGuestPlayers: (count: number): void => { simSeasonGuestPlayers = Math.max(0, count); }
    },
    snapshot: (): RuntimeCounterSnapshot => ({
      simMusterRemoteAttackTotal,
      simMusterRemoteBlockedTotal,
      simMusterRemoteBlockedBarbarianTotal,
      simSeasonEndSnapshotWarmTotal,
      simSeasonEndSnapshotWarmFailedTotal,
      simPostSeasonProtoTileCacheHitTotal,
      simPostSeasonProtoTileCacheMissTotal,
      simFullVisInlineBuildTotal,
      simAutoFillTilesTotal,
      simGuestJoinRejectedFullTotal,
      simGuestUpgradedTotal,
      simSeasonGuestPlayers
    })
  };
};
