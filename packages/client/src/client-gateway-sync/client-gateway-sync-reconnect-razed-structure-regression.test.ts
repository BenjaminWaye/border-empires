import { describe, expect, it } from "vitest";

import { applyGatewayInitialState } from "./client-gateway-sync.js";
import { createClientOptimisticStateController } from "../client-optimistic-state/client-optimistic-state.js";
import type { Tile } from "../client-types.js";

// Playtest: relay beacons captured while the tab was in the background (socket
// dropped) were razed on the server, but after the reconnect INIT the client
// still drew them. A reconnect keeps the cached tiles and merges the INIT
// snapshot over them; snapshot tiles simply omit a structure that isn't there,
// so "absent" read as "unchanged" and the stale beacon survived.
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

describe("reconnect INIT snapshot vs cached razed structures", () => {
  it("drops a relay beacon the snapshot no longer carries for a re-sent tile", () => {
    const deps = createDeps();
    deps.state.tiles.set("5,5", {
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "rival",
      ownershipState: "SETTLED",
      fogged: false,
      detailLevel: "full",
      economicStructure: { ownerId: "rival", type: "RELAY_BEACON", status: "active" } as Tile["economicStructure"],
      siegeBattery: { ownerId: "rival", status: "active" } as Tile["siegeBattery"],
      history: { captureCount: 0 } as unknown as Tile["history"]
    });
    deps.state.discoveredTiles.add("5,5");

    applyGatewayInitialState(
      deps,
      { tiles: [{ x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", razedWreck: "RELAY_BEACON" }] },
      { preserveExistingDiscoveredTiles: true }
    );

    const tile = deps.state.tiles.get("5,5");
    expect(tile?.ownerId).toBe("me");
    expect(tile?.economicStructure).toBeUndefined();
    expect(tile?.siegeBattery).toBeUndefined();
    expect(tile?.razedWreck).toBe("RELAY_BEACON");
    expect(tile?.fogged).toBe(false);
    // Full-detail fields the snapshot doesn't carry still survive, as on a live delta.
    expect(tile?.history).toEqual({ captureCount: 0 });
  });

  it("leaves tiles the snapshot doesn't re-send as fogged cache, structures intact", () => {
    const deps = createDeps();
    const beacon = { ownerId: "rival", type: "RELAY_BEACON", status: "active" } as Tile["economicStructure"];
    deps.state.tiles.set("8,8", { x: 8, y: 8, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", fogged: false, economicStructure: beacon });
    deps.state.discoveredTiles.add("8,8");

    applyGatewayInitialState(deps, { tiles: [{ x: 1, y: 1, terrain: "LAND" }] }, { preserveExistingDiscoveredTiles: true });

    expect(deps.state.tiles.get("8,8")).toEqual(expect.objectContaining({ fogged: true, economicStructure: beacon }));
  });
});
