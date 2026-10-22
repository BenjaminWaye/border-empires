// The season's nameable islands: built once from the tile map, never
// snapshotted (pure function of terrain). An island is an 8-connected run of
// non-sea tiles (LAND or MOUNTAIN, so a mountain ridge does not split one
// island into two names), wrapping at the world edges like movement does.
// Only islands with at least ISLAND_NAME_MIN_LAND_TILES LAND tiles are kept.
//
// Membership is fixed at build time: nothing at runtime turns sea into land
// or back (Create/Remove Mountain only swap LAND and MOUNTAIN), so an island's
// anchor key stays a stable id for persisted names across restarts. Which of
// its tiles count as garrisonable is re-read from live terrain on every
// evaluation (island-name-standing.ts), since that swap can happen.
import { ISLAND_NAME_MIN_LAND_TILES, WORLD_HEIGHT, WORLD_WIDTH, isSeaTerrain, type Terrain } from "@border-empires/shared";

export type IslandGeometry = { x: number; y: number; angle: number; span: number; thickness: number };

export type IslandRecord = {
  /** Anchor tile key: the island's first tile in row-major scan order. */
  readonly id: string;
  readonly tileKeys: readonly string[];
  /** LAND tiles at build time; picks the default name's size class. */
  readonly landTilesAtBuild: number;
  readonly geometry: IslandGeometry;
};

export type IslandRegistry = {
  readonly islands: readonly IslandRecord[];
  readonly byId: ReadonlyMap<string, IslandRecord>;
  /** The kept island containing (x, y), if any. */
  readonly islandAt: (x: number, y: number) => IslandRecord | undefined;
};

type TerrainTile = { readonly x: number; readonly y: number; readonly terrain: Terrain };

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

/**
 * Label placement from the island's tile cloud (unwrapped coordinates):
 * centre at the mean, long axis from the covariance's principal eigenvector,
 * span/thickness as the extents along and across it. A centre that lands in
 * water (crescent-shaped islands) snaps to the nearest island tile.
 */
export const islandGeometryFor = (points: ReadonlyArray<{ x: number; y: number }>, width = WORLD_WIDTH, height = WORLD_HEIGHT): IslandGeometry => {
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / points.length;
  const meanY = sumY / points.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  if (angle <= -Math.PI / 2) angle += Math.PI;
  if (angle > Math.PI / 2) angle -= Math.PI;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  let minAcross = Infinity;
  let maxAcross = -Infinity;
  let nearest = points[0]!;
  let nearestDistance = Infinity;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    const along = dx * ux + dy * uy;
    const across = -dx * uy + dy * ux;
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
    minAcross = Math.min(minAcross, across);
    maxAcross = Math.max(maxAcross, across);
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = p;
    }
  }
  // Mean is "on land" when some tile is within half a tile of it.
  const centreOnLand = nearestDistance <= 0.5;
  const cx = centreOnLand ? meanX : nearest.x;
  const cy = centreOnLand ? meanY : nearest.y;
  return {
    x: wrap(cx, width),
    y: wrap(cy, height),
    angle,
    span: maxAlong - minAlong + 1,
    thickness: maxAcross - minAcross + 1
  };
};

export const buildIslandRegistry = (
  tiles: ReadonlyMap<string, TerrainTile>,
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT
): IslandRegistry => {
  const islandIndexByCell = new Int32Array(width * height).fill(-1);
  // One pass over the tile map into a flat grid (0 sea/unknown, 1 LAND,
  // 2 MOUNTAIN) so the flood fill below never builds string keys.
  const terrainByCell = new Uint8Array(width * height);
  for (const tile of tiles.values()) {
    if (tile.x < 0 || tile.y < 0 || tile.x >= width || tile.y >= height || isSeaTerrain(tile.terrain)) continue;
    terrainByCell[tile.y * width + tile.x] = tile.terrain === "LAND" ? 1 : 2;
  }
  const isLandish = (x: number, y: number): boolean => terrainByCell[y * width + x] !== 0;
  const visited = new Uint8Array(width * height);
  const islands: IslandRecord[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startCell = y * width + x;
      if (visited[startCell] || !isLandish(x, y)) continue;
      visited[startCell] = 1;
      // BFS in unwrapped coordinates so the geometry of an island straddling
      // the world edge stays contiguous.
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      const cells: number[] = [startCell];
      let landTiles = 0;
      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index]!;
        if (terrainByCell[wrap(current.y, height) * width + wrap(current.x, width)] === 1) landTiles += 1;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const ux = current.x + dx;
            const uy = current.y + dy;
            const nx = wrap(ux, width);
            const ny = wrap(uy, height);
            const cell = ny * width + nx;
            if (visited[cell] || !isLandish(nx, ny)) continue;
            visited[cell] = 1;
            cells.push(cell);
            queue.push({ x: ux, y: uy });
          }
        }
      }
      if (landTiles < ISLAND_NAME_MIN_LAND_TILES) continue;
      const islandIndex = islands.length;
      for (const cell of cells) islandIndexByCell[cell] = islandIndex;
      islands.push({
        id: `${x},${y}`,
        tileKeys: cells.map((cell) => `${cell % width},${Math.floor(cell / width)}`),
        landTilesAtBuild: landTiles,
        geometry: islandGeometryFor(queue, width, height)
      });
    }
  }
  const byId = new Map(islands.map((island) => [island.id, island] as const));
  return {
    islands,
    byId,
    islandAt: (x, y) => {
      const index = islandIndexByCell[wrap(y, height) * width + wrap(x, width)] ?? -1;
      return index >= 0 ? islands[index] : undefined;
    }
  };
};
