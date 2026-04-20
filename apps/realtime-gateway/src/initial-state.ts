import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { fallbackInitialStateFromSeed, type SimulationSeedProfile } from "./seed-fallback.js";

const emptyInitialState = (playerId: string): PlayerSubscriptionSnapshot => ({
  playerId,
  tiles: []
});

export const resolveInitialState = ({
  playerId,
  authoritativeSnapshot,
  cachedSnapshot,
  simulationSeedProfile,
  allowSeedFallback
}: {
  playerId: string;
  authoritativeSnapshot: PlayerSubscriptionSnapshot | undefined;
  cachedSnapshot: PlayerSubscriptionSnapshot | undefined;
  simulationSeedProfile: SimulationSeedProfile;
  allowSeedFallback: boolean;
}): PlayerSubscriptionSnapshot => {
  if (authoritativeSnapshot && authoritativeSnapshot.tiles.length > 0) return authoritativeSnapshot;
  if (cachedSnapshot && cachedSnapshot.tiles.length > 0) return cachedSnapshot;
  if (allowSeedFallback) return fallbackInitialStateFromSeed(playerId, simulationSeedProfile);
  return emptyInitialState(playerId);
};
