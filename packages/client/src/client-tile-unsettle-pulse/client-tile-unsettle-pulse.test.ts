import { describe, expect, it } from "vitest";
import { isReachLossUnsettleTransition, queueReachLossPulse } from "./client-tile-unsettle-pulse.js";
import { createInitialState } from "../client-state/client-state.js";

describe("isReachLossUnsettleTransition", () => {
  it("is true for a SETTLED -> FRONTIER downgrade under the same owner", () => {
    expect(
      isReachLossUnsettleTransition(
        { ownerId: "player-1", ownershipState: "SETTLED" },
        { ownerId: "player-1", ownershipState: "FRONTIER" }
      )
    ).toBe(true);
  });

  it("is false when ownership actually changed hands (a capture, not a reach loss)", () => {
    expect(
      isReachLossUnsettleTransition(
        { ownerId: "player-1", ownershipState: "SETTLED" },
        { ownerId: "player-2", ownershipState: "FRONTIER" }
      )
    ).toBe(false);
  });

  it("is false for any other transition (no previous tile, no downgrade, already FRONTIER, etc.)", () => {
    expect(isReachLossUnsettleTransition(undefined, { ownerId: "player-1", ownershipState: "FRONTIER" })).toBe(false);
    expect(
      isReachLossUnsettleTransition(
        { ownerId: "player-1", ownershipState: "FRONTIER" },
        { ownerId: "player-1", ownershipState: "SETTLED" }
      )
    ).toBe(false);
    expect(
      isReachLossUnsettleTransition(
        { ownerId: "player-1", ownershipState: "SETTLED" },
        { ownerId: "player-1", ownershipState: "SETTLED" }
      )
    ).toBe(false);
  });
});

describe("queueReachLossPulse", () => {
  it("appends a pulse spawn request, capped defensively", () => {
    const state = createInitialState();
    queueReachLossPulse(state, 5, 7);
    expect(state.reachLossPulseQueue).toEqual([{ x: 5, y: 7 }]);
    for (let i = 0; i < 200; i += 1) queueReachLossPulse(state, i, i);
    expect(state.reachLossPulseQueue.length).toBeLessThanOrEqual(64);
  });
});
