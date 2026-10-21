import { describe, expect, it } from "vitest";

import { applyGatewayTileDeltaBatch } from "./client-gateway-sync.js";
import { createClientOptimisticStateController } from "../client-optimistic-state/client-optimistic-state.js";
import type { Tile } from "../client-types.js";

// Uses the REAL mergeIncomingTileDetail: the bug lived in that downstream
// merge, so an identity stub would pass while testing nothing.
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

const enemyMusterTile = (): Tile => ({
  x: 4,
  y: 7,
  terrain: "LAND",
  ownerId: "rival",
  ownershipState: "FRONTIER",
  detailLevel: "summary",
  fogged: false,
  muster: { ownerId: "rival", amount: 40, mode: "HOLD", updatedAt: 0 }
});

describe("enemy muster flag on a captured tile", () => {
  it("drops the flag when the capture batch clears it, without needing a tile-detail fetch", () => {
    const deps = createDeps();
    deps.state.tiles.set("4,7", enemyMusterTile());

    // The sim's capture batch for this tile, as the gateway forwards it: the
    // ownership flip (no muster field -- sparse) plus the explicit muster
    // clear broadcast (musterJson: "").
    applyGatewayTileDeltaBatch(deps, [
      { x: 4, y: 7, ownerId: "me", ownershipState: "FRONTIER", captureHoldUntil: 61_000, visibilityState: "VISIBLE" },
      { x: 4, y: 7, ownerId: "me", ownershipState: "FRONTIER", musterJson: "", visibilityState: "VISIBLE" }
    ]);

    const tile = deps.state.tiles.get("4,7");
    expect(tile?.ownerId).toBe("me");
    expect(tile?.muster).toBeUndefined();
  });

  it("clears other overlays the same way (a destroyed enemy fort)", () => {
    const deps = createDeps();
    deps.state.tiles.set("4,7", { ...enemyMusterTile(), fort: { ownerId: "rival", status: "active" } as Tile["fort"] });

    applyGatewayTileDeltaBatch(deps, [{ x: 4, y: 7, ownerId: "rival", ownershipState: "FRONTIER", fortJson: "" }]);

    expect(deps.state.tiles.get("4,7")?.fort).toBeUndefined();
    expect(deps.state.tiles.get("4,7")?.muster).toBeDefined();
  });
});
