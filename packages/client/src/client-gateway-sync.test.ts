import { describe, expect, it } from "vitest";

import { applyGatewayInitialState, applyGatewayTileDeltaBatch } from "./client-gateway-sync.js";
import type { Tile } from "./client-types.js";

const createDeps = () => {
    const state = {
      tiles: new Map<string, Tile>(),
      incomingAttacksByTile: new Map<string, { attackerName: string; resolvesAt: number }>(),
      pendingCollectVisibleKeys: new Set<string>(),
      discoveredTiles: new Set<string>()
    };
  return {
    state,
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
});
