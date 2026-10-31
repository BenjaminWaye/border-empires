import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { NETWORK_RESOURCES, type NetworkBiomeContext, type NetworkResource } from "@border-empires/shared";
import { seedResourceNetworks } from "../resource-networks-worldgen.js";

const width = 160, height = 80;
const biome = (tile: DomainTileState): NetworkBiomeContext => ({
  biome: tile.x < width / 3 ? "SAND" : tile.x < width * 2 / 3 ? "GRASS" : "TUNDRA",
  forest: true, hills: true, tropical: true, nearMountains: false
});
const map = (): Map<string, DomainTileState> => new Map(Array.from({ length: width * height }, (_, i) => {
  const tile: DomainTileState = { x: i % width, y: Math.floor(i / width), terrain: "LAND" };
  return [`${tile.x},${tile.y}`, tile];
}));
const clusterSizes = (tiles: ReadonlyMap<string, DomainTileState>, resource: NetworkResource): number[] => {
  const remaining = new Set([...tiles].filter(([, tile]) => tile.resource === resource).map(([key]) => key));
  const sizes: number[] = [];
  while (remaining.size) {
    const first = remaining.values().next().value!;
    remaining.delete(first); const queue = [first]; let size = 0;
    while (queue.length) {
      const [x, y] = queue.pop()!.split(",").map(Number); size += 1;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const key = `${(x! + dx + width) % width},${(y! + dy + height) % height}`;
        if (remaining.delete(key)) queue.push(key);
      }
    }
    sizes.push(size);
  }
  return sizes;
};

describe("small resource deposits", () => {
  it("hits the area-scaled 1,000-tile budgets and never merges adjacent deposits beyond three tiles", () => {
    const tiles = map();
    tiles.get("1,1")!.resource = "FARM";
    const result = seedResourceNetworks(tiles, 42, width, height, biome);
    for (const resource of NETWORK_RESOURCES) {
      expect(result.placed[resource]).toBe(63);
      const sizes = clusterSizes(tiles, resource);
      expect(sizes.reduce((sum, value) => sum + value, 0)).toBe(63);
      expect(sizes.every(value => value >= 1 && value <= 3)).toBe(true);
      expect(new Set(sizes)).toEqual(new Set([1, 2, 3]));
    }
    expect(tiles.get("1,1")!.resource).toBe("FARM");
  });
  it("preserves all eight support tiles around towns, including across world edges", () => {
    const tiles = map();
    for (let y = 0; y < height; y += 6) for (let x = 0; x < width; x += 6)
      tiles.get(`${x},${y}`)!.town = { name: "Town", type: "MARKET", populationTier: "TOWN" };
    const result = seedResourceNetworks(tiles, 42, width, height, biome);
    for (const resource of NETWORK_RESOURCES) expect(result.placed[resource]).toBe(63);
    for (const town of [...tiles.values()].filter(tile => tile.town)) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const key = `${(town.x + dx + width) % width},${(town.y + dy + height) % height}`;
        expect(tiles.get(key)?.resource, `Town ring ${key}`).toBeUndefined();
      }
    }
  });
  it("is deterministic, idempotent, and preserves occupied tiles", () => {
    const a = map(), b = map();
    for (const tiles of [a, b]) {
      tiles.get("2,2")!.economicStructure = { type: "MINE", ownerId: "p", status: "active" };
      tiles.get("3,3")!.town = { name: "Town", type: "MARKET", populationTier: "TOWN" };
      seedResourceNetworks(tiles, 42, width, height, biome);
    }
    expect(a).toEqual(b);
    const first = structuredClone(a);
    seedResourceNetworks(a, 42, width, height, biome);
    expect(a).toEqual(first);
    expect(a.get("2,2")!.resource).toBeUndefined();
    expect(a.get("3,3")!.resource).toBeUndefined();
  });
});
