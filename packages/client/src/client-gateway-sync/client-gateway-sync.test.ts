import { describe, expect, it, vi } from "vitest";

import { applyGatewayInitialState, applyGatewayTileDeltaBatch } from "./client-gateway-sync.js";
import type { Tile } from "../client-types.js";

const createDeps = (overrides?: { me?: string; mods?: { income?: number } }) => {
  const state = {
      me: "",
      tiles: new Map<string, Tile>(),
      tilesRevision: 0,
      incomingAttacksByTile: new Map<string, { attackerName: string; resolvesAt: number }>(),
      pendingCollectVisibleKeys: new Set<string>(),
      discoveredTiles: new Set<string>(),
      upkeepLastTick: { foodCoverage: 1 },
      mods: overrides?.mods ?? { income: 1.0 }
    };
  return {
    state: {
      ...state,
      me: overrides?.me ?? "me",
      upkeepLastTick: {
        food: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
        iron: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
        supply: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
        crystal: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
        gold: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
        foodCoverage: 1
      }
    },
    keyFor: (x: number, y: number) => `${x},${y}`,
    mergeIncomingTileDetail: (_existing: Tile | undefined, incoming: Tile) => incoming,
    mergeServerTileWithOptimisticState: (tile: Tile) => tile
  };
};

describe("client gateway sync", () => {
  it("clears revealed tiles when TILE_SNAPSHOT_REPLACE comes back with an empty visible set after reveal", () => {
    const deps = createDeps();

    for (let x = 1; x <= 3; x += 1) {
      deps.state.tiles.set(`${x},1`, {
        x,
        y: 1,
        terrain: "LAND",
        ownerId: `rival-${x}`,
        ownershipState: "SETTLED",
        fogged: false
      });
      deps.state.discoveredTiles.add(`${x},1`);
    }

    const applied = applyGatewayInitialState(deps, { tiles: [] });

    expect(applied).toBe(0);
    expect(deps.state.tiles.size).toBe(0);
    expect(deps.state.discoveredTiles.size).toBe(0);
  });

  it("treats a missing tiles field as a no-op so partial INIT payloads do not wipe state", () => {
    const deps = createDeps();

    deps.state.tiles.set("4,4", {
      x: 4,
      y: 4,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      fogged: false
    });
    deps.state.discoveredTiles.add("4,4");

    const applied = applyGatewayInitialState(deps, {});

    expect(applied).toBe(0);
    expect(deps.state.tiles.has("4,4")).toBe(true);
    expect(deps.state.discoveredTiles.has("4,4")).toBe(true);
  });

  it("replaces stale local tiles when applying rewrite init state", () => {
    const deps = createDeps();

    deps.state.tiles.set("9,9", {
      x: 9,
      y: 9,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      fogged: false
    });
    deps.state.discoveredTiles.add("9,9");
    deps.state.incomingAttacksByTile.set("9,9", { attackerName: "AI 1", resolvesAt: 123 });
    deps.state.pendingCollectVisibleKeys.add("9,9");

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 10,
          y: 12,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED"
        }
      ]
    });

    expect(deps.state.tiles.has("9,9")).toBe(false);
    expect(deps.state.tiles.get("10,12")).toEqual(
      expect.objectContaining({
        x: 10,
        y: 12,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED"
      })
    );
    expect(deps.state.discoveredTiles.has("9,9")).toBe(false);
    expect(deps.state.discoveredTiles.has("10,12")).toBe(true);
    expect(deps.state.incomingAttacksByTile.size).toBe(0);
    expect(deps.state.pendingCollectVisibleKeys.size).toBe(0);
  });

  it("preserves yield fields from gateway initial state and later tile deltas", () => {
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 10,
          y: 12,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          yield: { gold: 2.5, strategic: { FOOD: 1.25 } },
          yieldRate: { goldPerMinute: 1, strategicPerDay: { FOOD: 48 } },
          yieldCap: { gold: 480, strategicEach: 16 }
        }
      ]
    });

    expect(deps.state.tiles.get("10,12")).toEqual(
      expect.objectContaining({
        yield: { gold: 2.5, strategic: { FOOD: 1.25 } },
        yieldRate: { goldPerMinute: 1, strategicPerDay: { FOOD: 48 } },
        yieldCap: { gold: 480, strategicEach: 16 }
      })
    );

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 10,
        y: 12,
        yield: { gold: 0.75, strategic: { FOOD: 0.25 } },
        yieldRate: { goldPerMinute: 1, strategicPerDay: { FOOD: 48 } },
        yieldCap: { gold: 480, strategicEach: 16 }
      }
    ]);

    expect(deps.state.tiles.get("10,12")).toEqual(
      expect.objectContaining({
        yield: { gold: 0.75, strategic: { FOOD: 0.25 } },
        yieldRate: { goldPerMinute: 1, strategicPerDay: { FOOD: 48 } },
        yieldCap: { gold: 480, strategicEach: 16 }
      })
    );
  });

  it("applies and clears frontier decay timers from gateway tile deltas", () => {
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 11,
          y: 12,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "FRONTIER",
          frontierDecayAt: 601_000,
          frontierDecayKind: "ENCIRCLEMENT"
        }
      ]
    });

    expect(deps.state.tiles.get("11,12")?.frontierDecayAt).toBe(601_000);
    expect(deps.state.tiles.get("11,12")?.frontierDecayKind).toBe("ENCIRCLEMENT");

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 11,
        y: 12,
        ownerId: "me",
        ownershipState: "FRONTIER",
        frontierDecayAt: null,
        frontierDecayKind: null
      }
    ]);

    expect(deps.state.tiles.get("11,12")?.frontierDecayAt).toBeUndefined();
    expect(deps.state.tiles.get("11,12")?.frontierDecayKind).toBeUndefined();
  });

  it("applies pressed-tile detail metadata from gateway tile delta batches", () => {
    const deps = createDeps();

    deps.state.tiles.set("49,219", {
      x: 49,
      y: 219,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      fogged: false,
      detailLevel: "summary"
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 49,
        y: 219,
        detailLevel: "full",
        upkeepEntries: [{ label: "Wooden Fort", perMinute: { GOLD: 0.05 } }],
        history: { previousOwners: ["me"], captureCount: 1, structureHistory: ["WOODEN_FORT"] },
        economicStructureJson: JSON.stringify({ ownerId: "me", type: "WOODEN_FORT", status: "active" })
      }
    ]);

    expect(deps.state.tiles.get("49,219")).toEqual(
      expect.objectContaining({
        detailLevel: "full",
        upkeepEntries: [{ label: "Wooden Fort", perMinute: { GOLD: 0.05 } }],
        history: { previousOwners: ["me"], captureCount: 1, structureHistory: ["WOODEN_FORT"] },
        economicStructure: { ownerId: "me", type: "WOODEN_FORT", status: "active" }
      })
    );
  });

  it("accepts town summaries once population clears the renderable threshold", () => {
    // The old behavior rejected any town summary missing owner-only economy
    // fields, which silently dropped foreign towns under satellite reveal.
    // The new gate uses population (>= 500) as the "this is a real town"
    // signal — see MIN_RENDERABLE_TOWN_POPULATION in client-gateway-sync.ts.
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 350,
          y: 219,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Rivetstead Causeway",
            type: "MARKET",
            populationTier: "TOWN",
            population: 15_590,
            maxPopulation: 50_000,
            baseGoldPerMinute: 0,
            goldPerMinute: 0,
            cap: 0,
            isFed: false,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          })
        }
      ]
    });

    expect(deps.state.tiles.get("350,219")?.town?.population).toBe(15_590);
    expect(deps.state.tiles.get("350,219")?.town?.populationTier).toBe("TOWN");
  });

  it("rejects town summaries when population is below the renderable threshold", () => {
    // Anything below 500 is treated as partial/in-flight data so the renderer
    // falls back to the spinner state instead of acting on bogus zeros.
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 350,
          y: 219,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Rivetstead Causeway",
            type: "MARKET",
            populationTier: "TOWN",
            population: 0,
            maxPopulation: 50_000
          })
        }
      ]
    });

    expect(deps.state.tiles.get("350,219")?.town).toBeUndefined();
  });


  it("preserves existing fed state for non-owned towns when later gateway deltas only resend town identity", () => {
    const deps = createDeps();
    deps.state.me = "me";
    deps.state.upkeepLastTick.foodCoverage = 0;

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 91,
          y: 44,
          terrain: "LAND",
          ownerId: "ai-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Ironwick",
            type: "MARKET",
            populationTier: "TOWN",
            population: 14_200,
            maxPopulation: 50_000,
            baseGoldPerMinute: 2,
            goldPerMinute: 1.2,
            cap: 480,
            supportCurrent: 3,
            supportMax: 6,
            isFed: true,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          })
        }
      ]
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 91,
        y: 44,
        ownerId: "ai-1",
        ownershipState: "SETTLED",
        townType: "MARKET",
        townName: "Ironwick",
        townPopulationTier: "TOWN"
      }
    ]);

    expect(deps.state.tiles.get("91,44")).toEqual(
      expect.objectContaining({
        town: expect.objectContaining({
          isFed: true,
          population: 14_200,
          supportCurrent: 3,
          supportMax: 6
        })
      })
    );
  });

  it("ignores first-seen non-owned lossy town summaries until authoritative data arrives", () => {
    const deps = createDeps();
    deps.state.me = "me";
    deps.state.upkeepLastTick.foodCoverage = 0;

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 92,
          y: 44,
          terrain: "LAND",
          ownerId: "ai-2",
          ownershipState: "SETTLED",
          townType: "MARKET",
          townName: "Brassumstead",
          townPopulationTier: "TOWN"
        }
      ]
    });

    expect(deps.state.tiles.get("92,44")).toEqual(
      expect.objectContaining({
        x: 92,
        y: 44,
        terrain: "LAND",
        ownerId: "ai-2",
        ownershipState: "SETTLED"
      })
    );
    expect(deps.state.tiles.get("92,44")?.town).toBeUndefined();
  });

  it("keeps previously known population fields when later gateway deltas only send partial town identity", () => {
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 40,
          y: 18,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Aetherford Boiler",
            type: "MARKET",
            populationTier: "TOWN",
            population: 18_420,
            maxPopulation: 50_000,
            populationGrowthPerMinute: 12.8,
            baseGoldPerMinute: 2,
            goldPerMinute: 1,
            cap: 480,
            supportCurrent: 3,
            supportMax: 6,
            isFed: true,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          })
        }
      ]
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 40,
        y: 18,
        ownerId: "me",
        ownershipState: "SETTLED",
        townType: "MARKET",
        townName: "Aetherford Boiler",
        townPopulationTier: "TOWN"
      }
    ]);

    expect(deps.state.tiles.get("40,18")).toEqual(
      expect.objectContaining({
        town: expect.objectContaining({
          name: "Aetherford Boiler",
          population: 18_420,
          maxPopulation: 50_000,
          supportCurrent: 3,
          supportMax: 6,
          populationGrowthPerMinute: 12.8
        })
      })
    );
  });

  it("clears omitted optional fields when authoritative townJson refreshes a cached town", () => {
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 40,
          y: 18,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Aetherford Boiler",
            type: "MARKET",
            populationTier: "TOWN",
            population: 18_420,
            maxPopulation: 50_000,
            populationGrowthPerMinute: 12.8,
            baseGoldPerMinute: 2,
            goldPerMinute: 1,
            cap: 480,
            supportCurrent: 3,
            supportMax: 6,
            isFed: true,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            goldIncomePausedReason: "MANPOWER_NOT_FULL",
            manpowerCurrent: 80,
            manpowerCap: 100,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false,
            nextPopulationTierUpgrade: {
              targetTier: "CITY",
              requiredPopulation: 100000,
               foodCost: 500,
              available: false
            }
          })
        }
      ]
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 40,
        y: 18,
        ownerId: "me",
        ownershipState: "SETTLED",
        townJson: JSON.stringify({
          name: "Aetherford Boiler",
          type: "MARKET",
          populationTier: "TOWN",
          population: 18_600,
          maxPopulation: 50_000,
          populationGrowthPerMinute: 13.1,
          baseGoldPerMinute: 2,
          goldPerMinute: 2,
          cap: 960,
          supportCurrent: 4,
          supportMax: 6,
          isFed: true,
          connectedTownCount: 1,
          connectedTownBonus: 0.1,
          hasMarket: true,
          marketActive: true,
          hasGranary: false,
          granaryActive: false,
          hasBank: false,
          bankActive: false
        })
      }
    ]);

    expect(deps.state.tiles.get("40,18")?.town).toEqual(
      expect.objectContaining({
        population: 18_600,
        goldPerMinute: 2,
        supportCurrent: 4,
        supportMax: 6,
        connectedTownCount: 1,
        connectedTownBonus: 0.1,
        hasMarket: true,
        marketActive: true
      })
    );
    expect(deps.state.tiles.get("40,18")?.town?.goldIncomePausedReason).toBeUndefined();
    expect(deps.state.tiles.get("40,18")?.town?.manpowerCurrent).toBeUndefined();
    expect(deps.state.tiles.get("40,18")?.town?.manpowerCap).toBeUndefined();
    expect(deps.state.tiles.get("40,18")?.town?.nextPopulationTierUpgrade).toBeUndefined();
  });

  it("clears cached town state when gateway sends explicit empty townJson", () => {
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 40,
          y: 18,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Old Boiler",
            type: "MARKET",
            populationTier: "TOWN",
            population: 18420,
            maxPopulation: 50000,
            populationGrowthPerMinute: 12.8,
            baseGoldPerMinute: 2,
            goldPerMinute: 1,
            cap: 480,
            supportCurrent: 3,
            supportMax: 6,
            isFed: true,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          })
        }
      ]
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 40,
        y: 18,
        ownerId: "me",
        ownershipState: "SETTLED",
        townJson: ""
      }
    ]);

    expect(deps.state.tiles.get("40,18")?.town).toBeUndefined();
  });

  it("does not clear cached town state when sparse identity updates omit townType", () => {
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 40,
          y: 18,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Old Boiler",
            type: "MARKET",
            populationTier: "TOWN",
            population: 18420,
            maxPopulation: 50000,
            populationGrowthPerMinute: 12.8,
            baseGoldPerMinute: 2,
            goldPerMinute: 1,
            cap: 480,
            supportCurrent: 3,
            supportMax: 6,
            isFed: true,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          })
        }
      ]
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 40,
        y: 18,
        ownerId: "me",
        ownershipState: "SETTLED",
        townName: "Renamed Boiler"
      }
    ]);

    expect(deps.state.tiles.get("40,18")?.town).toEqual(
      expect.objectContaining({
        name: "Renamed Boiler",
        type: "MARKET",
        populationTier: "TOWN",
        population: 18420,
        maxPopulation: 50000
      })
    );
  });

  it("does not change cached town tier from sparse identity-only updates", () => {
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 40,
          y: 18,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Aetherford Boiler",
            type: "MARKET",
            populationTier: "SETTLEMENT",
            population: 4200,
            maxPopulation: 10000,
            populationGrowthPerMinute: 10.2,
            baseGoldPerMinute: 1,
            goldPerMinute: 1,
            cap: 480,
            supportCurrent: 0,
            supportMax: 0,
            isFed: true,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          })
        }
      ]
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 40,
        y: 18,
        ownerId: "me",
        ownershipState: "SETTLED",
        townType: "MARKET",
        townName: "Aetherford Boiler",
        townPopulationTier: "TOWN"
      }
    ]);

    expect(deps.state.tiles.get("40,18")?.town).toEqual(
      expect.objectContaining({
        name: "Aetherford Boiler",
        populationTier: "SETTLEMENT",
        population: 4200,
        maxPopulation: 10000,
        goldPerMinute: 1,
        cap: 480
      })
    );
  });

  it("does not invent town stats when gateway init only sends town identity", () => {
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 77,
          y: 21,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          townType: "FARMING",
          townName: "Northwatch",
          townPopulationTier: "TOWN"
        }
      ]
    });

    expect(deps.state.tiles.get("77,21")?.town).toBeUndefined();
    expect(deps.state.tiles.get("77,21")).toMatchObject({
      townType: "FARMING",
      townName: "Northwatch",
      townPopulationTier: "TOWN"
    });
  });

  it("does not invent upgrade stats when sparse gateway updates only change town identity", () => {
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 77,
          y: 21,
          terrain: "LAND",
          ownerId: "me",
          ownershipState: "SETTLED",
          townType: "FARMING",
          townName: "Northwatch",
          townPopulationTier: "SETTLEMENT"
        }
      ]
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 77,
        y: 21,
        ownerId: "me",
        ownershipState: "SETTLED",
        townType: "FARMING",
        townName: "Northwatch",
        townPopulationTier: "TOWN"
      }
    ]);

    expect(deps.state.tiles.get("77,21")?.town).toBeUndefined();
    expect(deps.state.tiles.get("77,21")).toMatchObject({
      townType: "FARMING",
      townName: "Northwatch",
      townPopulationTier: "TOWN"
    });
  });

  it("clears thin town identity when the gateway clears town state", () => {
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 88,
          y: 12,
          terrain: "LAND",
          ownerId: "ai-1",
          ownershipState: "SETTLED",
          townType: "MARKET",
          townName: "Brassumstead",
          townPopulationTier: "TOWN"
        }
      ]
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 88,
        y: 12,
        townJson: ""
      }
    ]);

    expect(deps.state.tiles.get("88,12")).toEqual(
      expect.not.objectContaining({
        townType: expect.anything(),
        townName: expect.anything(),
        townPopulationTier: expect.anything()
      })
    );
  });

  it("preserves thin remote town identity without inventing town stats", () => {
    const deps = createDeps();

    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 88,
          y: 12,
          terrain: "LAND",
          ownerId: "ai-1",
          ownershipState: "SETTLED",
          townType: "MARKET",
          townName: "Brassumstead",
          townPopulationTier: "TOWN"
        }
      ]
    });

    expect(deps.state.tiles.get("88,12")).toEqual(
      expect.objectContaining({
        townType: "MARKET",
        townName: "Brassumstead",
        townPopulationTier: "TOWN"
      })
    );
    expect(deps.state.tiles.get("88,12")?.town).toBeUndefined();
  });

  it("keeps previously discovered tiles fogged when reconnecting to the same runtime", () => {
    const deps = createDeps();

    deps.state.tiles.set("9,9", {
      x: 9,
      y: 9,
      terrain: "SEA",
      resource: "FISH",
      fogged: false,
      detailLevel: "summary"
    });
    deps.state.discoveredTiles.add("9,9");

    applyGatewayInitialState(
      deps,
      {
        tiles: [
          {
            x: 10,
            y: 12,
            terrain: "LAND",
            ownerId: "me",
            ownershipState: "SETTLED"
          }
        ]
      },
      { preserveExistingDiscoveredTiles: true }
    );

    expect(deps.state.tiles.get("9,9")).toEqual(
      expect.objectContaining({
        x: 9,
        y: 9,
        terrain: "SEA",
        resource: "FISH",
        fogged: true
      })
    );
    expect(deps.state.discoveredTiles.has("9,9")).toBe(true);
    expect(deps.state.tiles.get("10,12")).toEqual(
      expect.objectContaining({
        x: 10,
        y: 12,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        fogged: false
      })
    );
  });

  it("clears ownership when the gateway sends explicit null owner fields", () => {
    const deps = createDeps();

    deps.state.tiles.set("10,12", {
      x: 10,
      y: 12,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      fogged: false
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 10,
        y: 12,
        ownerId: null,
        ownershipState: null
      }
    ]);

    expect(deps.state.tiles.get("10,12")).toEqual(
      expect.objectContaining({
        x: 10,
        y: 12,
        terrain: "LAND",
        fogged: false
      })
    );
    expect(deps.state.tiles.get("10,12")?.ownerId).toBeUndefined();
    expect(deps.state.tiles.get("10,12")?.ownershipState).toBeUndefined();
  });

  it("preserves shard sites when a frontier claim delta explicitly carries an empty shard field", () => {
    const deps = createDeps();
    deps.state.me = "me";

    deps.state.tiles.set("10,12", {
      x: 10,
      y: 12,
      terrain: "LAND",
      fogged: false,
      shardSite: { kind: "CACHE", amount: 1 }
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 10,
        y: 12,
        ownerId: "me",
        ownershipState: "FRONTIER",
        shardSiteJson: ""
      }
    ]);

    expect(deps.state.tiles.get("10,12")).toEqual(
      expect.objectContaining({
        x: 10,
        y: 12,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "FRONTIER",
        shardSite: { kind: "CACHE", amount: 1 }
      })
    );
  });

  it("clears stale runtime land context when a gateway tile stops being land", () => {
    const deps = createDeps();

    deps.state.tiles.set("10,12", {
      x: 10,
      y: 12,
      terrain: "LAND",
      fogged: false,
      detailLevel: "summary",
      landBiome: "SAND",
      regionType: "CRYSTAL_WASTES"
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 10,
        y: 12,
        terrain: "MOUNTAIN"
      }
    ]);

    expect(deps.state.tiles.get("10,12")).toEqual(
      expect.objectContaining({
        x: 10,
        y: 12,
        terrain: "MOUNTAIN",
        fogged: false
      })
    );
    expect(deps.state.tiles.get("10,12")?.landBiome).toBeUndefined();
    expect(deps.state.tiles.get("10,12")?.regionType).toBeUndefined();
  });

  it("invalidates cached terrain rendering once when gateway land context changes", () => {
    const deps = {
      ...createDeps(),
      clearRenderCaches: vi.fn(),
      buildMiniMapBase: vi.fn()
    };

    deps.state.tiles.set("10,12", {
      x: 10,
      y: 12,
      terrain: "LAND",
      fogged: false,
      detailLevel: "summary",
      landBiome: "GRASS",
      regionType: "ANCIENT_HEARTLAND"
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 10,
        y: 12,
        terrain: "LAND",
        landBiome: "SAND",
        regionType: "CRYSTAL_WASTES"
      }
    ]);

    expect(deps.state.tiles.get("10,12")).toEqual(
      expect.objectContaining({
        x: 10,
        y: 12,
        terrain: "LAND",
        landBiome: "SAND",
        regionType: "CRYSTAL_WASTES"
      })
    );
    expect(deps.clearRenderCaches).toHaveBeenCalledTimes(1);
    expect(deps.buildMiniMapBase).toHaveBeenCalledTimes(1);
  });

  it("preserves ownership when gateway deltas omit owner fields", () => {
    const deps = createDeps();

    deps.state.tiles.set("10,12", {
      x: 10,
      y: 12,
      terrain: "LAND",
      fogged: false,
      ownerId: "me",
      ownershipState: "SETTLED",
      detailLevel: "summary",
      landBiome: "GRASS",
      regionType: "ANCIENT_HEARTLAND"
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 10,
        y: 12,
        landBiome: "SAND",
        regionType: "CRYSTAL_WASTES"
      }
    ]);

    expect(deps.state.tiles.get("10,12")).toEqual(
      expect.objectContaining({
        x: 10,
        y: 12,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        landBiome: "SAND",
        regionType: "CRYSTAL_WASTES"
      })
    );
  });

  it("applies the viewer's income multiplier only to own tiles, not enemy tiles", () => {
    const ownMultiplier = 1.25;
    const deps = createDeps({ mods: { income: ownMultiplier } });

    // Seed an own tile (settlement, no persisted goldPerMinute — hits fallback)
    deps.state.tiles.set("1,1", {
      x: 1,
      y: 1,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      fogged: false,
      detailLevel: "summary"
    });

    // Seed an enemy tile with the same shape
    deps.state.tiles.set("2,2", {
      x: 2,
      y: 2,
      terrain: "LAND",
      ownerId: "rival",
      ownershipState: "SETTLED",
      fogged: false,
      detailLevel: "summary"
    });

    const settlementTownJson = JSON.stringify({
      type: "MARKET",
      populationTier: "SETTLEMENT",
      population: 1000,
      maxPopulation: 5000
    });

    // Send town data for both tiles in one batch
    applyGatewayTileDeltaBatch(deps, [
      { x: 1, y: 1, townJson: settlementTownJson },
      { x: 2, y: 2, townJson: settlementTownJson }
    ]);

    // Own tile: settlement fallback gold = 1 × 1.25 × 1.0 = 1.25
    const ownTile = deps.state.tiles.get("1,1");
    expect(ownTile?.yieldRate?.goldPerMinute).toBe(1.25);

    // Enemy tile: income multiplier gated to 1.0 — settlement fallback = 1 × 1.0 × 1.0 = 1.0
    const enemyTile = deps.state.tiles.get("2,2");
    expect(enemyTile?.yieldRate?.goldPerMinute).toBe(1.0);
  });

  it("does not discover or reveal a never-seen tile from a broadcast-only ownership-clear delta", () => {
    const deps = createDeps();

    applyGatewayTileDeltaBatch(deps, [{ x: 9, y: 9, ownershipClearOnly: true }]);

    expect(deps.state.tiles.has("9,9")).toBe(false);
    expect(deps.state.discoveredTiles.has("9,9")).toBe(false);
  });

  it("clears stale ownership on an already-known fogged tile without discovering or unfogging it", () => {
    const deps = createDeps();

    deps.state.tiles.set("3,3", {
      x: 3,
      y: 3,
      terrain: "LAND",
      ownerId: "barbarian-1",
      ownershipState: "BARBARIAN",
      fogged: true
    });

    applyGatewayTileDeltaBatch(deps, [{ x: 3, y: 3, ownershipClearOnly: true }]);

    const tile = deps.state.tiles.get("3,3");
    expect(tile?.ownerId).toBeUndefined();
    expect(tile?.ownershipState).toBeUndefined();
    expect(tile?.fogged).toBe(true);
    expect(deps.state.discoveredTiles.has("3,3")).toBe(false);
  });

  it("still discovers and unfogs a tile from a normal (non-clear-only) delta", () => {
    const deps = createDeps();

    applyGatewayTileDeltaBatch(deps, [{ x: 5, y: 5, terrain: "LAND", ownerId: "rival-1", ownershipState: "SETTLED" }]);

    const tile = deps.state.tiles.get("5,5");
    expect(tile?.ownerId).toBe("rival-1");
    expect(tile?.ownershipState).toBe("SETTLED");
    expect(tile?.fogged).toBe(false);
    expect(deps.state.discoveredTiles.has("5,5")).toBe(true);
  });
});
