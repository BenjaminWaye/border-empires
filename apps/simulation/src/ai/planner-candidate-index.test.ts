import { describe, expect, it } from "vitest";

import type { DomainTileState } from "@border-empires/game-domain";

import { explainFrontierOriginTile, isHotFrontierTile } from "./planner-candidate-index.js";

const tile = (overrides: Partial<DomainTileState> & { x: number; y: number }): DomainTileState => ({
  terrain: "LAND",
  ...overrides
});

describe("explainFrontierOriginTile", () => {
  it("reports hostile_neighbor and identifies the enemy-owned neighbor", () => {
    const tilesByKey = new Map<string, DomainTileState>([
      ["1,1", tile({ x: 1, y: 1, ownerId: "ai-1", ownershipState: "FRONTIER" })],
      ["2,1", tile({ x: 2, y: 1, ownerId: "ai-2", ownershipState: "SETTLED" })]
    ]);
    const result = explainFrontierOriginTile("ai-1", tilesByKey.get("1,1")!, tilesByKey);
    expect(result).toMatchObject({
      key: "1,1",
      currentlyHot: true,
      reason: "hostile_neighbor",
      neighbor: { key: "2,1", ownerId: "ai-2" }
    });
  });

  it("reports strategic_neutral_neighbor for an unowned tile bearing a town", () => {
    const tilesByKey = new Map<string, DomainTileState>([
      ["1,1", tile({ x: 1, y: 1, ownerId: "ai-1", ownershipState: "FRONTIER" })],
      ["2,1", tile({ x: 2, y: 1, town: { type: "MARKET", populationTier: "SETTLEMENT" } })]
    ]);
    const result = explainFrontierOriginTile("ai-1", tilesByKey.get("1,1")!, tilesByKey);
    expect(result).toMatchObject({
      key: "1,1",
      currentlyHot: true,
      reason: "strategic_neutral_neighbor",
      neighbor: { key: "2,1", townType: "MARKET" }
    });
  });

  it("reports not_owned_frontier for a tile that has transitioned to SETTLED — the stale-index signal", () => {
    // Regression target: a tile still present in hotFrontierTileKeys (so it
    // shows up as a frontier-scan origin) but whose live ownershipState has
    // since moved to SETTLED. isHotFrontierTile would return false if
    // recomputed — this is exactly what a stale/unpruned index entry looks
    // like, and is what pins the AI's scan on a tile with nothing left to do.
    const tilesByKey = new Map<string, DomainTileState>([
      ["1,1", tile({ x: 1, y: 1, ownerId: "ai-1", ownershipState: "SETTLED" })],
      ["2,1", tile({ x: 2, y: 1, ownerId: "ai-2", ownershipState: "SETTLED" })]
    ]);
    const result = explainFrontierOriginTile("ai-1", tilesByKey.get("1,1")!, tilesByKey);
    expect(result).toMatchObject({ key: "1,1", currentlyHot: false, reason: "not_owned_frontier" });
    expect(isHotFrontierTile("ai-1", tilesByKey.get("1,1")!, tilesByKey)).toBe(false);
  });

  it("reports none for a genuine frontier tile with no hostile or valuable neutral neighbor", () => {
    const tilesByKey = new Map<string, DomainTileState>([
      ["1,1", tile({ x: 1, y: 1, ownerId: "ai-1", ownershipState: "FRONTIER" })],
      ["2,1", tile({ x: 2, y: 1 })]
    ]);
    const result = explainFrontierOriginTile("ai-1", tilesByKey.get("1,1")!, tilesByKey);
    expect(result).toMatchObject({ key: "1,1", currentlyHot: false, reason: "none" });
  });

  it("prioritizes hostile_neighbor over strategic_neutral_neighbor when both are present", () => {
    const tilesByKey = new Map<string, DomainTileState>([
      ["1,1", tile({ x: 1, y: 1, ownerId: "ai-1", ownershipState: "FRONTIER" })],
      ["0,1", tile({ x: 0, y: 1, town: { type: "MARKET", populationTier: "SETTLEMENT" } })],
      ["2,1", tile({ x: 2, y: 1, ownerId: "ai-2", ownershipState: "SETTLED" })]
    ]);
    const result = explainFrontierOriginTile("ai-1", tilesByKey.get("1,1")!, tilesByKey);
    expect(result.reason).toBe("hostile_neighbor");
  });
});
