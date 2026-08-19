import { describe, expect, it } from "vitest";

import { STARTING_CAPITAL_MANPOWER_CAP, STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE, TOWN_MANPOWER_BY_TIER } from "@border-empires/game-domain";
import { buildPlayerSubscriptionSnapshot } from "./player-snapshot.js";
import { SimulationRuntime } from "../runtime/runtime.js";

describe("buildPlayerSubscriptionSnapshot", () => {
  it("falls back to seed tiles when the runtime export is unexpectedly empty", () => {
    expect(
      buildPlayerSubscriptionSnapshot(
        "player-1",
        { tiles: [], players: [], pendingSettlements: [], activeLocks: [] },
        [
          // SETTLED (not FRONTIER) so the fallback-tiles vision dilation below
          // reaches the neighboring SEA tile — a FRONTIER claim holds no
          // standing vision beyond itself, so this fixture would otherwise
          // only prove the anchor tile's own fields pass through.
          { x: 10, y: 10, terrain: "LAND", resource: "FARM", ownerId: "player-1", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT", name: "Nauticus" } },
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
            ownershipState: "SETTLED",
            townType: "FARMING",
            townName: "Nauticus",
            townPopulationTier: "SETTLEMENT"
          }),
          { x: 10, y: 11, terrain: "SEA" }
        ]
      })
    );
  });

  it("refreshes stale complete town growth summaries from live rewrite state", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Old Growth",
            type: "MARKET",
            populationTier: "TOWN",
            population: 25_000,
            maxPopulation: 100_000,
            populationGrowthPerMinute: 0,
            baseGoldPerMinute: 2,
            goldPerMinute: 0,
            cap: 0,
            supportCurrent: 0,
            supportMax: 0,
            isFed: false,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMintworks: false,
            mintworksActive: false,
            hasGranary: false,
            granaryActive: false,
          }),
          townType: "MARKET",
          townName: "Old Growth",
          townPopulationTier: "TOWN"
        },
        // §5.4: a town needs real FOOD slot supply to be fed/not-dormant
        // (4 slots for a TOWN — two FISH tiles). Placed away from the town so
        // it doesn't change supportCurrent/supportMax (a §5 v1 global pool).
        { x: 30, y: 30, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 31, y: 30, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" }
      ],
      players: [
        {
          id: "player-1",
          strategicResources: { FOOD: 3 },
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10", "30,30", "31,30"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    const townTile = snapshot.tiles.find((tile) => tile.x === 10 && tile.y === 10);
    const town = townTile?.townJson ? JSON.parse(townTile.townJson) : undefined;
    expect(town).toEqual(
      expect.objectContaining({
        name: "Old Growth",
        isFed: true
      })
    );
    expect(town.populationGrowthPerMinute).toBeGreaterThan(0);
    expect(town.goldPerMinute).toBeGreaterThan(0);
  });

  it("marks live rewrite towns with a nearby-war growth modifier when combat is on their support ring", () => {
    const now = Date.now();
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Warwick",
            type: "MARKET",
            populationTier: "TOWN",
            population: 25_000,
            maxPopulation: 100_000,
            nearbyWarPausedUntil: now + 30_000,
            nearbyWarLastAt: now
          }),
          townType: "MARKET",
          townName: "Warwick",
          townPopulationTier: "TOWN"
        },
        // §5.4: a town needs real FOOD slot supply to be fed/not-dormant
        // (4 slots for a TOWN — two FISH tiles), not the legacy
        // strategicResources.FOOD stockpile below.
        { x: 11, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 11, y: 11, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 12, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
      ],
      players: [
        {
          id: "player-1",
          strategicResources: { FOOD: 3 },
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10", "11,10", "11,11"]
        }
      ],
      pendingSettlements: [],
      activeLocks: [
        {
          commandId: "attack-1",
          playerId: "player-2",
          actionType: "ATTACK",
          originKey: "12,10",
          targetKey: "11,10",
          resolvesAt: now + 30_000
        }
      ]
    });

    const townTile = snapshot.tiles.find((tile) => tile.x === 10 && tile.y === 10);
    const town = townTile?.townJson ? JSON.parse(townTile.townJson) : undefined;
    expect(town.growthModifiers).toEqual([
      expect.objectContaining({ label: "Nearby war", deltaPerMinute: expect.any(Number) })
    ]);
    expect(town.growthModifiers[0].deltaPerMinute).toBeLessThan(0);
  });

  it("does not mark nearby expansion locks as nearby war", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Quietwick",
            type: "MARKET",
            populationTier: "TOWN",
            population: 25_000,
            maxPopulation: 100_000
          }),
          townType: "MARKET",
          townName: "Quietwick",
          townPopulationTier: "TOWN"
        },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
        // §5.4: a town needs real FOOD slot supply to be fed/not-dormant
        // (4 slots for a TOWN — two FISH tiles).
        { x: 12, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 12, y: 11, terrain: "LAND", resource: "FISH", ownerId: "player-1", ownershipState: "SETTLED" }
      ],
      players: [
        {
          id: "player-1",
          strategicResources: { FOOD: 3 },
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10", "11,10", "12,10", "12,11"]
        }
      ],
      pendingSettlements: [],
      activeLocks: [
        {
          commandId: "expand-1",
          playerId: "player-1",
          actionType: "EXPAND",
          originKey: "10,10",
          targetKey: "11,10",
          resolvesAt: Date.now() + 30_000
        }
      ]
    });

    const townTile = snapshot.tiles.find((tile) => tile.x === 10 && tile.y === 10);
    const town = townTile?.townJson ? JSON.parse(townTile.townJson) : undefined;
    expect(town.growthModifiers).toEqual([
      expect.objectContaining({ label: "Long time peace", deltaPerMinute: expect.any(Number) })
    ]);
    expect(town.growthModifiers[0].deltaPerMinute).toBeGreaterThan(0);
  });

  it("limits the bootstrap snapshot to owned tiles and nearby frontier visibility", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "FARMING" },
        { x: 11, y: 10, terrain: "LAND" },
        { x: 12, y: 10, terrain: "LAND" },
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
      { x: 11, y: 10, terrain: "LAND" }
    ]);
  });

  it("returns every tile when full visibility is enabled", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 30, y: 30, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
        { x: 31, y: 30, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
        { x: 40, y: 40, terrain: "SEA" }
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
          territoryTileKeys: ["30,30", "31,30"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    }, undefined, { fullVisibility: true });

    expect(snapshot.tiles).toEqual([
      expect.objectContaining({ x: 10, y: 10, ownerId: "player-1" }),
      expect.objectContaining({ x: 30, y: 30, ownerId: "player-2" }),
      expect.objectContaining({ x: 31, y: 30, ownerId: "player-2" }),
      expect.objectContaining({ x: 40, y: 40, terrain: "SEA" })
    ]);
  });

  it("reuses shared full-visibility tiles when provided", () => {
    const sharedTiles = [
      { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1" },
      { x: 11, y: 10, terrain: "SEA" as const }
    ];
    const snapshot = buildPlayerSubscriptionSnapshot(
      "player-1",
      {
        tiles: [],
        players: [
          {
            id: "player-1",
            allies: [],
            vision: 1,
            visionRadiusBonus: 0,
            territoryTileKeys: ["10,10"],
            points: 5,
            manpower: 3,
            strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
            techIds: [],
            domainIds: []
          }
        ],
        pendingSettlements: [],
        activeLocks: []
      },
      undefined,
      { fullVisibility: true, sharedFullVisibilityTiles: sharedTiles }
    );

    expect(snapshot.tiles).toBe(sharedTiles);
  });

  it("includes ally vision in the bootstrap snapshot", () => {
    expect(
      buildPlayerSubscriptionSnapshot("player-1", {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 21, y: 20, terrain: "LAND" }
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
          expect.objectContaining({ x: 21, y: 20, terrain: "LAND" })
        ]
      })
    );
  });

  it("includes dock route definitions in the bootstrap snapshot", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", dockId: "dock-a" },
        { x: 90, y: 90, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", dockId: "dock-b" }
      ],
      players: [
        {
          id: "player-1",
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10"]
        }
      ],
      pendingSettlements: [],
      activeLocks: [],
      docks: [
        { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b" },
        { dockId: "dock-b", tileKey: "90,90", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
      ]
    }, undefined, {
      seasonState: {
        seasonId: "season-managed",
        seasonSequence: 2,
        rulesetId: "seasonal-default",
        worldSeed: 4242,
        status: "active",
        startedAt: 1000,
        victoryTrackers: []
      }
    });

    expect(snapshot.season).toEqual({
      seasonId: "season-managed",
      seasonSequence: 2,
      rulesetId: "seasonal-default",
      worldSeed: 4242,
      status: "active",
      startedAt: 1000,
      victoryTrackers: []
    });
    expect(snapshot.docks).toEqual([
      { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b" },
      { dockId: "dock-b", tileKey: "90,90", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
    ]);
  });

  it("includes live player economy and development state when exported by the simulation runtime", () => {
    expect(
      buildPlayerSubscriptionSnapshot("player-1", {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            resource: "FARM",
            townType: "FARMING",
            townName: "Nauticus",
            townPopulationTier: "TOWN"
          },
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
          incomePerMinute: 0,
          activeDevelopmentProcessCount: 1,
          pendingSettlements: [{ x: 11, y: 10, startedAt: 1_000, resolvesAt: 61_000 }],
          strategicResources: expect.objectContaining({ FOOD: 3 }),
          // §5.4: FOOD is slot-based, not produced — strategicProductionPerMinute.FOOD is always 0 now.
          strategicProductionPerMinute: expect.objectContaining({ FOOD: 0 })
        })
      })
    );
  });

  it("includes authoritative world status for hidden AI territory and season goals", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townType: "FARMING",
          townName: "Nauticus",
          townPopulationTier: "TOWN"
        },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        {
          x: 30,
          y: 30,
          terrain: "LAND",
          ownerId: "ai-1",
          ownershipState: "SETTLED",
          townType: "MARKET",
          townName: "BlackFang",
          townPopulationTier: "TOWN"
        },
        { x: 31, y: 30, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", resource: "TITANIUM" }
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
          techIds: [],
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
        townPopulationTier: "TOWN"
        // yieldRate removed from tile export (bootstrap-payload-shrink PR A)
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
      expect.objectContaining({ id: "ai-1", name: "BlackFang", tiles: 2, techs: 0 }),
      expect.objectContaining({ id: "player-1", name: "Nauticus", tiles: 2, techs: 0 })
    ]);
    expect(snapshot.worldStatus?.seasonVictory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "TOWN_CONTROL" }),
        expect.objectContaining({ id: "DIPLOMATIC_DOMINANCE" })
      ])
    );
  });

  it("keeps season-victory thresholds based on full world state when the visible tile slice is partial", () => {
    const visibleRuntimeState = {
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townType: "FARMING",
          townName: "Nauticus",
          townPopulationTier: "SETTLEMENT"
        },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
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
          territoryTileKeys: ["10,10", "11,10"],
          settledTileCount: 2,
          incomePerMinute: 2
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
          territoryTileKeys: ["30,30", "31,30"],
          settledTileCount: 2,
          incomePerMinute: 2
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    };
    const fullRuntimeState = {
      ...visibleRuntimeState,
      tiles: [
        ...visibleRuntimeState.tiles,
        { x: 30, y: 30, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", townType: "MARKET", townName: "BlackFang" },
        { x: 31, y: 30, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED", resource: "TITANIUM" },
        { x: 32, y: 30, terrain: "LAND", ownerId: "ai-1", ownershipState: "FRONTIER" },
        { x: 40, y: 40, terrain: "LAND", townType: "MARKET", townName: "Neutral Port" }
      ]
    };

    const snapshot = buildPlayerSubscriptionSnapshot("player-1", visibleRuntimeState, undefined, {
      worldStatusRuntimeState: fullRuntimeState
    });

    expect(snapshot.tiles).toHaveLength(2);
    expect(snapshot.worldStatus?.seasonVictory.find((objective) => objective.id === "TOWN_CONTROL")).toEqual(
      expect.objectContaining({
        progressLabel: "1/2 towns",
        thresholdLabel: "Need 2 towns"
      })
    );
    expect(snapshot.worldStatus?.seasonVictory.find((objective) => objective.id === "DIPLOMATIC_DOMINANCE")).toEqual(
      expect.objectContaining({
        name: "Diplomatic Dominance",
        progressLabel: "3/4 alliance-controlled land · leader 3 tiles · 1 member",
        thresholdLabel: "Need 4 alliance-controlled land tiles (66%) and largest member status"
      })
    );
  });

  it("can skip world status generation when subscribe only needs the visible bootstrap payload", () => {
    const snapshot = buildPlayerSubscriptionSnapshot(
      "player-1",
      {
        tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }],
        players: [
          {
            id: "player-1",
            name: "Nauticus",
            points: 64,
            manpower: 120,
            techIds: [],
            domainIds: [],
            strategicResources: {},
            allies: [],
            vision: 1,
            visionRadiusBonus: 0,
            territoryTileKeys: ["10,10"]
          }
        ],
        pendingSettlements: [],
        activeLocks: []
      },
      undefined,
      { includeWorldStatus: false }
    );

    expect(snapshot.worldStatus).toBeUndefined();
    expect(snapshot.tiles).toEqual([
      expect.objectContaining({ x: 10, y: 10, ownerId: "player-1", ownershipState: "SETTLED" })
    ]);
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
        { x: 9, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ type: "CLEARING_HOUSE", status: "active" }) },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ type: "MINTWORKS", status: "active" }) },
        { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ type: "GRANARY", status: "active" }) },
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", economicStructureJson: JSON.stringify({ type: "CARAVANARY", status: "active" }) },
        // §5.4: FOOD slot supply — town(2) + MINTWORKS/CARAVANARY/GRANARY/CLEARING_HOUSE
        // (1 each) = 6 demand; the FARM tile above only gives 1, so these
        // support structures need real supply to not go dormant.
        { x: 8, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
        { x: 8, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
        { x: 8, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" }
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
          territoryTileKeys: ["10,10", "9,10", "9,9", "11,10", "10,9", "10,11", "8,10", "8,9", "8,11"]
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
        supportCurrent: 5,
        supportMax: 5,
        isFed: true,
        hasMintworks: true, hasGranary: true,
        mintworksActive: true, granaryActive: true,
        hasClearingHouse: true, clearingHouseActive: true,
        goldPerMinute: expect.any(Number),
        // §5.4: FOOD is slot-based — town food upkeep is retired to 0.
        foodUpkeepPerMinute: 0
      })
    );
    // mintworks-stacking task: isCompleteTownSummary now also requires
    // mintworksCount (snapshot-economy-helpers.ts), which this fixture's
    // hand-authored townJson blob doesn't carry — that now correctly forces
    // a live recompute instead of short-circuiting on the canned "complete"
    // JSON, which in turn recomputes connectedTownCount/connectedTownBonus
    // from the real (single-town, no network) tile set instead of trusting
    // the fixture's inconsistent stored values. 1 active Mintworks with an
    // active Clearing House: 0.006944 * 1.35 + flat bonus 1/1440 (see the
    // live-town-summary.ts duplicate-formula fix).
    expect(town?.goldPerMinute).toBeCloseTo(0.010069, 4);
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
    // §5.4: FOOD is slot-based — town/structure food upkeep is retired to 0.
    expect(snapshot.player?.upkeepPerMinute?.food).toBe(0);
  });

  it("includes an active Weapons Factory's attack/defense bonus in the player's modBreakdown", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        {
          x: 11,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          economicStructureJson: JSON.stringify({ type: "TITANIUM_WEAPONS_FACTORY", status: "active" })
        }
      ],
      players: [
        {
          id: "player-1",
          points: 64,
          manpower: 120,
          techIds: [],
          domainIds: [],
          strategicResources: {},
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10", "11,10"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    expect(snapshot.player?.modBreakdown?.attack).toContainEqual(
      expect.objectContaining({ label: expect.stringContaining("Titanium Weapons Factory"), mult: 1.015 })
    );
    expect(snapshot.player?.modBreakdown?.defense).toContainEqual(
      expect.objectContaining({ label: expect.stringContaining("Titanium Weapons Factory"), mult: 1.03 })
    );
  });

  it("keeps settlement food upkeep at zero in rewrite economy snapshots", () => {
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
            populationTier: "SETTLEMENT",
            name: "Nauticus",
            population: 900,
            maxPopulation: 2_500,
            connectedTownCount: 0,
            connectedTownBonus: 0
          }),
          townType: "FARMING",
          townName: "Nauticus",
          townPopulationTier: "SETTLEMENT"
        }
      ],
      players: [
        {
          id: "player-1",
          name: "Nauticus",
          points: 12,
          manpower: 120,
          incomeMultiplier: 1,
          techIds: [],
          domainIds: [],
          strategicResources: { FOOD: 3 },
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    const townTile = snapshot.tiles.find((tile) => tile.x === 10 && tile.y === 10);
    const town = townTile?.townJson ? JSON.parse(townTile.townJson) : undefined;

    expect(town).toEqual(
      expect.objectContaining({
        populationTier: "SETTLEMENT",
        foodUpkeepPerMinute: 0
      })
    );
    expect(snapshot.player?.upkeepPerMinute?.food).toBe(0);
    expect(snapshot.player?.economyBreakdown?.FOOD.sinks).toEqual([]);
  });

  it("does not fabricate remote town population or fed state from thin rewrite snapshot identity", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        {
          x: 14,
          y: 10,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          townType: "FARMING",
          townName: "Ironwick",
          townPopulationTier: "TOWN"
        }
      ],
      players: [
        {
          id: "player-1",
          allies: [],
          vision: 4, // dx=4 reach to the remote town, independent of base VISION_RADIUS
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10"]
        },
        {
          id: "player-2",
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["14,10"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    const remoteTownTile = snapshot.tiles.find((tile) => tile.x === 14 && tile.y === 10);
    expect(remoteTownTile).toEqual(
      expect.objectContaining({
        townType: "FARMING",
        townName: "Ironwick",
        townPopulationTier: "TOWN"
      })
    );
    expect(remoteTownTile?.townJson).toBeUndefined();
  });

  it("preserves authoritative remote town population and fed state from rewrite snapshots", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        {
          x: 14,
          y: 10,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Brassumstead",
            type: "MARKET",
            populationTier: "TOWN",
            population: 23000,
            maxPopulation: 100000,
            populationGrowthPerMinute: 14.5,
            baseGoldPerMinute: 2,
            goldPerMinute: 1.5,
            cap: 720,
            supportCurrent: 3,
            supportMax: 6,
            isFed: true,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMintworks: false,
            mintworksActive: false,
            mintworksCount: 0,
            hasGranary: false,
            granaryActive: false,
            foodUpkeepPerMinute: 0.1
          }),
          townType: "MARKET",
          townName: "Brassumstead",
          townPopulationTier: "TOWN"
        }
      ],
      players: [
        {
          id: "player-1",
          allies: [],
          vision: 4, // dx=4 reach to the remote town, independent of base VISION_RADIUS
          visionRadiusBonus: 0,
          territoryTileKeys: ["10,10"]
        },
        {
          id: "player-2",
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
          territoryTileKeys: ["14,10"]
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    const remoteTownTile = snapshot.tiles.find((tile) => tile.x === 14 && tile.y === 10);
    const remoteTown = remoteTownTile?.townJson ? JSON.parse(remoteTownTile.townJson) : undefined;
    expect(remoteTown).toEqual(
      expect.objectContaining({
        name: "Brassumstead",
        population: 23000,
        maxPopulation: 100000,
        isFed: true,
        supportCurrent: 3,
        supportMax: 6
      })
    );
  });

  it("derives full remote settlement summaries from recovered synthetic settlement identity", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        {
          x: 14,
          y: 10,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Settlement 14,10",
            type: "FARMING",
            populationTier: "SETTLEMENT",
            population: 800,
            maxPopulation: 10_000_000
          }),
          townType: "FARMING",
          townName: "Settlement 14,10",
          townPopulationTier: "SETTLEMENT"
        },
        // §5.4: a town needs real FOOD slot supply to be fed/not-dormant.
        { x: 15, y: 10, terrain: "LAND", resource: "FISH", ownerId: "player-2", ownershipState: "SETTLED" }
      ],
      players: [
        { id: "player-1", allies: [], vision: 4, visionRadiusBonus: 0, territoryTileKeys: ["10,10"] },
        { id: "player-2", strategicResources: { FOOD: 3 }, allies: [], vision: 1, visionRadiusBonus: 0, territoryTileKeys: ["14,10", "15,10"] }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    const remoteTownTile = snapshot.tiles.find((tile) => tile.x === 14 && tile.y === 10);
    const remoteTown = remoteTownTile?.townJson ? JSON.parse(remoteTownTile.townJson) : undefined;
    expect(remoteTown).toEqual(
      expect.objectContaining({
        name: "Settlement 14,10",
        populationTier: "SETTLEMENT",
        population: 800,
        maxPopulation: 10_000_000,
        isFed: true,
        supportCurrent: 0,
        supportMax: 0
      })
    );
  });

  it("derives full remote town summaries from migrated old thin non-settlement towns", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        {
          x: 14,
          y: 10,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Old Brass",
            type: "MARKET",
            populationTier: "TOWN",
            population: 10_000,
            maxPopulation: 10_000_000
          }),
          townType: "MARKET",
          townName: "Old Brass",
          townPopulationTier: "TOWN"
        }
      ],
      players: [
        { id: "player-1", allies: [], vision: 4, visionRadiusBonus: 0, territoryTileKeys: ["10,10"] },
        { id: "player-2", strategicResources: { FOOD: 3 }, allies: [], vision: 1, visionRadiusBonus: 0, territoryTileKeys: ["14,10"] }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    const remoteTownTile = snapshot.tiles.find((tile) => tile.x === 14 && tile.y === 10);
    const remoteTown = remoteTownTile?.townJson ? JSON.parse(remoteTownTile.townJson) : undefined;
    expect(remoteTown).toEqual(
      expect.objectContaining({
        name: "Old Brass",
        populationTier: "TOWN",
        population: 10_000,
        maxPopulation: 10_000_000
      })
    );
  });

  it("derives full remote town summaries from partial authoritative runtime towns", () => {
    const snapshot = buildPlayerSubscriptionSnapshot("player-1", {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        {
          x: 14,
          y: 10,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Brassumstead",
            type: "MARKET",
            populationTier: "TOWN",
            population: 23000,
            maxPopulation: 100000,
            connectedTownCount: 0,
            connectedTownBonus: 0
          }),
          townType: "MARKET",
          townName: "Brassumstead",
          townPopulationTier: "TOWN"
        },
        { x: 13, y: 9, terrain: "LAND" },
        { x: 14, y: 9, terrain: "LAND" },
        { x: 15, y: 9, terrain: "LAND" },
        // §5.4: FISH gives 2 FOOD slot supply (was FARM's 1) — the TOWN-tier
        // town needs 4 to not go dormant, so two FISH tiles.
        { x: 13, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "FISH" },
        { x: 16, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "FISH" },
        { x: 15, y: 10, terrain: "LAND" },
        { x: 13, y: 11, terrain: "LAND" },
        { x: 14, y: 11, terrain: "LAND" },
        { x: 15, y: 11, terrain: "LAND" }
      ],
      players: [
        { id: "player-1", allies: [], vision: 4, visionRadiusBonus: 0, territoryTileKeys: ["10,10"] },
        { id: "player-2", strategicResources: { FOOD: 3 }, allies: [], vision: 1, visionRadiusBonus: 0, territoryTileKeys: ["14,10", "13,10", "16,10"] }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    const remoteTownTile = snapshot.tiles.find((tile) => tile.x === 14 && tile.y === 10);
    const remoteTown = remoteTownTile?.townJson ? JSON.parse(remoteTownTile.townJson) : undefined;
    expect(remoteTown).toEqual(
      expect.objectContaining({
        name: "Brassumstead",
        population: 23000,
        maxPopulation: 100000,
        isFed: true,
        supportCurrent: 1,
        supportMax: 8
      })
    );
  });

  // Removed: "preserves tech-driven vision radius across snapshot export and
  // restart bootstrap" pinned Cartography's old flat visionRadiusBonus tech
  // effect (a plain per-player radius bump consumed by this file's own
  // addVision, independent of the VisibilityCoverageTracker's town/outpost
  // rings). That effect has been redesigned into townVisionRadiusBonus
  // (Cartography) and outpostVisionRadiusBonus (Survey Corps) — see
  // tech-tree.json — neither of which this snapshot's addVision models (it
  // only reads the flat per-player visionRadiusBonus export field), so no
  // current tech drives this code path any more. Left removed rather than
  // reworked: this snapshot's vision math being blind to town/outpost rings
  // is a separate, pre-existing gap from the VisibilityCoverageTracker path
  // (see runtime-visibility-classifier.ts's "sole source of truth" claim,
  // which this file doesn't actually honor) that predates this change.

  it("includes live town manpower regen and breakdown in subscription snapshots", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 100,
            manpower: 0,
            manpowerUpdatedAt: 0,
            manpowerCapSnapshot: 150,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Alpha", type: "MARKET", populationTier: "SETTLEMENT", goldPerMinute: 1 }
          },
          {
            x: 11,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Beta", type: "MARKET", populationTier: "SETTLEMENT", goldPerMinute: 1 }
          }
        ],
        activeLocks: []
      }
    });

    const snapshot = buildPlayerSubscriptionSnapshot("player-1", runtime.exportState());

    const settlementCap = TOWN_MANPOWER_BY_TIER.SETTLEMENT.cap;
    const settlementRegen = TOWN_MANPOWER_BY_TIER.SETTLEMENT.regenPerMinute;
    expect(snapshot.player).toEqual(
      expect.objectContaining({
        // Starting capital (§4.3) is additive on top of every owned town's cap/regen.
        manpowerCap: STARTING_CAPITAL_MANPOWER_CAP + settlementCap * 2, manpowerRegenPerMinute: STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE + settlementRegen * 2,
        manpowerBreakdown: {
          cap: [{ label: "Starting Capital", amount: STARTING_CAPITAL_MANPOWER_CAP }, { label: "2 Settlements", amount: settlementCap * 2 }],
          regen: [{ label: "Starting Capital", amount: STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE }, { label: "2 Settlements", amount: settlementRegen * 2 }]
        }
      })
    );
  });

  it("derives owned tile keys matching the internal summary Set — tiles and set are consistent", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        ["p1", { id: "p1", isAi: false, points: 0, manpower: 0, manpowerUpdatedAt: 0, techIds: new Set(), domainIds: new Set(), mods: { attack: 1, defense: 1, income: 1, vision: 1 }, techRootId: "rewrite-local", allies: new Set() }],
        ["p2", { id: "p2", isAi: false, points: 0, manpower: 0, manpowerUpdatedAt: 0, techIds: new Set(), domainIds: new Set(), mods: { attack: 1, defense: 1, income: 1, vision: 1 }, techRootId: "rewrite-local", allies: new Set() }],
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND" as const, ownerId: "p1", ownershipState: "SETTLED" as const },
          { x: 1, y: 0, terrain: "LAND" as const, ownerId: "p1", ownershipState: "SETTLED" as const },
          { x: 2, y: 0, terrain: "LAND" as const, ownerId: "p1", ownershipState: "FRONTIER" as const },
          { x: 3, y: 0, terrain: "LAND" as const, ownerId: "p2", ownershipState: "SETTLED" as const },
        ],
        players: [],
        activeLocks: [],
      }
    });

    for (const playerId of ["p1", "p2"]) {
      const internalKeys = [...runtime.summaryForPlayer(playerId).territoryTileKeys].sort();
      const derivedKeys = runtime.exportState().tiles
        .filter((t) => t.ownerId === playerId)
        .map((t) => `${t.x},${t.y}`)
        .sort();
      expect(derivedKeys).toEqual(internalKeys);
    }
  });
});
