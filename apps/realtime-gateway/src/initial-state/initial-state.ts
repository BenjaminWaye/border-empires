import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { fallbackInitialStateFromSeed, type SimulationSeedProfile } from "../seed-fallback.js";

const emptyInitialState = (playerId: string): PlayerSubscriptionSnapshot => ({
  playerId,
  tiles: []
});

const hasAuthoritativeBootstrapData = (snapshot: PlayerSubscriptionSnapshot | undefined): snapshot is PlayerSubscriptionSnapshot =>
  Boolean(snapshot && (snapshot.tiles.length > 0 || snapshot.player || snapshot.worldStatus));

export const resolveInitialState = ({
  playerId,
  authoritativeSnapshot,
  cachedSnapshot,
  simulationSeedProfile,
  allowCachedSnapshotFallback,
  allowSeedFallback
}: {
  playerId: string;
  authoritativeSnapshot: PlayerSubscriptionSnapshot | undefined;
  cachedSnapshot: PlayerSubscriptionSnapshot | undefined;
  simulationSeedProfile: SimulationSeedProfile;
  allowCachedSnapshotFallback: boolean;
  allowSeedFallback: boolean;
}): PlayerSubscriptionSnapshot => {
  if (hasAuthoritativeBootstrapData(authoritativeSnapshot)) return authoritativeSnapshot;
  if (allowCachedSnapshotFallback && hasAuthoritativeBootstrapData(cachedSnapshot)) return cachedSnapshot;
  if (allowSeedFallback) return fallbackInitialStateFromSeed(playerId, simulationSeedProfile);
  return emptyInitialState(playerId);
};
