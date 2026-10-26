import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { seedResourceNetworks } from "../resource-networks-worldgen.js";

const map = (): Map<string, DomainTileState> => new Map(Array.from({ length: 16 * 8 }, (_, i) => {
  const tile: DomainTileState = { x: i % 16, y: Math.floor(i / 16), terrain: "LAND" };
  return [`${tile.x},${tile.y}`, tile];
}));
const treeAt = (x: number, y: number): boolean => (x + y) % 2 === 0;

describe("scattered single trees become real resin sites", () => {
  it("converts every eligible tree rather than selecting a quota, and preserves occupied content", () => {
    const tiles = map();
    tiles.get("0,0")!.resource = "FARM";
    tiles.get("2,0")!.town = { name: "Town", type: "MARKET", populationTier: "TOWN" };
    tiles.get("4,0")!.economicStructure = { ownerId: "p", type: "MINE", status: "active" };
    tiles.get("6,0")!.terrain = "SEA";
    seedResourceNetworks(tiles, 42, 16, 8, treeAt, true);
    expect([...tiles.values()].filter(tile => tile.resource === "NEURAL_RESIN")).toHaveLength(60);
    for (const tile of tiles.values()) {
      if (tile.y === 0 && [0, 2, 4, 6].includes(tile.x)) continue;
      expect(tile.resource === "NEURAL_RESIN").toBe(treeAt(tile.x, tile.y));
    }
    expect(tiles.get("0,0")!.resource).toBe("FARM");
    expect(tiles.get("2,0")!.resource).toBeUndefined();
    expect(tiles.get("4,0")!.economicStructure?.type).toBe("MINE");
  });
  it("backfills old campaigns idempotently and survives an ordinary tile snapshot round trip", () => {
    const tiles = map();
    tiles.get("0,0")!.ownerId = "p";
    tiles.get("0,0")!.ownershipState = "SETTLED";
    seedResourceNetworks(tiles, 42, 16, 8, treeAt, true);
    const first = structuredClone(tiles);
    seedResourceNetworks(tiles, 42, 16, 8, treeAt, true);
    expect(tiles).toEqual(first);
    const restored = new Map<string, DomainTileState>(JSON.parse(JSON.stringify([...tiles])));
    seedResourceNetworks(restored, 42, 16, 8, treeAt, true);
    expect(restored).toEqual(first);
    expect(restored.get("0,0")).toMatchObject({ ownerId: "p", ownershipState: "SETTLED", resource: "NEURAL_RESIN" });
    expect([...restored.values()].every(tile => !tile.resource || tile.resource === "NEURAL_RESIN")).toBe(true);
  });
});
