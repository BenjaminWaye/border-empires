/**
 * Regression tests for docs/plans/2026-07-06-radius-yield-delivery.md Phase 4:
 * a tile delta that changes economicStructureJson/resource/dockId must clear
 * any previously-cached (client-derived or server-authoritative) yieldRate
 * so the value is re-derived rather than stranded. Split into its
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
    tilesRevisionChangedKeys: new Set<string>(),
    tilesRevisionOverflowed: false,
    incomingAttacksByTile: new Map<string, { attackerName: string; resolvesAt: number }>(),
    discoveredTiles: new Set<string>(),
    mods: overrides?.mods ?? { income: 1.0 },
    upkeepLastTick: {
      food: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      titanium: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      umbrite: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      crystal: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      gold: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
      foodCoverage: 1
    }
  },
  keyFor: (x: number, y: number) => `${x},${y}`,
  mergeIncomingTileDetail: (_existing: Tile | undefined, incoming: Tile) => incoming,
  mergeServerTileWithOptimisticState: (tile: Tile) => tile
});

describe("stale yieldRate clearing on structure/resource/dock change (Phase 4)", () => {
  it("clears a server-authoritative dock yieldRate when the economicStructure changes without a fresh yieldRate in the same delta", () => {
    const deps = createDeps();
    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 1, y: 1, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", dockId: "dock-a",
          economicStructureJson: JSON.stringify({ type: "HARBOR_EXCHANGE", status: "active", ownerId: "me" }),
          yieldRate: { goldPerMinute: 7 }
        }
      ]
    });
    expect(deps.state.tiles.get("1,1")?.yieldRate?.goldPerMinute).toBe(7);

    // Structure removed (e.g. destroyed/captured) — delta carries no yieldRate.
    applyGatewayTileDeltaBatch(deps, [{ x: 1, y: 1, economicStructureJson: "" }]);

    // Stale 7 must not survive — it's cleared and re-derived from the bare
    // dock (DOCK_INCOME_PER_MIN, no connection/Harbor Exchange bonus).
    const rate = deps.state.tiles.get("1,1")?.yieldRate?.goldPerMinute;
    expect(rate).toBeDefined();
    expect(rate).not.toBe(7);
  });

  it("clears a stale yieldRate when the dockId is removed (e.g. dock captured/uncaptured)", () => {
    const deps = createDeps();
    applyGatewayInitialState(deps, {
      tiles: [
        {
          x: 2, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", dockId: "dock-a",
          yieldRate: { goldPerMinute: 5 }
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
          x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", dockId: "dock-b",
          yieldRate: { goldPerMinute: 5 }
        }
      ]
    });

    // Structure changes AND the server sends a fresh yieldRate in the same delta —
    // the fresh value must win, not the re-derived one.
    applyGatewayTileDeltaBatch(deps, [
      {
        x: 3, y: 3,
        economicStructureJson: JSON.stringify({ type: "HARBOR_EXCHANGE", status: "active", ownerId: "me" }),
        yieldRate: { goldPerMinute: 9 }
      }
    ]);

    expect(deps.state.tiles.get("3,3")?.yieldRate?.goldPerMinute).toBe(9);
  });
});
