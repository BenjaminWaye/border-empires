import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

export type SeedSnapshotDeps = {
  playerSubscriptions: {
    seedSnapshot: (playerId: string, snapshot: PlayerSubscriptionSnapshot) => void;
  };
  seededPlayerIds: Set<string>;
  recordAuthStepTiming: (step: string, durationMs: number, payload?: Record<string, unknown>) => void;
  recordSnapshotDiagnostics: (
    playerId: string,
    snapshot: PlayerSubscriptionSnapshot,
    options: { trigger: string; fullVisibility: boolean; socketCount: number; payloadJsonBytes: number }
  ) => void;
};

export const seedBootstrapSnapshotWithDiagnostics = (
  deps: SeedSnapshotDeps,
  playerId: string,
  channel: string,
  bootstrapInitialState: PlayerSubscriptionSnapshot,
): void => {
  const seedSnapshotStartedAt = Date.now();
  deps.playerSubscriptions.seedSnapshot(playerId, bootstrapInitialState);
  deps.seededPlayerIds.add(playerId);
  deps.recordAuthStepTiming("seed_snapshot", Date.now() - seedSnapshotStartedAt, {
    playerId,
    channel,
    tileCount: bootstrapInitialState.tiles.length,
  });
  const diagnosticsStartedAt = Date.now();
  deps.recordSnapshotDiagnostics(playerId, bootstrapInitialState, {
    trigger: "gateway_auth_bootstrap",
    fullVisibility: false,
    socketCount: 1,
    payloadJsonBytes: 0,
  });
  deps.recordAuthStepTiming("gateway_snapshot_diagnostics", Date.now() - diagnosticsStartedAt, {
    playerId,
    channel,
    tileCount: bootstrapInitialState.tiles.length,
  });
};
