import { describe, expect, it } from "vitest";

import { applyGatewayInitialState, applyGatewayTileDeltaBatch } from "./client-gateway-sync.js";
import type { Tile } from "./client-types.js";

const createDeps = () => {
    const state = {
      tiles: new Map<string, Tile>(),
      incomingAttacksByTile: new Map<string, { attackerName: string; resolvesAt: number }>(),
      pendingCollectVisibleKeys: new Set<string>(),
      discoveredTiles: new Set<string>(),
      upkeepLastTick: { foodCoverage: 1 }
    };
  return {
    state: {
      ...state,
      me: "me",
      upkeepLastTick: {
        food: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
        iron: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
        supply: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
        crystal: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
        oil: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
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
          yieldRate: { goldPerMinute: 1, strategicPerDay: { FOOD: 72 } },
          yieldCap: { gold: 480, strategicEach: 24 }
        }
      ]
    });

    expect(deps.state.tiles.get("10,12")).toEqual(
      expect.objectContaining({
        yield: { gold: 2.5, strategic: { FOOD: 1.25 } },
        yieldRate: { goldPerMinute: 1, strategicPerDay: { FOOD: 72 } },
        yieldCap: { gold: 480, strategicEach: 24 }
      })
    );

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 10,
        y: 12,
        yield: { gold: 0.75, strategic: { FOOD: 0.25 } },
        yieldRate: { goldPerMinute: 1, strategicPerDay: { FOOD: 72 } },
        yieldCap: { gold: 480, strategicEach: 24 }
      }
    ]);

    expect(deps.state.tiles.get("10,12")).toEqual(
      expect.objectContaining({
        yield: { gold: 0.75, strategic: { FOOD: 0.25 } },
        yieldRate: { goldPerMinute: 1, strategicPerDay: { FOOD: 72 } },
        yieldCap: { gold: 480, strategicEach: 24 }
      })
    );
  });

  it("treats owned partial gateway towns as fed when food coverage is fully met", () => {
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

    expect(deps.state.tiles.get("350,219")).toEqual(
      expect.objectContaining({
        town: expect.objectContaining({
          name: "Rivetstead Causeway",
          isFed: true
        })
      })
    );
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
});
