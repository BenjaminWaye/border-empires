import { describe, expect, it } from "vitest";

import {
  clearAllAiLatchedIntents,
  createAiIntentLatchState,
  latchAiIntent,
  probeAiLatchedIntent,
  releaseAiLatchedIntent,
  reserveAiTarget,
  reservationHeldByOtherAi
} from "./intent-latch.js";

describe("AI intent latch", () => {
  it("holds a reservation for the owning AI until it expires", () => {
    const state = createAiIntentLatchState();
    expect(
      reserveAiTarget(
        state,
        { playerId: "ai-1", actionKey: "claim_neutral_border_tile", tileKey: "4,7", createdAt: 100, wakeAt: 500 },
        100
      )
    ).toBe(true);
    expect(reservationHeldByOtherAi(state, "ai-2", "4,7", 200)).toBe(true);
    expect(reservationHeldByOtherAi(state, "ai-2", "4,7", 600)).toBe(false);
  });

  it("returns waiting while the latch is still valid", () => {
    const state = createAiIntentLatchState();
    reserveAiTarget(
      state,
      { playerId: "ai-1", actionKey: "settle_owned_frontier_tile", tileKey: "9,2", createdAt: 100, wakeAt: 700 },
      100
    );
    latchAiIntent(state, {
      playerId: "ai-1",
      actionKey: "settle_owned_frontier_tile",
      kind: "settlement",
      startedAt: 100,
      wakeAt: 700,
      territoryVersion: 4,
      targetTileKey: "9,2"
    });

    expect(
      probeAiLatchedIntent(state, {
        playerId: "ai-1",
        nowMs: 300,
        territoryVersion: 4,
        targetStillValid: () => true
      })
    ).toEqual({
      status: "waiting",
      intent: expect.objectContaining({
        playerId: "ai-1",
        actionKey: "settle_owned_frontier_tile",
        targetTileKey: "9,2"
      })
    });
  });

  it("invalidates the latch when the territory version changes", () => {
    const state = createAiIntentLatchState();
    reserveAiTarget(
      state,
      { playerId: "ai-1", actionKey: "claim_neutral_border_tile", tileKey: "5,5", createdAt: 100, wakeAt: 700 },
      100
    );
    latchAiIntent(state, {
      playerId: "ai-1",
      actionKey: "claim_neutral_border_tile",
      kind: "frontier",
      startedAt: 100,
      wakeAt: 700,
      territoryVersion: 9,
      targetTileKey: "5,5"
    });

    expect(
      probeAiLatchedIntent(state, {
        playerId: "ai-1",
        nowMs: 200,
        territoryVersion: 10,
        targetStillValid: () => true
      })
    ).toEqual({
      status: "invalidated",
      reason: "territory_version_changed"
    });
    expect(reservationHeldByOtherAi(state, "ai-2", "5,5", 200)).toBe(false);
  });

  it("invalidates the latch when the target is no longer valid", () => {
    const state = createAiIntentLatchState();
    reserveAiTarget(
      state,
      { playerId: "ai-1", actionKey: "build_fort_on_exposed_tile", tileKey: "6,3", createdAt: 100, wakeAt: 700 },
      100
    );
    latchAiIntent(state, {
      playerId: "ai-1",
      actionKey: "build_fort_on_exposed_tile",
      kind: "structure",
      startedAt: 100,
      wakeAt: 700,
      territoryVersion: 3,
      targetTileKey: "6,3"
    });

    expect(
      probeAiLatchedIntent(state, {
        playerId: "ai-1",
        nowMs: 300,
        territoryVersion: 3,
        targetStillValid: () => false
      })
    ).toEqual({
      status: "invalidated",
      reason: "target_no_longer_valid"
    });
  });

  it("releases reservations when clearing a player latch or resetting state", () => {
    const state = createAiIntentLatchState();
    reserveAiTarget(
      state,
      { playerId: "ai-1", actionKey: "attack_enemy_border_tile", tileKey: "8,8", createdAt: 100, wakeAt: 700 },
      100
    );
    latchAiIntent(state, {
      playerId: "ai-1",
      actionKey: "attack_enemy_border_tile",
      kind: "frontier",
      startedAt: 100,
      wakeAt: 700,
      territoryVersion: 12,
      targetTileKey: "8,8"
    });

    releaseAiLatchedIntent(state, "ai-1");
    expect(reservationHeldByOtherAi(state, "ai-2", "8,8", 200)).toBe(false);

    reserveAiTarget(
      state,
      { playerId: "ai-3", actionKey: "claim_neutral_border_tile", tileKey: "2,2", createdAt: 100, wakeAt: 700 },
      100
    );
    clearAllAiLatchedIntents(state);
    expect(state.intentsByPlayer.size).toBe(0);
    expect(state.reservationsByTile.size).toBe(0);
  });
});
