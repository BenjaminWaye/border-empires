import { describe, expect, it } from "vitest";
import { VisibilityCoverageTracker } from "./visibility-coverage-cache.js";
import { syncReachVision, syncReachVisionAlliance } from "./reach-border-vision.js";

const tracker = () =>
  new VisibilityCoverageTracker(40, 40, {
    visionRadiusForPlayer: () => 1,
    getPlayer: (id) => ({ id, allies: new Set<string>() }),
    territoryTileKeysForPlayer: () => new Set<string>(),
    settledTileKeysForPlayer: () => new Set<string>(),
    frontierTileKeysForPlayer: () => new Set<string>()
  });

describe("reach vision", () => {
  it("reveals every authoritative reach tile and exactly one tile beyond its outside edge", () => {
    const coverage = tracker();
    const reach = new Map([["10,10", "player-1"], ["11,10", "player-1"], ["12,10", "player-1"]]);
    syncReachVision(new Map(), reach, reach.keys(), { coverage, viewersForOwner: (ownerId) => [ownerId] });

    expect(coverage.isVisible("player-1", "10,10")).toBe(true);
    expect(coverage.isVisible("player-1", "11,10")).toBe(true);
    expect(coverage.isVisible("player-1", "12,10")).toBe(true);
    expect(coverage.isVisible("player-1", "13,10")).toBe(true);
    expect(coverage.isVisible("player-1", "14,10")).toBe(false);
  });

  it("removes vision immediately when reach retracts, without depending on frontier ownership", () => {
    const coverage = tracker();
    const before = new Map([["10,10", "player-1"]]);
    syncReachVision(new Map(), before, before.keys(), { coverage, viewersForOwner: (ownerId) => [ownerId] });
    expect(coverage.isVisible("player-1", "11,10")).toBe(true);

    syncReachVision(before, new Map(), ["10,10"], { coverage, viewersForOwner: (ownerId) => [ownerId] });
    expect(coverage.isVisible("player-1", "10,10")).toBe(false);
    expect(coverage.isVisible("player-1", "11,10")).toBe(false);
  });

  it("moves the radius-one footprint to the winner when a reach tile is transferred", () => {
    const coverage = tracker();
    const before = new Map([["10,10", "player-1"]]);
    const after = new Map([["10,10", "player-2"]]);
    syncReachVision(new Map(), before, before.keys(), { coverage, viewersForOwner: (ownerId) => [ownerId] });

    syncReachVision(before, after, ["10,10"], { coverage, viewersForOwner: (ownerId) => [ownerId] });
    expect(coverage.isVisible("player-1", "11,10")).toBe(false);
    expect(coverage.isVisible("player-2", "11,10")).toBe(true);
  });

  it("shares the authoritative reach footprint when an alliance forms and removes it when it breaks", () => {
    const coverage = tracker();
    const reach = new Map([["10,10", "player-1"]]);
    syncReachVision(new Map(), reach, reach.keys(), { coverage, viewersForOwner: (ownerId) => [ownerId] });

    syncReachVisionAlliance(reach, "player-1", "player-2", true, coverage);
    expect(coverage.isVisible("player-2", "11,10")).toBe(true);

    syncReachVisionAlliance(reach, "player-1", "player-2", false, coverage);
    expect(coverage.isVisible("player-2", "11,10")).toBe(false);
  });
});
