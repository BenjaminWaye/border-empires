import { describe, expect, it } from "vitest";

import { computeSeedGranaryBuffedTileKeysForTest, enrichSnapshotTilesForGlobalVisibility } from "./live-snapshot-view.js";

const landTile = (x: number, y: number, ownerId?: string, structureType?: string) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...(ownerId ? { ownerId, ownershipState: "SETTLED" } : {}),
  ...(structureType
    ? { economicStructureJson: JSON.stringify({ type: structureType, status: "active", ownerId }) }
    : {})
});

const seaTile = (x: number, y: number) => ({ x, y, terrain: "SEA" as const });

let nextTestEpoch = 1_000_000;
const baseRuntime = (tiles: Array<Record<string, unknown>>) => ({
  terrainEpoch: nextTestEpoch++,
  tiles,
  players: [
    {
      id: "p1",
      name: "p1",
      points: 0,
      manpower: 0,
      techIds: [],
      domainIds: [],
      strategicResources: {},
      allies: [],
      vision: 1,
      visionRadiusBonus: 0,
      territoryTileKeys: tiles.filter((t) => (t as { ownerId?: string }).ownerId === "p1").map((t) => `${(t as { x: number }).x},${(t as { y: number }).y}`)
    }
  ]
});

describe("seed granary buff", () => {
  it("returns empty set when no SEED_GRANARY exists", () => {
    const tiles = [landTile(5, 5, "p1", "GRANARY"), landTile(6, 5, "p1")];
    const buffed = computeSeedGranaryBuffedTileKeysForTest(baseRuntime(tiles));
    expect(buffed.size).toBe(0);
  });

  it("a lone SEED_GRANARY buffs itself", () => {
    const tiles = [landTile(5, 5, "p1", "SEED_GRANARY")];
    const buffed = computeSeedGranaryBuffedTileKeysForTest(baseRuntime(tiles));
    expect(buffed.has("5,5")).toBe(true);
    expect(buffed.size).toBe(1);
  });

  it("1 SG + 4 G on same island, all 5 buffed", () => {
    const tiles = [
      landTile(5, 5, "p1", "SEED_GRANARY"),
      landTile(6, 5, "p1", "GRANARY"),
      landTile(7, 5, "p1", "GRANARY"),
      landTile(5, 6, "p1", "GRANARY"),
      landTile(5, 7, "p1", "GRANARY")
    ];
    const buffed = computeSeedGranaryBuffedTileKeysForTest(baseRuntime(tiles));
    expect(buffed.size).toBe(5);
    expect(buffed.has("5,5")).toBe(true);
    expect(buffed.has("6,5")).toBe(true);
    expect(buffed.has("7,5")).toBe(true);
    expect(buffed.has("5,6")).toBe(true);
    expect(buffed.has("5,7")).toBe(true);
  });

  it("1 SG + 10 G picks the 5 closest", () => {
    // SG at (5,5); granaries placed at increasing chebyshev distances.
    const ownedKeys: string[] = ["5,5"];
    const tiles: Array<Record<string, unknown>> = [landTile(5, 5, "p1", "SEED_GRANARY")];
    // 10 granaries along a line going east — distances 1..10.
    for (let d = 1; d <= 10; d += 1) {
      tiles.push(landTile(5 + d, 5, "p1", "GRANARY"));
      ownedKeys.push(`${5 + d},5`);
    }
    // Provide intermediate LAND tiles to keep one island; already LAND because tiles above are LAND.
    const buffed = computeSeedGranaryBuffedTileKeysForTest(baseRuntime(tiles));
    // SG + 4 closest granaries
    expect(buffed.size).toBe(5);
    expect(buffed.has("5,5")).toBe(true);
    expect(buffed.has("6,5")).toBe(true);
    expect(buffed.has("7,5")).toBe(true);
    expect(buffed.has("8,5")).toBe(true);
    expect(buffed.has("9,5")).toBe(true);
    expect(buffed.has("10,5")).toBe(false);
  });

  it("granaries on a different island are not buffed", () => {
    // Island A: SG + G adjacent at (5,5)/(6,5). Surround by sea so the next granary at (20,20) is its own island.
    const tiles: Array<Record<string, unknown>> = [
      landTile(5, 5, "p1", "SEED_GRANARY"),
      landTile(6, 5, "p1", "GRANARY"),
      landTile(20, 20, "p1", "GRANARY")
    ];
    // Fill sea around the second island so it's truly disconnected (8-connected flood needs gap > 1).
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) continue;
        tiles.push(seaTile(5 + dx, 5 + dy));
        tiles.push(seaTile(20 + dx, 20 + dy));
      }
    }
    const buffed = computeSeedGranaryBuffedTileKeysForTest(baseRuntime(tiles));
    expect(buffed.has("5,5")).toBe(true);
    expect(buffed.has("6,5")).toBe(true);
    expect(buffed.has("20,20")).toBe(false);
  });
});

describe("enrichSnapshotTilesForGlobalVisibility", () => {
  it("does not expose owner-only town economy fields in shared full-visibility tiles", () => {
    const tiles = enrichSnapshotTilesForGlobalVisibility({
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "BlackFang",
            type: "MARKET",
            populationTier: "CITY",
            baseGoldPerMinute: 2,
            supportCurrent: 8,
            supportMax: 8,
            goldPerMinute: 2,
            cap: 20,
            isFed: true,
            population: 5,
            maxPopulation: 8,
            connectedTownCount: 1,
            connectedTownBonus: 0.2,
            hasMarket: true,
            marketActive: true,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          }),
          townType: "MARKET",
          townName: "BlackFang",
          townPopulationTier: "CITY"
        },
        {
          x: 11,
          y: 10,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "BrightFang",
            type: "FARMING",
            populationTier: "CITY",
            baseGoldPerMinute: 2,
            supportCurrent: 3,
            supportMax: 4,
            goldPerMinute: 5,
            cap: 20,
            isFed: true,
            population: 5,
            maxPopulation: 8,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          }),
          townType: "FARMING",
          townName: "BrightFang",
          townPopulationTier: "CITY"
        }
      ],
      players: [
        {
          id: "player-2",
          name: "BlackFang",
          points: 5,
          manpower: 3,
          techIds: [],
          domainIds: [],
          strategicResources: { FOOD: 10, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0 },
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    const town = JSON.parse(String(tiles[0]?.townJson));
    expect(town.name).toBe("BlackFang");
    expect(town.type).toBe("MARKET");
    expect(town.populationTier).toBe("CITY");
    expect(town).not.toHaveProperty("isFed");
    expect(town).not.toHaveProperty("supportCurrent");
    expect(town).not.toHaveProperty("supportMax");
    expect(town).not.toHaveProperty("hasMarket");
    // yieldRate removed from tile export (see docs/plans/2026-05-30-bootstrap-payload-shrink.md).
    // goldPerMinute remains stripped from shared-visibility town summaries (by design).
    expect(town).not.toHaveProperty("goldPerMinute");
    expect(town.connectedTownCount).toBe(1);
    expect(town.connectedTownBonus).toBe(0.5);
  });

  it("boosts a Farmstead FARM tile's FOOD yield by 1.5x when an active Waterworks is within radius", () => {
    const farmTile = {
      x: 5,
      y: 5,
      terrain: "LAND" as const,
      resource: "FARM",
      ownerId: "player-1",
      ownershipState: "SETTLED" as const,
      economicStructureJson: JSON.stringify({ type: "FARMSTEAD", status: "active", ownerId: "player-1" })
    };
    const waterworksTile = {
      x: 10,
      y: 5,
      terrain: "LAND" as const,
      ownerId: "player-1",
      ownershipState: "SETTLED" as const,
      economicStructureJson: JSON.stringify({ type: "WATERWORKS", status: "active", ownerId: "player-1" })
    };
    const player = {
      id: "player-1",
      name: "player-1",
      points: 0,
      manpower: 0,
      techIds: [],
      domainIds: [],
      strategicResources: {},
      allies: [],
      vision: 1,
      visionRadiusBonus: 0
    };
    const withoutWaterworks = enrichSnapshotTilesForGlobalVisibility({
      tiles: [farmTile],
      players: [player],
      pendingSettlements: [],
      activeLocks: []
    });
    const withWaterworks = enrichSnapshotTilesForGlobalVisibility({
      tiles: [farmTile, waterworksTile],
      players: [player],
      pendingSettlements: [],
      activeLocks: []
    });
    const baseFood = withoutWaterworks.find((t) => t.x === 5 && t.y === 5)?.yield?.strategic?.FOOD ?? 0;
    const boostedFood = withWaterworks.find((t) => t.x === 5 && t.y === 5)?.yield?.strategic?.FOOD ?? 0;
    expect(baseFood).toBeGreaterThan(0);
    expect(boostedFood).toBeCloseTo(baseFood * 1.5, 5);
  });

  it("emits yieldRate/yieldCap only for tiles that need server authority (strategic structure or dock), not for bare settled tiles", () => {
    const basePlayer = {
      id: "player-2",
      name: "player-2",
      points: 0,
      manpower: 0,
      techIds: [],
      domainIds: [],
      strategicResources: {},
      allies: [],
      vision: 1,
      visionRadiusBonus: 0
    };
    const tiles = enrichSnapshotTilesForGlobalVisibility({
      tiles: [
        // Bare settled resource tile — no structure, no dock: predicate is false.
        { x: 1, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "FARM" },
        // Active MINE — strategic-affecting structure: predicate is true.
        {
          x: 2,
          y: 1,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          resource: "IRON",
          economicStructureJson: JSON.stringify({ type: "MINE", status: "active", ownerId: "player-2" })
        },
        // Dock tile — predicate is true regardless of structure.
        { x: 3, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", dockId: "dock-a" }
      ],
      players: [basePlayer],
      pendingSettlements: [],
      activeLocks: []
    });

    const bare = tiles.find((t) => t.x === 1 && t.y === 1);
    const mine = tiles.find((t) => t.x === 2 && t.y === 1);
    const dock = tiles.find((t) => t.x === 3 && t.y === 1);

    expect(bare).not.toHaveProperty("yieldRate");
    expect(bare).not.toHaveProperty("yieldCap");
    expect(mine).toHaveProperty("yieldRate");
    expect((mine as { yieldRate?: { strategicPerDay?: Record<string, number> } })?.yieldRate?.strategicPerDay?.IRON).toBe(90);
    expect(dock).toHaveProperty("yieldRate");
  });
});
