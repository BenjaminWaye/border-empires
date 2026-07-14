import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";

import { buildDockLinksByDockTileKey } from "../dock-network/dock-network.js";
import {
  analyzeOwnedFrontierTargetsFromLookup,
  chooseNextOwnedFrontierCommandFromTiles
} from "./frontier-command-planner.js";

describe("frontier command planner", () => {
  it("skips barrier tiles when choosing the next expand target", () => {
    const command = chooseNextOwnedFrontierCommandFromTiles(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1" },
        { x: 9, y: 10, terrain: "SEA" },
        { x: 11, y: 10, terrain: "MOUNTAIN" },
        { x: 10, y: 9, terrain: "LAND" },
        { x: 10, y: 11, terrain: "LAND", ownerId: "ai-1" }
      ],
      "ai-1",
      7,
      1_000,
      "ai-runtime"
    );

    expect(command).toMatchObject({
      playerId: "ai-1",
      type: "EXPAND",
      clientSeq: 7,
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 9 })
    });
  });

  it("does not choose an attack when the caller cannot afford attack manpower, but can still expand", () => {
    const command = chooseNextOwnedFrontierCommandFromTiles(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1" },
        { x: 9, y: 10, terrain: "LAND", ownerId: "enemy-1" },
        { x: 11, y: 10, terrain: "LAND" }
      ],
      "ai-1",
      8,
      2_000,
      "ai-runtime",
      { canAttack: false, canExpand: true }
    );

    expect(command).toMatchObject({
      playerId: "ai-1",
      type: "EXPAND",
      clientSeq: 8,
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
  });

  it("prefers strategic expand targets over plain coastline tiles", () => {
    const command = chooseNextOwnedFrontierCommandFromTiles(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1" },
        { x: 10, y: 9, terrain: "LAND" },
        { x: 9, y: 10, terrain: "SEA" },
        { x: 11, y: 10, terrain: "LAND", resource: "FARM" },
        { x: 12, y: 10, terrain: "LAND" },
        { x: 11, y: 9, terrain: "LAND" },
        { x: 11, y: 11, terrain: "LAND" }
      ],
      "ai-1",
      9,
      2_500,
      "ai-runtime"
    );

    expect(command).toMatchObject({
      playerId: "ai-1",
      type: "EXPAND",
      clientSeq: 9,
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 11, toY: 10 })
    });
  });

  it("chooses diagonal frontier attacks that runtime validation already allows", () => {
    const command = chooseNextOwnedFrontierCommandFromTiles(
      [
        { x: 24, y: 245, terrain: "LAND", ownerId: "ai-1" },
        { x: 23, y: 246, terrain: "LAND", ownerId: "enemy-1", dockId: "dock-1" }
      ],
      "ai-1",
      10,
      3_000,
      "ai-runtime"
    );

    expect(command).toMatchObject({
      playerId: "ai-1",
      type: "ATTACK",
      clientSeq: 10,
      payloadJson: JSON.stringify({ fromX: 24, fromY: 245, toX: 23, toY: 246 })
    });
  });

  it("wraps frontier expansion across world edges", () => {
    const command = chooseNextOwnedFrontierCommandFromTiles(
      [
        { x: 0, y: 0, terrain: "LAND", ownerId: "ai-1" },
        { x: WORLD_WIDTH - 1, y: 0, terrain: "LAND", resource: "FARM" }
      ],
      "ai-1",
      11,
      4_000,
      "ai-runtime"
    );

    expect(command).toMatchObject({
      playerId: "ai-1",
      type: "EXPAND",
      clientSeq: 11,
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: WORLD_WIDTH - 1, toY: 0 })
    });
  });

  it("targets linked dock destinations when island starts have no local land frontier", () => {
    const dockLinksByDockTileKey = buildDockLinksByDockTileKey([
      { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
      { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
    ]);
    const command = chooseNextOwnedFrontierCommandFromTiles(
      [
        { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", dockId: "dock-a" },
        { x: 50, y: 50, terrain: "LAND", dockId: "dock-b" },
        { x: 51, y: 50, terrain: "LAND", resource: "FARM" }
      ],
      "ai-1",
      12,
      5_000,
      "ai-runtime",
      { dockLinksByDockTileKey }
    );

    expect(command).toMatchObject({
      playerId: "ai-1",
      type: "EXPAND",
      clientSeq: 12,
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 50, toY: 50 })
    });
  });

  it("classifies compact settlement scaffolds separately from scout frontier", () => {
    const tiles = new Map([
      ["10,10", { x: 10, y: 10, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["11,10", { x: 11, y: 10, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      [
        "10,11",
        {
          x: 10,
          y: 11,
          terrain: "LAND" as const,
          ownerId: "ai-1",
          ownershipState: "SETTLED",
          town: { supportMax: 2, supportCurrent: 0 }
        }
      ],
      ["11,11", { x: 11, y: 11, terrain: "LAND" as const }],
      ["20,20", { x: 20, y: 20, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "FRONTIER" }],
      ["21,20", { x: 21, y: 20, terrain: "LAND" as const }],
      ["22,20", { x: 22, y: 20, terrain: "LAND" as const }],
      ["21,19", { x: 21, y: 19, terrain: "SEA" as const }]
    ]);

    const analysis = analyzeOwnedFrontierTargetsFromLookup(
      tiles,
      [tiles.get("10,10")!, tiles.get("11,10")!, tiles.get("10,11")!, tiles.get("20,20")!],
      "ai-1"
    );

    expect(analysis.frontierOpportunityScaffold).toBeGreaterThan(0);
    expect(analysis.frontierOpportunityScout).toBeGreaterThan(0);
    expect(analysis.scaffoldExpand?.target).toMatchObject({ x: 11, y: 11 });
  });

  it("evaluates each neutral frontier target once even when many owned tiles border it", () => {
    const tiles = new Map([
      ["9,9", { x: 9, y: 9, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["10,9", { x: 10, y: 9, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["11,9", { x: 11, y: 9, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["9,10", { x: 9, y: 10, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["11,10", { x: 11, y: 10, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["9,11", { x: 9, y: 11, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["10,11", { x: 10, y: 11, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["11,11", { x: 11, y: 11, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["10,10", { x: 10, y: 10, terrain: "LAND" as const, resource: "FARM" }]
    ]);
    const evaluatedTargets = new Map<string, number>();

    const analysis = analyzeOwnedFrontierTargetsFromLookup(
      tiles,
      [...tiles.values()].filter((tile) => tile.ownerId === "ai-1"),
      "ai-1",
      {
        onEvaluateNeutralTarget: (targetKey) =>
          evaluatedTargets.set(targetKey, (evaluatedTargets.get(targetKey) ?? 0) + 1)
      }
    );

    expect(analysis.frontierNeutralTargetCount).toBe(1);
    expect(analysis.economicExpand?.target).toMatchObject({ x: 10, y: 10 });
    expect(evaluatedTargets).toEqual(new Map([["10,10", 1]]));
  });

  it("tracks enemy-player and barbarian attack availability separately on mixed fronts", () => {
    const tiles = new Map([
      ["0,0", { x: 0, y: 0, terrain: "LAND" as const, ownerId: "ai-1", ownershipState: "SETTLED" }],
      ["1,0", { x: 1, y: 0, terrain: "LAND" as const, ownerId: "enemy-1", town: { name: "Raid" } }],
      ["0,1", { x: 0, y: 1, terrain: "LAND" as const, ownerId: "barbarian", ownershipState: "BARBARIAN", dockId: "dock-b" }]
    ]);

    const analysis = analyzeOwnedFrontierTargetsFromLookup(
      tiles,
      [tiles.get("0,0")!],
      "ai-1"
    );

    expect(analysis.frontierEnemyTargetCount).toBe(2);
    expect(analysis.frontierEnemyPlayerTargetCount).toBe(1);
    expect(analysis.frontierBarbarianTargetCount).toBe(1);
    expect(analysis.enemyAttack?.target).toMatchObject({ x: 1, y: 0, ownerId: "enemy-1" });
    expect(analysis.barbarianAttack?.target).toMatchObject({ x: 0, y: 1, ownerId: "barbarian" });
  });

  it("caps candidate evaluation when frontier exceeds NARROW_ANALYZE_MAX_CANDIDATES", () => {
    // 68 owned tiles spaced 5 apart with 8 unique unowned LAND neighbors each = 544 candidates.
    // frontierNeighborCoords wraps via wrapX/wrapY, so we must create tile entries using
    // wrapped coordinates or the map lookup returns undefined.
    const tiles = new Map<string, { x: number; y: number; terrain: string; ownerId?: string }>();
    const ownedTiles: { x: number; y: number; terrain: string; ownerId: string }[] = [];
    const stepOffsets: Array<[number, number]> = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],           [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];
    const N = 68; // 68 origins × 8 neighbors = 544, comfortably over 512
    for (let i = 0; i < N; i++) {
      const x = i * 5; // wider spacing to avoid neighbor collision
      const y = 0;
      tiles.set(`${x},${y}`, { x, y, terrain: "LAND" as const, ownerId: "ai-1" });
      ownedTiles.push({ x, y, terrain: "LAND" as const, ownerId: "ai-1" });
      for (const [dx, dy] of stepOffsets) {
        const nx = wrapX(x + dx, WORLD_WIDTH);
        const ny = wrapY(y + dy, WORLD_HEIGHT);
        if (!tiles.has(`${nx},${ny}`)) {
          tiles.set(`${nx},${ny}`, { x: nx, y: ny, terrain: "LAND" as const });
        }
      }
    }

    const analysis = analyzeOwnedFrontierTargetsFromLookup(tiles, ownedTiles, "ai-1");

    expect(analysis.narrowAnalyzeCapped).toBe(true);
    // Still picks best-scored candidate from what was evaluated
    expect(analysis.expand).toBeDefined();
    expect(analysis.frontierNeutralTargetCount).toBeGreaterThan(0);
  });

  it("does not expand into a tile with no resource/dock/town and no new frontier to reveal when preferFogEfficientExpansion is set", () => {
    // Origin's only neutral neighbor has nothing beyond it in the map — no
    // resource/dock/town, and no unowned land past it to reveal any new fog.
    const tiles = new Map([
      ["10,10", { x: 10, y: 10, terrain: "LAND" as const, ownerId: "ai-1" }],
      ["11,10", { x: 11, y: 10, terrain: "LAND" as const }]
    ]);

    const analysis = analyzeOwnedFrontierTargetsFromLookup(tiles, [tiles.get("10,10")!], "ai-1", {
      preferFogEfficientExpansion: true
    });

    expect(analysis.frontierOpportunityWaste).toBe(1);
    expect(analysis.expand).toBeUndefined();
  });

  it("still expands into a valueless tile when preferFogEfficientExpansion is not set (barbarian/system-job default)", () => {
    const tiles = new Map([
      ["10,10", { x: 10, y: 10, terrain: "LAND" as const, ownerId: "ai-1" }],
      ["11,10", { x: 11, y: 10, terrain: "LAND" as const }]
    ]);

    // No preferFogEfficientExpansion flag — matches the barbarian planner
    // and system-job-worker call sites, which must keep their historical
    // "always pick something" behavior unchanged.
    const analysis = analyzeOwnedFrontierTargetsFromLookup(tiles, [tiles.get("10,10")!], "ai-1");

    expect(analysis.frontierOpportunityWaste).toBe(1);
    expect(analysis.expand?.target).toMatchObject({ x: 11, y: 10 });
  });

  // Regression/diagnostic coverage for investigating "AI planner sees a
  // legitimately-empty frontier vs. a sync-scope gap" reports (worker-thread
  // tile map missing entries for tiles that genuinely exist in the live
  // world). See ai-decision-diagnostics.ts and the worker's tilesByKey — a
  // candidate absent from the map (undefined) is indistinguishable from a
  // real ocean/void tile without this counter.
  describe("neighborCandidateTotal / missingNeighborTileCount diagnostics", () => {
    it("reports zero missing neighbors when every candidate tile is known to the planner", () => {
      const tiles = new Map([
        ["10,10", { x: 10, y: 10, terrain: "LAND" as const, ownerId: "ai-1" }],
        ["11,10", { x: 11, y: 10, terrain: "LAND" as const }],
        ["9,10", { x: 9, y: 10, terrain: "SEA" as const }],
        ["10,9", { x: 10, y: 9, terrain: "LAND" as const }],
        ["10,11", { x: 10, y: 11, terrain: "LAND" as const }],
        ["9,9", { x: 9, y: 9, terrain: "SEA" as const }],
        ["11,9", { x: 11, y: 9, terrain: "LAND" as const }],
        ["9,11", { x: 9, y: 11, terrain: "SEA" as const }],
        ["11,11", { x: 11, y: 11, terrain: "LAND" as const }]
      ]);

      const analysis = analyzeOwnedFrontierTargetsFromLookup(tiles, [tiles.get("10,10")!], "ai-1");

      expect(analysis.neighborCandidateTotal).toBe(8);
      expect(analysis.missingNeighborTileCount).toBe(0);
    });

    it("counts neighbor candidates entirely absent from the planner's tile map (sync-scope gap) separately from real waste tiles", () => {
      // Only origin and ONE neighbor are known to the planner; the other 7
      // neighbor coordinates were never delivered via tile_deltas (simulating
      // a sync-scope gap), so tilesByKey.get() returns undefined for them —
      // this must be counted as "missing", not silently treated the same as
      // a legitimately-classified waste tile.
      const tiles = new Map([
        ["10,10", { x: 10, y: 10, terrain: "LAND" as const, ownerId: "ai-1" }],
        ["11,10", { x: 11, y: 10, terrain: "LAND" as const }]
      ]);

      const analysis = analyzeOwnedFrontierTargetsFromLookup(tiles, [tiles.get("10,10")!], "ai-1");

      expect(analysis.neighborCandidateTotal).toBe(8);
      expect(analysis.missingNeighborTileCount).toBe(7);
      // Confirms this is NOT a bug in the existing waste-tile classification —
      // that path only sees the one known neighbor and correctly separates
      // "known and classified" from "never synced".
      expect(analysis.frontierOpportunityWaste).toBe(1);
    });
  });
});
