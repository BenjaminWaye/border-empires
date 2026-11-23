import { describe, expect, it } from "vitest";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { mapTile, type SnapshotTile } from "../runtime-snapshot-sections.js";
import { bootSnapshotTileCache, snapshotTileSharingRecovered } from "./snapshot-tile-boot.js";

const noPlayers: ReadonlyMap<string, DomainPlayer> = new Map();

describe("snapshotTileSharingRecovered", () => {
  it("reuses the recovered tile object when it already holds exactly the mapped fields", () => {
    const town = { populationTier: "TOWN", type: "FARMING", name: "Ashford" } as NonNullable<DomainTileState["town"]>;
    const recovered = { x: 3, y: 4, terrain: "LAND", landBiome: "GRASS", ownerId: "p1", ownershipState: "SETTLED", town } as SnapshotTile;
    const tile = { ...recovered } as DomainTileState;
    expect(snapshotTileSharingRecovered(tile, recovered)).toBe(recovered);
  });

  it("makes a fresh copy when a field differs, is missing, or is extra", () => {
    const recovered = { x: 3, y: 4, terrain: "LAND", ownerId: "p1" } as SnapshotTile;
    const cases: DomainTileState[] = [
      { x: 3, y: 4, terrain: "LAND", ownerId: "p2" } as DomainTileState,
      { x: 3, y: 4, terrain: "LAND" } as DomainTileState,
      { x: 3, y: 4, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" } as DomainTileState
    ];
    for (const tile of cases) {
      const result = snapshotTileSharingRecovered(tile, recovered);
      expect(result).not.toBe(recovered);
      expect(result).toEqual(mapTile(tile));
    }
  });

  it("makes a fresh copy when a substructure was rebuilt, even with equal content", () => {
    const recovered = { x: 1, y: 1, terrain: "LAND", fort: { ownerId: "p1", status: "active" } } as SnapshotTile;
    const tile = { x: 1, y: 1, terrain: "LAND", fort: { ownerId: "p1", status: "active" } } as DomainTileState;
    expect(snapshotTileSharingRecovered(tile, recovered)).not.toBe(recovered);
  });

  it("makes a fresh copy when there is no recovered tile", () => {
    const tile = { x: 1, y: 1, terrain: "SEA" } as DomainTileState;
    expect(snapshotTileSharingRecovered(tile, undefined)).toEqual({ x: 1, y: 1, terrain: "SEA" });
  });
});

describe("bootSnapshotTileCache", () => {
  // Memory guard: the cache used to hold a second copy of every tile of the
  // world (~43 MB on 204,800 tiles) next to recovered tiles that say the same.
  it("shares every untouched recovered tile and copies only the ones that changed", () => {
    const recoveredTiles: SnapshotTile[] = [];
    const tiles = new Map<string, DomainTileState>();
    for (let x = 0; x < 50; x += 1) {
      const recovered = Object.freeze({ x, y: 0, terrain: x % 2 === 0 ? "SEA" : "LAND" }) as SnapshotTile;
      recoveredTiles.push(recovered);
      tiles.set(`${x},0`, { ...recovered } as DomainTileState);
    }
    tiles.set("7,0", { x: 7, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" } as DomainTileState);
    const snapshotTileCache = new Map<string, SnapshotTile>();

    const result = bootSnapshotTileCache({ tiles, players: noPlayers, snapshotTileCache, recoveredTiles });

    expect(result).toEqual({ tiles: 50, sharedWithRecovered: 49 });
    expect(snapshotTileCache.size).toBe(50);
    expect(snapshotTileCache.get("6,0")).toBe(recoveredTiles[6]);
    expect(snapshotTileCache.get("7,0")).not.toBe(recoveredTiles[7]);
    expect(snapshotTileCache.get("7,0")).toEqual({ x: 7, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" });
    // Whatever is shared must serialise exactly as a fresh copy would.
    for (const [key, tile] of tiles) expect(snapshotTileCache.get(key)).toEqual(mapTile(tile));
  });

  it("copies every tile when booted without recovered tiles", () => {
    const tiles = new Map<string, DomainTileState>([["0,0", { x: 0, y: 0, terrain: "SEA" } as DomainTileState]]);
    const snapshotTileCache = new Map<string, SnapshotTile>();
    expect(bootSnapshotTileCache({ tiles, players: noPlayers, snapshotTileCache, recoveredTiles: undefined })).toEqual({ tiles: 1, sharedWithRecovered: 0 });
    expect(snapshotTileCache.get("0,0")).toEqual({ x: 0, y: 0, terrain: "SEA" });
  });
});
