// Extracted from metrics.ts (which sits at the repo's 500-line file cap) to make
// room for new metrics without growing that file past the cap. Holds the
// spawn-placement counters: auth_recovery respawns and rally-linked spawns.
export const createAuthRecoveryMetrics = () => {
  let simAuthRecoveryRespawnTotal = 0;
  let simAuthRecoveryRespawnGuardedTotal = 0;
  let simRallySpawnTotal = 0;
  let simRallySpawnFallbackTotal = 0;

  return {
    snapshot: () => ({
      simAuthRecoveryRespawnTotal,
      simAuthRecoveryRespawnGuardedTotal,
      simRallySpawnTotal,
      simRallySpawnFallbackTotal
    }),
    // Spread into the simulation metrics object so metrics.ts needs one line for all of these.
    increments: {
      // Fires whenever ensurePlayerHasSpawnTerritory actually places a fresh
      // auth_recovery spawn (i.e. the player read zero territory tiles at
      // subscribe/login time and the world-sanity guard did not suppress it).
      // Every occurrence overwrites the player's prior empire location, so a
      // nonzero rate here is worth alerting on.
      incrementSimAuthRecoveryRespawn: (): void => {
        simAuthRecoveryRespawnTotal += 1;
      },
      // Fires when the auth_recovery respawn path would have fired but was
      // suppressed because the world-sanity guard could not confirm territory
      // data was actually loaded (ctx.tiles was empty) — see
      // ensurePlayerHasSpawnTerritory in runtime-respawn-helpers.ts.
      incrementSimAuthRecoveryRespawnGuarded: (): void => {
        simAuthRecoveryRespawnGuardedTotal += 1;
      },
      // Every rally-linked spawn that was actually placed (the denominator for the fallback counter below).
      incrementSimRallySpawn: (): void => {
        simRallySpawnTotal += 1;
      },
      // A rally-linked spawn landed farther from the inviter than RALLY_SPAWN_RADIUS, so the "spawn next to
      // them" promise was broken. Expected baseline ~0 on a healthy map; a rising ratio to
      // sim_rally_spawn_total means the rally search or the fair-spawn-site claim is missing the anchor.
      incrementSimRallySpawnFallback: (): void => {
        simRallySpawnFallbackTotal += 1;
      }
    }
  };
};

export type AuthRecoveryMetrics = ReturnType<typeof createAuthRecoveryMetrics>;
