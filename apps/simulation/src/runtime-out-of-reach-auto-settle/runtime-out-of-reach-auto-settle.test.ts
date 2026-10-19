import { describe, expect, it } from "vitest";
import { capturedTileWillAutoSettle } from "./runtime-out-of-reach-auto-settle.js";

const base = {
  playerId: "player-1",
  isAnchorStructureTile: true,
  hasCapturedBuilding: false,
  targetBeyondReach: true,
  canAutoSettleCapturedAnchor: () => true
};

describe("capturedTileWillAutoSettle and the towns auto-settle opt-in", () => {
  it("auto-settles a captured out-of-reach anchor when the player allows towns (or has no prefs)", () => {
    expect(capturedTileWillAutoSettle(base)).toBe(true);
    expect(capturedTileWillAutoSettle({ ...base, isAnchorAutoSettleAllowed: () => true })).toBe(true);
  });

  it("leaves a captured anchor FRONTIER when the player opted out of towns", () => {
    expect(capturedTileWillAutoSettle({ ...base, isAnchorAutoSettleAllowed: () => false })).toBe(false);
  });

  it("does not auto-settle a captured anchor inside reach (the player can SETTLE it by hand)", () => {
    expect(capturedTileWillAutoSettle({ ...base, targetBeyondReach: false })).toBe(false);
  });

  it("still auto-settles captured buildings: the towns toggle governs anchors only", () => {
    expect(
      capturedTileWillAutoSettle({ ...base, isAnchorStructureTile: false, hasCapturedBuilding: true, isAnchorAutoSettleAllowed: () => false })
    ).toBe(true);
  });
});
