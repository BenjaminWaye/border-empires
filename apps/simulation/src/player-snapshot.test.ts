import { describe, expect, it } from "vitest";

import { buildPlayerSubscriptionSnapshot } from "./player-snapshot.js";

describe("buildPlayerSubscriptionSnapshot", () => {
  it("falls back to seed tiles when the runtime export is unexpectedly empty", () => {
    expect(
      buildPlayerSubscriptionSnapshot(
        "player-1",
        { tiles: [], players: [], pendingSettlements: [], activeLocks: [] },
        [
          { x: 10, y: 10, terrain: "LAND", resource: "FARM", ownerId: "player-1", ownershipState: "FRONTIER", town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Nauticus" } },
          { x: 10, y: 11, terrain: "SEA" }
        ]
      )
    ).toEqual(
      expect.objectContaining({
        playerId: "player-1",
        tiles: [
          expect.objectContaining({
            x: 10,
            y: 10,
            terrain: "LAND",
            resource: "FARM",
            ownerId: "player-1",
            ownershipState: "FRONTIER",
            townType: "FARMING",
            townName: "Nauticus",
            townPopulationTier: "SETTLEMENT"
          }),
          { x: 10, y: 11, terrain: "SEA" }
        ]
      })
    );
  });

  it("limits the bootstrap snapshot to owned tiles and nearby frontier visibility", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "FARMING" },
        { x: 14, y: 10, terrain: "LAND" },
        { x: 15, y: 10, terrain: "LAND" },
        { x: 30, y: 30, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
      ],
      players: [
        {
          id: "player-1",
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10"]
        },
        {
          id: "player-2",
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["30,30"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    expect(snapshot.playerId).toBe("player-1");
    expect(snapshot.tiles).toEqual([
      expect.objectContaining({ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "FARMING" }),
      { x: 14, y: 10, terrain: "LAND" }
    ]);
  });

  it("includes ally vision in the bootstrap snapshot", () => {
    expect(
      buildPlayerSubscriptionSnapshot("player-1", {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 24, y: 20, terrain: "LAND" }
        ],
        players: [
          {
            id: "player-1",
            allies: ["player-2"],
            vision: 1,
            visionRadiusBonus: 0,
            territoryTileKeys: ["10,10"]
          },
          {
            id: "player-2",
            allies: [],
            vision: 1,
            visionRadiusBonus: 0,
            territoryTileKeys: ["20,20"]
          }
        ],
        pendingSettlements: [],
        activeLocks: []
      })
    ).toEqual(
      expect.objectContaining({
        playerId: "player-1",
        tiles: [
          expect.objectContaining({ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }),
          expect.objectContaining({ x: 20, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }),
          expect.objectContaining({ x: 24, y: 20, terrain: "LAND" })
        ]
      })
    );
  });

  it("includes live player economy and development state when exported by the simulation runtime", () => {
    expect(
      buildPlayerSubscriptionSnapshot("player-1", {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM", townType: "FARMING", townName: "Nauticus" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" }
        ],
        players: [
          {
            id: "player-1",
            name: "Nauticus",
            points: 64,
            manpower: 120,
            techIds: [],
            domainIds: [],
            strategicResources: { FOOD: 3 },
            allies: [],
            vision: 1,
            visionRadiusBonus: 0,
            territoryTileKeys: ["10,10", "11,10"]
          }
        ],
        pendingSettlements: [{ ownerId: "player-1", tileKey: "11,10", startedAt: 1_000, resolvesAt: 61_000, goldCost: 4 }],
        activeLocks: []
      })
    ).toEqual(
      expect.objectContaining({
        playerId: "player-1",
        player: expect.objectContaining({
          gold: 64,
          manpower: 120,
          incomePerMinute: 1,
          activeDevelopmentProcessCount: 1,
          pendingSettlements: [{ x: 11, y: 10, startedAt: 1_000, resolvesAt: 61_000 }],
          strategicResources: expect.objectContaining({ FOOD: 3 }),
          strategicProductionPerMinute: expect.objectContaining({ FOOD: 0.05 })
        })
      })
    );
  });

  it("includes authoritative world status for hidden AI territory and season goals", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "FARMING", townName: "Nauticus" },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 30, y: 30, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", townType: "MARKET", townName: "BlackFang" },
        { x: 31, y: 30, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", resource: "IRON" }
      ],
      players: [
        {
          id: "player-1",
          name: "Nauticus",
          points: 100,
          manpower: 150,
          techIds: [],
          domainIds: [],
          strategicResources: {},
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10", "11,10"]
        },
        {
          id: "ai-1",
          name: "BlackFang",
          points: 120,
          manpower: 150,
          techIds: ["breach-doctrine"],
          domainIds: [],
          strategicResources: {},
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["30,30", "31,30"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    expect(snapshot.tiles).toEqual([
      expect.objectContaining({
        x: 10,
        y: 10,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "SETTLED",
        townType: "FARMING",
        townName: "Nauticus",
        townPopulationTier: "SETTLEMENT",
        yieldRate: expect.objectContaining({ goldPerMinute: 1 })
      }),
      expect.objectContaining({
        x: 11,
        y: 10,
        terrain: "LAND",
        ownerId: "player-1",
        ownershipState: "SETTLED",
        resource: "FARM"
      })
    ]);
    expect(snapshot.worldStatus?.leaderboard.overall).toEqual([
      expect.objectContaining({ id: "ai-1", name: "BlackFang", tiles: 2, techs: 1 }),
      expect.objectContaining({ id: "player-1", name: "Nauticus", tiles: 2, techs: 0 })
    ]);
    expect(snapshot.worldStatus?.seasonVictory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "TOWN_CONTROL" }),
        expect.objectContaining({ id: "SETTLED_TERRITORY" })
      ])
    );
  });

  it("enriches rewrite town snapshots with support structures and live economy breakdown", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            type: "FARMING",
            populationTier: "TOWN",
            name: "Qadarstrand",
            population: 18_977,
            maxPopulation: 25_000,
            connectedTownCount: 1,
            connectedTownBonus: 0.1
          }),
          townType: "FARMING",
          townName: "Qadarstrand",
          townPopulationTier: "TOWN"
        },
        { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ type: "MARKET", status: "active" }) },
        { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ type: "GRANARY", status: "active" }) },
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ type: "BANK", status: "active" }) }
      ],
      players: [
        {
          id: "player-1",
          name: "Nauticus",
          points: 64,
          manpower: 120,
          incomeMultiplier: 1,
          techIds: [],
          domainIds: [],
          strategicResources: { FOOD: 3 },
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10", "9,10", "11,10", "10,9", "10,11"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    const townTile = snapshot.tiles.find((tile) => tile.x === 10 && tile.y === 10);
    const town = townTile?.townJson ? JSON.parse(townTile.townJson) : undefined;

    expect(town).toEqual(
      expect.objectContaining({
        name: "Qadarstrand",
        supportCurrent: 4,
        supportMax: 4,
        isFed: true,
        hasMarket: true,
        hasGranary: true,
        hasBank: true,
        marketActive: true,
        granaryActive: true,
        bankActive: true,
        foodUpkeepPerMinute: 0.1
      })
    );
    expect(snapshot.player).toEqual(
      expect.objectContaining({
        economyBreakdown: expect.objectContaining({
          GOLD: expect.objectContaining({ sources: expect.any(Array), sinks: expect.any(Array) }),
          FOOD: expect.objectContaining({ sources: expect.any(Array), sinks: expect.any(Array) })
        }),
        upkeepPerMinute: expect.objectContaining({ food: expect.any(Number), gold: expect.any(Number) }),
        upkeepLastTick: expect.objectContaining({ foodCoverage: 1 })
      })
    );
    expect(snapshot.player?.economyBreakdown?.GOLD.sources[0]).toEqual(
      expect.objectContaining({ label: "Towns", amountPerMinute: expect.any(Number) })
    );
    expect(snapshot.player?.upkeepPerMinute?.food).toBeGreaterThan(0.1);
  });
});
