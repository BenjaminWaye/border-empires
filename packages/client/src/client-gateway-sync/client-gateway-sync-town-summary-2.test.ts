// Town-summary gateway-sync tests, part 2 -- split out of
// client-gateway-sync-town-summary.test.ts to keep that file under the
// repo's 500-line cap.
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

describe("client gateway sync — town summaries (part 2)", () => {
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
});
