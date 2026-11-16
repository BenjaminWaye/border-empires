import { describe, expect, it } from "vitest";

import { applyGatewayInitialState, withReconnectSnapshotClears } from "./client-gateway-sync.js";
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

const beacon = { ownerId: "rival", type: "RELAY_BEACON", status: "active" } as NonNullable<Tile["economicStructure"]>;
const town = { type: "MARKET", name: "Old Keep", populationTier: "TOWN" } as NonNullable<Tile["town"]>;

const reconnectWith = (cached: Tile, snapshotTile: Parameters<typeof withReconnectSnapshotClears>[0]) => {
  const deps = createDeps();
  const key = `${cached.x},${cached.y}`;
  deps.state.tiles.set(key, cached);
  deps.state.discoveredTiles.add(key);
  applyGatewayInitialState(deps, { tiles: [snapshotTile] }, { preserveExistingDiscoveredTiles: true });
  return deps.state.tiles.get(key);
};

describe("reconnect INIT snapshot vs cached razed structures", () => {
  it.each(["full", "summary"] as const)("drops a captured relay beacon the snapshot no longer carries (%s detail)", (detailLevel) => {
    const tile = reconnectWith(
      {
        x: 5, y: 5, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", fogged: false, detailLevel,
        economicStructure: beacon,
        siegeBattery: { ownerId: "rival", status: "active" } as NonNullable<Tile["siegeBattery"]>
      },
      // What visibleTileProjection sends for the captured tile: owner fields, no overlays.
      { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" }
    );
    expect(tile?.ownerId).toBe("me");
    expect(tile?.economicStructure).toBeUndefined();
    expect(tile?.siegeBattery).toBeUndefined();
    expect(tile?.fogged).toBe(false);
  });

  it("drops a razed beacon from a rival tile the snapshot sends in full (more than the stub keys)", () => {
    const tile = reconnectWith(
      { x: 4, y: 4, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", fogged: false, economicStructure: beacon },
      { x: 4, y: 4, terrain: "LAND", ownerId: "rival2", ownershipState: "FRONTIER", reachOwnerId: "rival2" }
    );
    expect(tile?.economicStructure).toBeUndefined();
  });

  it("drops a razed beacon from an ally's bare tile (own and allied tiles are never redacted)", () => {
    const deps = createDeps();
    (deps.state as { allies?: string[] }).allies = ["ally"];
    deps.state.tiles.set("4,5", { x: 4, y: 5, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", fogged: false, economicStructure: beacon });
    deps.state.discoveredTiles.add("4,5");
    applyGatewayInitialState(deps, { tiles: [{ x: 4, y: 5, terrain: "LAND", ownerId: "ally", ownershipState: "FRONTIER" }] }, { preserveExistingDiscoveredTiles: true });
    expect(deps.state.tiles.get("4,5")?.economicStructure).toBeUndefined();
  });

  it("keeps structures and towns the snapshot still sends", () => {
    const fort = { ownerId: "me", status: "active" } as NonNullable<Tile["fort"]>;
    const tile = reconnectWith(
      { x: 6, y: 6, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", fogged: false, fort },
      { x: 6, y: 6, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", fortJson: JSON.stringify(fort) }
    );
    expect(tile).toEqual(expect.objectContaining({ ownerId: "me", ownershipState: "SETTLED", fort }));
  });

  it("keeps fields the login projection never sends (capture hold, war scar, wreck)", () => {
    const tile = reconnectWith(
      { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", fogged: false, detailLevel: "full", captureHoldUntil: 123, warScarLevel: 2, warScarUntil: 456, razedWreck: "RELAY_BEACON", razedWreckUntil: 789, economicStructure: beacon },
      { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" }
    );
    expect(tile).toEqual(expect.objectContaining({ captureHoldUntil: 123, warScarLevel: 2, warScarUntil: 456, razedWreck: "RELAY_BEACON", razedWreckUntil: 789 }));
    expect(tile?.economicStructure).toBeUndefined();
  });

  it.each([
    ["terrain-only (login projection)", { x: 9, y: 9, terrain: "LAND" as const }],
    ["with ownership (gateway cache after a live lock delta)", { x: 9, y: 9, terrain: "LAND" as const, ownerId: "rival", ownershipState: "SETTLED" as const }]
  ])("keeps a cached rival tile's structures behind a lock-target stub, %s", (_label, stub) => {
    const tile = reconnectWith(
      { x: 9, y: 9, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", fogged: false, detailLevel: "full", economicStructure: beacon, town },
      stub
    );
    expect(tile).toEqual(expect.objectContaining({ economicStructure: beacon, town }));
  });

  it("keeps the cached town when the snapshot sends town identity without townJson (map overview)", () => {
    const tile = reconnectWith(
      { x: 2, y: 2, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", fogged: false, detailLevel: "full", town },
      { x: 2, y: 2, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", townType: "MARKET", townName: "Old Keep", townPopulationTier: "TOWN" }
    );
    expect(tile?.town).toEqual(town);
  });

  it("clears a town the snapshot no longer sends any identity for", () => {
    const tile = reconnectWith(
      { x: 1, y: 2, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", fogged: false, detailLevel: "full", town, townType: "MARKET" },
      { x: 1, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" }
    );
    expect(tile?.town).toBeUndefined();
    expect(tile?.townType).toBeUndefined();
  });

  it("only clears ownership for a clear-only tile, keeping the rest of the cached tile", () => {
    const tile = reconnectWith(
      { x: 7, y: 7, terrain: "LAND", ownerId: "barbarian", ownershipState: "BARBARIAN", resource: "FARM", town, fogged: false },
      { x: 7, y: 7, ownershipClearOnly: true }
    );
    expect(tile?.ownerId).toBeUndefined();
    expect(tile).toEqual(expect.objectContaining({ resource: "FARM", town, fogged: true }));
  });

  it("leaves a fresh (non-reconnect) INIT tile exactly as sent", () => {
    const deps = createDeps();
    applyGatewayInitialState(deps, { tiles: [{ x: 2, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" }] });
    expect(deps.state.tiles.get("2,2")).toEqual(expect.objectContaining({ ownerId: "me", ownershipState: "SETTLED" }));
  });

  it("leaves tiles the snapshot doesn't re-send as fogged cache, structures intact", () => {
    const deps = createDeps();
    deps.state.tiles.set("8,8", { x: 8, y: 8, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", fogged: false, economicStructure: beacon });
    deps.state.discoveredTiles.add("8,8");
    applyGatewayInitialState(deps, { tiles: [{ x: 1, y: 1, terrain: "LAND" }] }, { preserveExistingDiscoveredTiles: true });
    expect(deps.state.tiles.get("8,8")).toEqual(expect.objectContaining({ fogged: true, economicStructure: beacon }));
  });
});
