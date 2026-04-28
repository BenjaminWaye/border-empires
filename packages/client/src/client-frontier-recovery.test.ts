import { describe, expect, it, vi } from "vitest";

import { sweepExpiredFrontierRecovery } from "./client-frontier-recovery.js";

describe("sweepExpiredFrontierRecovery", () => {
  it("reverts a stale optimistic expand once the frontier sync wait expires", () => {
    const clearOptimisticTileState = vi.fn();
    const dropQueuedTargetKeyIfAbsent = vi.fn();
    const pushFeed = vi.fn();
    const requestViewRefresh = vi.fn();
    const state = {
      frontierSyncWaitUntilByTarget: new Map([["12,18", 1_000]]),
      frontierLateAckUntilByTarget: new Map([["12,18", 1_000]]),
      tiles: new Map([["12,18", { x: 12, y: 18, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", optimisticPending: "expand" }]]),
      actionCurrent: undefined,
      actionTargetKey: "",
      capture: undefined,
      autoSettleTargets: new Set(["12,18"])
    } as any;

    const changed = sweepExpiredFrontierRecovery(
      state,
      {
        clearOptimisticTileState,
        dropQueuedTargetKeyIfAbsent,
        pushFeed,
        requestViewRefresh
      },
      1_500
    );

    expect(changed).toBe(true);
    expect(state.frontierSyncWaitUntilByTarget.has("12,18")).toBe(false);
    expect(state.frontierLateAckUntilByTarget.has("12,18")).toBe(false);
    expect(state.autoSettleTargets.has("12,18")).toBe(false);
    expect(clearOptimisticTileState).toHaveBeenCalledWith("12,18", true);
    expect(dropQueuedTargetKeyIfAbsent).toHaveBeenCalledWith("12,18");
    expect(requestViewRefresh).toHaveBeenCalledWith(1, true);
    expect(pushFeed).toHaveBeenCalledWith(
      "A delayed frontier sync expired locally. Reverting the stuck tile and refreshing nearby state.",
      "combat",
      "warn"
    );
  });

  it("does not revert the tile while that target is still the active frontier action", () => {
    const clearOptimisticTileState = vi.fn();
    const requestViewRefresh = vi.fn();
    const state = {
      frontierSyncWaitUntilByTarget: new Map([["12,18", 1_000]]),
      frontierLateAckUntilByTarget: new Map([["12,18", 1_000]]),
      tiles: new Map([["12,18", { x: 12, y: 18, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", optimisticPending: "expand" }]]),
      actionCurrent: { x: 12, y: 18 },
      actionTargetKey: "12,18",
      capture: undefined,
      autoSettleTargets: new Set()
    } as any;

    const changed = sweepExpiredFrontierRecovery(
      state,
      {
        clearOptimisticTileState,
        dropQueuedTargetKeyIfAbsent: vi.fn(),
        pushFeed: vi.fn(),
        requestViewRefresh
      },
      1_500
    );

    expect(changed).toBe(false);
    expect(clearOptimisticTileState).not.toHaveBeenCalled();
    expect(requestViewRefresh).not.toHaveBeenCalled();
  });
});
