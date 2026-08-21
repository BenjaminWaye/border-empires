/**
 * Tracks a per-player repeating build cadence used to bias BUILD_BEACON.
 *
 * Confirmed design (see docs/ai-structure-building-rewrite-plan.md's §16):
 * for BEACON_CADENCE_BOOSTED_BUILDS (4) consecutive completed structure
 * builds, scoreBuildBeacon (utility/decisions.ts) gets a strong additive
 * boost on top of its normal graduated site-value consideration; the next
 * build in the cycle (the 5th) uses the plain score with no boost, then the
 * cycle repeats. "Completed" means a BUILD_FORT/BUILD_SIEGE_OUTPOST/
 * BUILD_ECONOMIC_STRUCTURE command was accepted (not rejected) — counting at
 * acceptance, not construction finish (which can be minutes later), so the
 * cadence tracks build ACTIONS the AI actually took, not slow real-time
 * completion. Every build type counts toward the cadence, including beacons
 * themselves, so a beacon-heavy stretch still advances the cycle normally.
 *
 * Mirrors ai-rejection-cooldown.ts's per-player Map<playerId, ...> shape:
 * real, small, bounded state living in the same worker process
 * (ai-command-producer.ts), not a snapshot/persistence concern — a lost
 * cadence position on restart just resets a player to the start of a cycle,
 * which is harmless.
 */

export const BEACON_CADENCE_BOOSTED_BUILDS = 4;
export const BEACON_CADENCE_CYCLE_LENGTH = BEACON_CADENCE_BOOSTED_BUILDS + 1;

/** Position within the current cycle (0..BEACON_CADENCE_CYCLE_LENGTH-1), keyed by playerId. Absent means position 0 (boosted). */
export type BeaconCadenceState = Map<string, number>;

export const createBeaconCadenceState = (): BeaconCadenceState => new Map();

export const recordCompletedBuild = (state: BeaconCadenceState, playerId: string): void => {
  const position = (state.get(playerId) ?? 0) + 1;
  // Wraps back to position 0 (boosted) after the cycle's 5th build — delete
  // rather than set(0) so the map only ever holds players mid-cycle,
  // matching ai-rejection-cooldown.ts's "delete when back to the no-op
  // state" cleanup pattern instead of accumulating zero entries forever.
  if (position >= BEACON_CADENCE_CYCLE_LENGTH) state.delete(playerId);
  else state.set(playerId, position);
};

export const beaconCadenceBoostedForPlayer = (state: BeaconCadenceState, playerId: string): boolean =>
  (state.get(playerId) ?? 0) < BEACON_CADENCE_BOOSTED_BUILDS;
