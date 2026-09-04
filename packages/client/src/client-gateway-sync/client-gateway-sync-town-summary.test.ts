// Town-summary gateway-sync tests, split out of client-gateway-sync.test.ts
// to keep that file under the repo's 500-line cap.
import { describe, expect, it } from "vitest";

import { applyGatewayInitialState, applyGatewayTileDeltaBatch } from "./client-gateway-sync.js";
import { createClientOptimisticStateController } from "../client-optimistic-state/client-optimistic-state.js";
import type { Tile } from "../client-types.js";

const createDeps = (overrides?: { me?: string; mods?: { income?: number }; realMergeIncomingTileDetail?: boolean }) => {
  const state = {
      me: "",
      tiles: new Map<string, Tile>(),
      tilesRevision: 0,
      tilesRevisionChangedKeys: new Set<string>(),
      tilesRevisionOverflowed: false,
      incomingAttacksByTile: new Map<string, { attackerName: string; resolvesAt: number }>(),
      discoveredTiles: new Set<string>(),
      upkeepLastTick: { foodCoverage: 1 },
      mods: overrides?.mods ?? { income: 1.0 }
    };
  const resolvedState = {
    ...state,
    me: overrides?.me ?? "me",
    upkeepLastTick: {
      food: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      titanium: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      umbrite: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      crystal: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      gold: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      foodCoverage: 1
    }
  };
  const keyFor = (x: number, y: number) => `${x},${y}`;
  // Most tests isolate applyGatewayTileUpdate's own field logic, so the merge
  // hook is a cheap identity stub. Opt into the REAL mergeIncomingTileDetail to
  // exercise the full delta -> merge path (needed to catch the ownership
  // resurrection bug, which lives in that downstream merge, not here).
  const mergeIncomingTileDetail = overrides?.realMergeIncomingTileDetail
    ? createClientOptimisticStateController({
        state: resolvedState as never,
        keyFor,
        terrainAt: () => "LAND",
        tileVisibilityStateAt: () => "visible"
      }).mergeIncomingTileDetail
    : (_existing: Tile | undefined, incoming: Tile) => incoming;
  return {
    state: resolvedState,
    keyFor,
    mergeIncomingTileDetail,
    mergeServerTileWithOptimisticState: (tile: Tile) => tile
  };
};

describe("client gateway sync — town summaries", () => {
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
            hasMintworks: false,
            mintworksActive: false,
            hasGranary: false,
            granaryActive: false,
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
            hasMintworks: false,
            mintworksActive: false,
            hasGranary: false,
            granaryActive: false,
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
            hasMintworks: false,
            mintworksActive: false,
            hasGranary: false,
            granaryActive: false,
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
            manpowerCurrent: 80,
            manpowerCap: 100,
            hasMintworks: false,
            mintworksActive: false,
            hasGranary: false,
            granaryActive: false,
            nextPopulationTierUpgrade: {
              targetTier: "CITY",
              requiredPopulation: 100000,
              goldCost: 40,
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
          hasMintworks: true,
          mintworksActive: true,
          hasGranary: false,
          granaryActive: false,
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
        hasMintworks: true,
        mintworksActive: true
      })
    );
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
            hasMintworks: false,
            mintworksActive: false,
            hasGranary: false,
            granaryActive: false,
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
            hasMintworks: false,
            mintworksActive: false,
            hasGranary: false,
            granaryActive: false,
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
});
