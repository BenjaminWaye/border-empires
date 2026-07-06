/**
 * Regression tests for docs/plans/2026-07-06-radius-yield-delivery.md Phase 4:
 * a tile delta that changes economicStructureJson/resource/dockId must clear
 * any previously-cached (client-derived or server-authoritative) yieldRate/
 * yieldCap so the value is re-derived rather than stranded. Split into its
 * own file — client-gateway-sync.test.ts is already over the 500-line cap.
 */

import { describe, expect, it } from "vitest";

import { applyGatewayInitialState, applyGatewayTileDeltaBatch } from "./client-gateway-sync.js";
import type { Tile } from "../client-types.js";

const createDeps = (overrides?: { me?: string; mods?: { income?: number } }) => ({
  state: {
    me: overrides?.me ?? "me",
    tiles: new Map<string, Tile>(),
    tilesRevision: 0,
    incomingAttacksByTile: new Map<string, { attackerName: string; resolvesAt: number }>(),
    pendingCollectVisibleKeys: new Set<string>(),
    discoveredTiles: new Set<string>(),
    mods: overrides?.mods ?? { income: 1.0 },
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
});

describe("stale yieldRate/yieldCap clearing on structure/resource/dock change (Phase 4)", () => {
  it("clears a server-authoritative yieldRate when the economicStructure is removed without a fresh yieldRate in the same delta", () => {
    const deps = createDeps();
    // Seed a tile with a server-pushed boosted yieldRate (as if from an
    // active FARMSTEAD near a WATERWORKS — tileYieldNeedsServerAuthority true).
    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM",
          economicStructureJson: JSON.stringify({ type: "FARMSTEAD", status: "active", ownerId: "me" }),
          yieldRate: { goldPerMinute: 0, strategicPerDay: { FOOD: 162 } },
          yieldCap: { gold: 480, strategicEach: 54 }
        }
      ]
    });
    expect(deps.state.tiles.get("1,1")?.yieldRate?.strategicPerDay?.FOOD).toBe(162);

    // Structure removed (e.g. destroyed/captured) — delta carries no yieldRate/yieldCap.
    applyGatewayTileDeltaBatch(deps, [
      { x: 1, y: 1, economicStructureJson: "" }
    ]);

    const updated = deps.state.tiles.get("1,1");
    // Stale 162 must not survive — it should be cleared and re-derived from
    // the now-bare FARM resource (48/day base, no farmstead/waterworks bonus).
    expect(updated?.yieldRate?.strategicPerDay?.FOOD).toBe(48);
  });

  it("clears a stale yieldRate when the dockId is removed (e.g. dock captured/uncaptured)", () => {
    const deps = createDeps();
    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 2, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", dockId: "dock-a",
          yieldRate: { goldPerMinute: 5, strategicPerDay: {} },
          yieldCap: { gold: 100, strategicEach: 1 }
        }
      ]
    });
    expect(deps.state.tiles.get("2,2")?.yieldRate?.goldPerMinute).toBe(5);

    applyGatewayTileDeltaBatch(deps, [{ x: 2, y: 2, dockId: "" }]);

    const updated = deps.state.tiles.get("2,2");
    // Dock gone and no town → no yield at all; must not retain the stale dock rate.
    expect(updated?.yieldRate).toBeUndefined();
  });

  it("keeps the server-pushed yieldRate when the same delta supplies a fresh one alongside the structure change", () => {
    const deps = createDeps();
    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM",
          economicStructureJson: JSON.stringify({ type: "FARMSTEAD", status: "active", ownerId: "me" }),
          yieldRate: { goldPerMinute: 0, strategicPerDay: { FOOD: 162 } },
          yieldCap: { gold: 480, strategicEach: 54 }
        }
      ]
    });

    // Structure changes AND the server sends a fresh yieldRate in the same delta —
    // the fresh value must win, not the re-derived one.
    applyGatewayTileDeltaBatch(deps, [
      {
        x: 3, y: 3,
        economicStructureJson: JSON.stringify({ type: "FARMSTEAD", status: "active", ownerId: "me" }),
        yieldRate: { goldPerMinute: 0, strategicPerDay: { FOOD: 999 } },
        yieldCap: { gold: 480, strategicEach: 333 }
      }
    ]);

    expect(deps.state.tiles.get("3,3")?.yieldRate?.strategicPerDay?.FOOD).toBe(999);
  });

  it("applies a MINE structure change together with the Foundry-boosted yieldRate in the same delta", () => {
    const deps = createDeps();
    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 4, y: 4, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "IRON",
          economicStructureJson: JSON.stringify({ type: "MINE", status: "active", ownerId: "me" }),
          yieldRate: { goldPerMinute: 0, strategicPerDay: { IRON: 90 } },
          yieldCap: { gold: 480, strategicEach: 30 }
        }
      ]
    });

    applyGatewayTileDeltaBatch(deps, [
      {
        x: 4, y: 4,
        economicStructureJson: JSON.stringify({ type: "MINE", status: "active", ownerId: "me" }),
        yieldRate: { goldPerMinute: 0, strategicPerDay: { IRON: 180 } },
        yieldCap: { gold: 480, strategicEach: 60 }
      }
    ]);

    expect(deps.state.tiles.get("4,4")?.yieldRate?.strategicPerDay?.IRON).toBe(180);
  });
});
