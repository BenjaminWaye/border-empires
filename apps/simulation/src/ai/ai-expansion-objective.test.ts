import { describe, expect, it } from "vitest";
import { selectExpansionObjective } from "./ai-expansion-objective.js";

describe("selectExpansionObjective", () => {
  it("returns undefined when no beacon tiles exist", () => {
    const result = selectExpansionObjective({
      territoryTileKeys: ["10,10", "11,10"],
      neutralBeaconTileKeys: new Set(),
      enemyYieldKeysByPlayerId: new Map(),
      playerId: "ai-1"
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when territory is empty", () => {
    const result = selectExpansionObjective({
      territoryTileKeys: [],
      neutralBeaconTileKeys: new Set(["5,5"]),
      enemyYieldKeysByPlayerId: new Map(),
      playerId: "ai-1"
    });
    expect(result).toBeUndefined();
  });

  it("selects the nearest neutral beacon to territory", () => {
    // ai-1 owns (10,10). Neutral beacons at (12,10) and (20,20).
    // Chebyshev distance: (12,10)→(10,10) = 2, (20,20)→(10,10) = 10
    const result = selectExpansionObjective({
      territoryTileKeys: ["10,10"],
      neutralBeaconTileKeys: new Set(["12,10", "20,20"]),
      enemyYieldKeysByPlayerId: new Map(),
      playerId: "ai-1"
    });
    expect(result).toEqual({ x: 12, y: 10, kind: "neutral_value" });
  });

  it("selects beacon nearest to any owned tile, not just the origin", () => {
    // ai-1 owns (0,0) and (10,10). Beacon at (12,10) is closer to (10,10).
    const result = selectExpansionObjective({
      territoryTileKeys: ["0,0", "10,10"],
      neutralBeaconTileKeys: new Set(["12,10"]),
      enemyYieldKeysByPlayerId: new Map(),
      playerId: "ai-1"
    });
    expect(result).toEqual({ x: 12, y: 10, kind: "neutral_value" });
  });

  it("prefers neutral beacons over enemy beacons when both present", () => {
    const result = selectExpansionObjective({
      territoryTileKeys: ["10,10"],
      neutralBeaconTileKeys: new Set(["15,10"]),
      enemyYieldKeysByPlayerId: new Map([["enemy-1", new Set(["13,10"])]]),
      playerId: "ai-1"
    });
    // Neutral beacon at (15,10) dist=5; enemy at (13,10) dist=3.
    // Should prefer neutral over enemy regardless of distance.
    expect(result?.kind).toBe("neutral_value");
  });

  it("falls back to enemy beacons when no neutral beacons exist", () => {
    const result = selectExpansionObjective({
      territoryTileKeys: ["10,10"],
      neutralBeaconTileKeys: new Set(),
      enemyYieldKeysByPlayerId: new Map([["enemy-1", new Set(["13,10"])]]),
      playerId: "ai-1"
    });
    expect(result).toEqual({ x: 13, y: 10, kind: "enemy" });
  });

  it("excludes self from enemy beacon search", () => {
    const result = selectExpansionObjective({
      territoryTileKeys: ["10,10"],
      neutralBeaconTileKeys: new Set(),
      enemyYieldKeysByPlayerId: new Map([
        ["ai-1", new Set(["11,10"])],
        ["enemy-1", new Set(["15,10"])]
      ]),
      playerId: "ai-1"
    });
    expect(result).toEqual({ x: 15, y: 10, kind: "enemy" });
  });

  it("excludes barbarian players from enemy beacon search", () => {
    const result = selectExpansionObjective({
      territoryTileKeys: ["10,10"],
      neutralBeaconTileKeys: new Set(),
      enemyYieldKeysByPlayerId: new Map([
        ["barbarian-1", new Set(["11,10"])],
        ["enemy-1", new Set(["15,10"])]
      ]),
      playerId: "ai-1"
    });
    expect(result).toEqual({ x: 15, y: 10, kind: "enemy" });
  });

  it("stride-samples large neutral beacon sets to MAX_BEACON_SAMPLE (regression: 3.7s event-loop stall)", () => {
    // 2000 neutral beacons — without stride-sampling this was 2000 × 300
    // = 600k Chebyshev ops per cache miss, causing multi-second event-loop
    // stalls and health-check restarts on staging.
    const beacons = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      beacons.add(`${50 + (i % 400)},${10 + Math.floor(i / 400)}`);
    }
    const start = Date.now();
    const result = selectExpansionObjective({
      territoryTileKeys: ["10,10"],
      neutralBeaconTileKeys: beacons,
      enemyYieldKeysByPlayerId: new Map(),
      playerId: "ai-1"
    });
    const elapsed = Date.now() - start;
    // Must complete in <50ms (was 3000ms+ before the fix)
    expect(elapsed).toBeLessThan(50);
    // Must still return a valid objective pointing to a neutral beacon
    expect(result).toBeDefined();
    expect(result!.kind).toBe("neutral_value");
  });

  it("handles wrap-around distance correctly", () => {
    // World is 450x450. Beacon at x=448 vs beacon at x=5.
    // From territory at x=0: wrap dist to 448 = min(448, 2) = 2; dist to 5 = 5.
    const result = selectExpansionObjective({
      territoryTileKeys: ["0,10"],
      neutralBeaconTileKeys: new Set(["448,10", "5,10"]),
      enemyYieldKeysByPlayerId: new Map(),
      playerId: "ai-1"
    });
    expect(result).toEqual({ x: 448, y: 10, kind: "neutral_value" });
  });
});
