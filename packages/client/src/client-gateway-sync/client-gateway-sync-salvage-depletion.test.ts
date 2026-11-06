import { describe, expect, it } from "vitest";
import { applyGatewayTileDeltaBatch, normalizeGatewayTileUpdate } from "./client-gateway-sync.js";
import { createClientOptimisticStateController } from "../client-optimistic-state/client-optimistic-state.js";
import type { Tile } from "../client-types.js";

const createDeps = () => {
  const state = {
    me: "me",
    tiles: new Map<string, Tile>(),
    tilesRevision: 0,
    tilesRevisionChangedKeys: new Set<string>(),
    tilesRevisionOverflowed: false,
    incomingAttacksByTile: new Map<string, { attackerName: string; resolvesAt: number }>(),
    discoveredTiles: new Set<string>(),
    upkeepLastTick: { foodCoverage: 1 },
    mods: { income: 1.0 }
  };
  const keyFor = (x: number, y: number) => `${x},${y}`;
  const { mergeIncomingTileDetail } = createClientOptimisticStateController({
    state: state as never,
    keyFor,
    terrainAt: () => "LAND",
    tileVisibilityStateAt: () => "visible"
  });
  return { state, keyFor, mergeIncomingTileDetail, mergeServerTileWithOptimisticState: (tile: Tile) => tile };
};

describe("depleted precursor salvage", () => {
  it.each([null, ""])("preserves the %s clear for the TILE_DELTA consumer", (resource) => {
    const update = { x: 4, y: 7, resource, economicStructureJson: "" };
    const normalized = normalizeGatewayTileUpdate(update, {
      existing: undefined, tiles: new Map(), keyFor: (x, y) => `${x},${y}`, foodCoverage: undefined
    });
    expect(normalized.resource).toBe(resource);
  });
  for (const detailLevel of ["summary", "full"] as const) {
    it(`clears the field through the real detail merge for ${detailLevel} tiles`, () => {
      const deps = createDeps();
      deps.state.tiles.set("4,7", {
        x: 4, y: 7, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", detailLevel,
        resource: "PRECURSOR_SALVAGE",
        economicStructure: { ownerId: "me", type: "RECLAMATION_WORKS", status: "active", salvageLoadsShipped: 2 }
      });
      // Sparse unrelated updates must retain the field.
      applyGatewayTileDeltaBatch(deps, [{ x: 4, y: 7, ownerId: "me", ownershipState: "SETTLED" }]);
      expect(deps.state.tiles.get("4,7")?.resource).toBe("PRECURSOR_SALVAGE");
      const revision = deps.state.tilesRevision;
      // Exact JSON shape the gateway sends after shipping the final load.
      applyGatewayTileDeltaBatch(deps, [{ x: 4, y: 7, ownerId: "me", ownershipState: "SETTLED", resource: null, economicStructureJson: "" }]);
      const tile = deps.state.tiles.get("4,7");
      expect(tile?.resource).toBeUndefined();
      expect(tile?.economicStructure).toBeUndefined();
      expect(deps.state.tilesRevision).toBeGreaterThan(revision);
      applyGatewayTileDeltaBatch(deps, [{ x: 4, y: 7, ownerId: "me", ownershipState: "SETTLED" }]);
      expect(deps.state.tiles.get("4,7")?.resource).toBeUndefined();
    });
  }
});
