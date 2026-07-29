import { describe, expect, it } from "vitest";
import { sampleEnemyYieldKeysAcrossPlayers, selectExpansionObjective } from "./ai-expansion-objective.js";

// Convenience matching the pre-2026-07-29 test shape: builds the sampled pool
// from a plain per-player map, same as buildRuntimePlannerPlayerViews does
// once per sync batch (not once per player, as it used to).
const sampled = (byPlayerId: Record<string, string[]>) =>
  sampleEnemyYieldKeysAcrossPlayers(new Map(Object.entries(byPlayerId).map(([id, keys]) => [id, new Set(keys)])));

describe("selectExpansionObjective", () => {
  it("returns undefined when no beacon tiles exist", () => {
    const result = selectExpansionObjective({
      territoryTileKeys: ["10,10", "11,10"],
      neutralBeaconTileKeys: new Set(),
      sampledEnemyYieldKeys: [],
      playerId: "ai-1"
    });
    expect(result).toBeUndefined();
  });

  it("returns undefined when territory is empty", () => {
    const result = selectExpansionObjective({
      territoryTileKeys: [],
      neutralBeaconTileKeys: new Set(["5,5"]),
      sampledEnemyYieldKeys: [],
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
      sampledEnemyYieldKeys: [],
      playerId: "ai-1"
    });
    expect(result).toEqual({ x: 12, y: 10, kind: "neutral_value" });
  });

  it("selects beacon nearest to any owned tile, not just the origin", () => {
    // ai-1 owns (0,0) and (10,10). Beacon at (12,10) is closer to (10,10).
    const result = selectExpansionObjective({
      territoryTileKeys: ["0,0", "10,10"],
      neutralBeaconTileKeys: new Set(["12,10"]),
      sampledEnemyYieldKeys: [],
      playerId: "ai-1"
    });
    expect(result).toEqual({ x: 12, y: 10, kind: "neutral_value" });
  });

  it("prefers neutral beacons over enemy beacons when both present", () => {
    const result = selectExpansionObjective({
      territoryTileKeys: ["10,10"],
      neutralBeaconTileKeys: new Set(["15,10"]),
      sampledEnemyYieldKeys: sampled({ "enemy-1": ["13,10"] }),
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
      sampledEnemyYieldKeys: sampled({ "enemy-1": ["13,10"] }),
      playerId: "ai-1"
    });
    expect(result).toEqual({ x: 13, y: 10, kind: "enemy" });
  });

  it("excludes self from enemy beacon search", () => {
    const result = selectExpansionObjective({
      territoryTileKeys: ["10,10"],
      neutralBeaconTileKeys: new Set(),
      sampledEnemyYieldKeys: sampled({ "ai-1": ["11,10"], "enemy-1": ["15,10"] }),
      playerId: "ai-1"
    });
    expect(result).toEqual({ x: 15, y: 10, kind: "enemy" });
  });

  it("excludes barbarian players from enemy beacon search", () => {
    const result = selectExpansionObjective({
      territoryTileKeys: ["10,10"],
      neutralBeaconTileKeys: new Set(),
      sampledEnemyYieldKeys: sampled({ "barbarian-1": ["11,10"], "enemy-1": ["15,10"] }),
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
      sampledEnemyYieldKeys: [],
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
      sampledEnemyYieldKeys: [],
      playerId: "ai-1"
    });
    expect(result).toEqual({ x: 448, y: 10, kind: "neutral_value" });
  });
});

describe("sampleEnemyYieldKeysAcrossPlayers", () => {
  it("excludes barbarians but keeps every other player's tiles, tagged with owner", () => {
    const result = sampleEnemyYieldKeysAcrossPlayers(new Map([
      ["ai-1", new Set(["1,1"])],
      ["ai-2", new Set(["2,2"])],
      ["barbarian-1", new Set(["3,3"])]
    ]));
    expect(result).toEqual(expect.arrayContaining([
      { key: "1,1", ownerId: "ai-1" },
      { key: "2,2", ownerId: "ai-2" }
    ]));
    expect(result.some((e) => e.ownerId === "barbarian-1")).toBe(false);
  });

  it(
    "stride-samples across a large multi-player pool in well under a second " +
      "(regression: this used to be rebuilt from scratch by every player in a sync batch)",
    () => {
      const byPlayerId = new Map<string, Set<string>>();
      // 20 players x 3000 yield-bearing tiles each = 60,000 total — a
      // realistic late-game shape (see the ai_export_planner_player_views
      // production capture this pins).
      for (let p = 0; p < 20; p++) {
        const keys = new Set<string>();
        for (let i = 0; i < 3000; i++) keys.add(`${i % 400},${p * 20 + Math.floor(i / 400)}`);
        byPlayerId.set(`ai-${p}`, keys);
      }
      const start = Date.now();
      const result = sampleEnemyYieldKeysAcrossPlayers(byPlayerId);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
      expect(result.length).toBeLessThanOrEqual(300);
    }
  );
});
