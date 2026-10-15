import { describe, expect, it } from "vitest";
import { applyAetherShieldsMessage, createInitialAetherShieldState } from "./client-aether-shield-state.js";

describe("applyAetherShieldsMessage", () => {
  it("stores the server's tower list and bumps the revision", () => {
    const state = createInitialAetherShieldState();
    expect(state.aetherShieldTowers).toBeUndefined();
    expect(applyAetherShieldsMessage(state, { type: "AETHER_SHIELDS", towers: [{ x: 3, y: 4, ownerId: "enemy" }] })).toBe(true);
    expect(state.aetherShieldTowers).toEqual([{ x: 3, y: 4, ownerId: "enemy" }]);
    expect(state.aetherShieldRevision).toBe(1);
    expect(applyAetherShieldsMessage(state, { type: "AETHER_SHIELDS", towers: [] })).toBe(true);
    expect(state.aetherShieldTowers).toEqual([]);
  });

  it("ignores a malformed payload and drops malformed entries", () => {
    const state = createInitialAetherShieldState();
    expect(applyAetherShieldsMessage(state, { type: "AETHER_SHIELDS" })).toBe(false);
    expect(state.aetherShieldTowers).toBeUndefined();
    applyAetherShieldsMessage(state, { type: "AETHER_SHIELDS", towers: [{ x: 1.5, y: 2, ownerId: "a" }, { x: 1, y: 2 }, null, { x: 1, y: 2, ownerId: "b" }] });
    expect(state.aetherShieldTowers).toEqual([{ x: 1, y: 2, ownerId: "b" }]);
  });
});
