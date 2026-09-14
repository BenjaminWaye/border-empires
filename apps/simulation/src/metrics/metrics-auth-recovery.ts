// Extracted from metrics.ts (which sits at the repo's 500-line file cap) to make
// room for new metrics without growing that file past the cap.
export const createAuthRecoveryMetrics = () => {
  let simAuthRecoveryRespawnTotal = 0;
  let simAuthRecoveryRespawnGuardedTotal = 0;

  return {
    snapshot: () => ({
      simAuthRecoveryRespawnTotal,
      simAuthRecoveryRespawnGuardedTotal
    }),
    // Fires whenever ensurePlayerHasSpawnTerritory actually places a fresh
    // auth_recovery spawn (i.e. the player read zero territory tiles at
    // subscribe/login time and the world-sanity guard did not suppress it).
    // Every occurrence overwrites the player's prior empire location, so a
    // nonzero rate here is worth alerting on.
    incrementSimAuthRecoveryRespawn(): void {
      simAuthRecoveryRespawnTotal += 1;
    },
    // Fires when the auth_recovery respawn path would have fired but was
    // suppressed because the world-sanity guard could not confirm territory
    // data was actually loaded (ctx.tiles was empty) — see
    // ensurePlayerHasSpawnTerritory in runtime-respawn-helpers.ts.
    incrementSimAuthRecoveryRespawnGuarded(): void {
      simAuthRecoveryRespawnGuardedTotal += 1;
    }
  };
};

export type AuthRecoveryMetrics = ReturnType<typeof createAuthRecoveryMetrics>;
