import { describe, expect, it } from "vitest";

import {
  BEACON_CADENCE_BOOSTED_BUILDS,
  BEACON_CADENCE_CYCLE_LENGTH,
  beaconCadenceBoostedForPlayer,
  createBeaconCadenceState,
  recordCompletedBuild
} from "./ai-beacon-cadence.js";

describe("beacon cadence", () => {
  it("starts a fresh player boosted (position 0)", () => {
    const state = createBeaconCadenceState();
    expect(beaconCadenceBoostedForPlayer(state, "ai-1")).toBe(true);
  });

  it("stays boosted for BEACON_CADENCE_BOOSTED_BUILDS completed builds, then drops for the 5th", () => {
    const state = createBeaconCadenceState();
    for (let i = 0; i < BEACON_CADENCE_BOOSTED_BUILDS; i += 1) {
      expect(beaconCadenceBoostedForPlayer(state, "ai-1")).toBe(true);
      recordCompletedBuild(state, "ai-1");
    }
    // 4 builds recorded — the 5th build in the cycle must NOT be boosted.
    expect(beaconCadenceBoostedForPlayer(state, "ai-1")).toBe(false);
  });

  it("wraps back to boosted after a full cycle completes", () => {
    const state = createBeaconCadenceState();
    for (let i = 0; i < BEACON_CADENCE_CYCLE_LENGTH; i += 1) recordCompletedBuild(state, "ai-1");
    expect(beaconCadenceBoostedForPlayer(state, "ai-1")).toBe(true);
    // Confirms the cycle actually repeats, not just resets once.
    for (let i = 0; i < BEACON_CADENCE_BOOSTED_BUILDS; i += 1) {
      expect(beaconCadenceBoostedForPlayer(state, "ai-1")).toBe(true);
      recordCompletedBuild(state, "ai-1");
    }
    expect(beaconCadenceBoostedForPlayer(state, "ai-1")).toBe(false);
  });

  it("tracks each player independently", () => {
    const state = createBeaconCadenceState();
    for (let i = 0; i < BEACON_CADENCE_BOOSTED_BUILDS; i += 1) recordCompletedBuild(state, "ai-1");
    expect(beaconCadenceBoostedForPlayer(state, "ai-1")).toBe(false);
    expect(beaconCadenceBoostedForPlayer(state, "ai-2")).toBe(true);
  });

  it("cleans up state once a player wraps back to position 0 (no unbounded growth)", () => {
    const state = createBeaconCadenceState();
    for (let i = 0; i < BEACON_CADENCE_CYCLE_LENGTH; i += 1) recordCompletedBuild(state, "ai-1");
    expect(state.has("ai-1")).toBe(false);
  });
});
