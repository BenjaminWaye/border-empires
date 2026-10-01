import { describe, expect, it } from "vitest";
import { capturedTileWillAutoSettle } from "./runtime-out-of-reach-auto-settle.js";

const base = {
  playerId: "player-1",
  isAnchorStructureTile: true,
  hasCapturedBuilding: false,
  outOfReachDecayAt: 5_000,
  canAutoSettleCapturedAnchor: () => true
};

describe("capturedTileWillAutoSettle and the towns auto-settle opt-in", () => {
  it("auto-settles a captured out-of-reach anchor when the player allows towns (or has no prefs)", () => {
    expect(capturedTileWillAutoSettle(base)).toBe(true);
    expect(capturedTileWillAutoSettle({ ...base, isAnchorAutoSettleAllowed: () => true })).toBe(true);
  });

  it("leaves a captured anchor FRONTIER (falls back to the decay path) when the player opted out of towns", () => {
    expect(capturedTileWillAutoSettle({ ...base, isAnchorAutoSettleAllowed: () => false })).toBe(false);
  });

  it("still auto-settles captured buildings: the towns toggle governs anchors only", () => {
    expect(
      capturedTileWillAutoSettle({ ...base, isAnchorStructureTile: false, hasCapturedBuilding: true, isAnchorAutoSettleAllowed: () => false })
    ).toBe(true);
  });
});
