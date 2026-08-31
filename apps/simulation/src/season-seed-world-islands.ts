import { WORLD_HEIGHT, WORLD_WIDTH, type Tile, type TileKey } from "@border-empires/shared";

export const tileKey = (x: number, y: number): TileKey => `${x},${y}`;

const wrapX = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
const wrapY = (y: number): number => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;

export const buildIslandMap = (
  terrainAtRuntime: (x: number, y: number) => Tile["terrain"]
): { islandIdByTile: Map<TileKey, number> } => {
  const islandIdByTile = new Map<TileKey, number>();
  let nextIslandId = 0;
  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (terrainAtRuntime(x, y) !== "LAND") continue;
      const startKey = tileKey(x, y);
      if (islandIdByTile.has(startKey)) continue;
      const islandId = nextIslandId;
      nextIslandId += 1;
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      islandIdByTile.set(startKey, islandId);
      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index]!;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = wrapX(current.x + dx);
            const ny = wrapY(current.y + dy);
            if (terrainAtRuntime(nx, ny) !== "LAND") continue;
            const neighborKey = tileKey(nx, ny);
            if (islandIdByTile.has(neighborKey)) continue;
            islandIdByTile.set(neighborKey, islandId);
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }
  }
  return { islandIdByTile };
};

export const islandSizeSummary = (
  terrainAtRuntime: (x: number, y: number) => Tile["terrain"],
  significantTileThreshold: number
): { sizes: number[]; significantCount: number; largestShare: number } => {
  const { islandIdByTile } = buildIslandMap(terrainAtRuntime);
  const sizesByIsland = new Map<number, number>();
  for (const islandId of islandIdByTile.values()) {
    sizesByIsland.set(islandId, (sizesByIsland.get(islandId) ?? 0) + 1);
  }
  const sizes = [...sizesByIsland.values()].sort((left, right) => right - left);
  const landTiles = sizes.reduce((sum, size) => sum + size, 0);
  return {
    sizes,
    significantCount: sizes.filter((size) => size >= significantTileThreshold).length,
    largestShare: landTiles > 0 ? (sizes[0] ?? 0) / landTiles : 0
  };
};
