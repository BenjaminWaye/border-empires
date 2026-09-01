import { describe, expect, it } from "vitest";
import { tileRevisionRelevantChange } from "./client-tile-merge.js";
import type { Tile, TileUpkeepEntry } from "../client-types.js";

const baseTile: Tile = {
  x: 5,
  y: 5,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  fogged: false
};

// Regression for a live bug: comparing the full tile object (including
// yield/yieldRate/yieldCap/upkeepEntries/history, none of which either map
// renderer reads) made a routine economy tick look "changed" on essentially
// every gateway delta, forcing the true-3D renderer's full rebuild loop
// (gated on tilesRevision) almost continuously.
describe("tileRevisionRelevantChange", () => {
  it("is not relevant-changed when only yield/upkeep/history differ", () => {
    const resolved: Tile = {
      ...baseTile,
      yield: { gold: 12 },
      yieldRate: { goldPerMinute: 1 },
      yieldCap: { gold: 100, strategicEach: 0 },
      upkeepEntries: [{ resource: "FOOD", need: 3, satisfied: 3 } as unknown as TileUpkeepEntry],
      history: { previousOwners: ["rival"], captureCount: 1, structureHistory: [] }
    };
    expect(tileRevisionRelevantChange(baseTile, resolved)).toBe(false);
  });

  it("is relevant-changed when ownership differs", () => {
    const resolved: Tile = { ...baseTile, ownerId: "rival" };
    expect(tileRevisionRelevantChange(baseTile, resolved)).toBe(true);
  });

  it("is relevant-changed when there is no existing tile yet", () => {
    expect(tileRevisionRelevantChange(undefined, baseTile)).toBe(true);
  });

  it("does not mutate either input", () => {
    const resolved: Tile = { ...baseTile, yield: { gold: 12 } };
    const existingBefore = JSON.stringify(baseTile);
    const resolvedBefore = JSON.stringify(resolved);
    tileRevisionRelevantChange(baseTile, resolved);
    expect(JSON.stringify(baseTile)).toBe(existingBefore);
    expect(JSON.stringify(resolved)).toBe(resolvedBefore);
  });
});
