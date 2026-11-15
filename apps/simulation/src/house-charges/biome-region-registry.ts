// Desert and tundra regions for House Charges (docs/house-charges-plan.md):
// 4-connected runs of LAND tiles whose worldgen biome is desert (SAND or
// COASTAL_SAND) or TUNDRA, wrapping at the world edges. Only regions inside
// the HOUSE_CHARGE_REGION_* size band are kept; larger ones are not chargeable
// yet. Built once per tile map like the island registry: biomes are fixed at
// worldgen, so a region's anchor key is a stable id across restarts.
import {
  HOUSE_CHARGE_REGION_MAX_TILES,
  HOUSE_CHARGE_REGION_MIN_TILES,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Tile
} from "@border-empires/shared";

export type BiomeRegionKind = "DESERT" | "TUNDRA";

export type BiomeRegionRecord = {
  /** Anchor tile key: the region's first tile in row-major scan order. */
  readonly id: string;
  readonly kind: BiomeRegionKind;
  /** Member tiles as row-major world cell indexes. */
  readonly cells: Int32Array;
  /** Mean tile position (wrapped), used for search circles and labels. */
  readonly centre: { x: number; y: number };
};

export type BiomeRegionRegistry = {
  readonly width: number;
  readonly regions: readonly BiomeRegionRecord[];
  readonly byId: ReadonlyMap<string, BiomeRegionRecord>;
};

type BiomeTile = { readonly x: number; readonly y: number; readonly terrain: Tile["terrain"]; readonly landBiome?: Tile["landBiome"] | undefined };

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

export const biomeRegionKindOf = (tile: BiomeTile): BiomeRegionKind | undefined => {
  if (tile.terrain !== "LAND") return undefined;
  if (tile.landBiome === "SAND" || tile.landBiome === "COASTAL_SAND") return "DESERT";
  if (tile.landBiome === "TUNDRA") return "TUNDRA";
  return undefined;
};

const STEPS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const buildBiomeRegionRegistry = (
  tiles: ReadonlyMap<string, BiomeTile>,
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT
): BiomeRegionRegistry => {
  // 0 none, 1 desert, 2 tundra: a flat grid so the flood fill builds no string keys.
  const kindByCell = new Uint8Array(width * height);
  for (const tile of tiles.values()) {
    if (tile.x < 0 || tile.y < 0 || tile.x >= width || tile.y >= height) continue;
    const kind = biomeRegionKindOf(tile);
    if (kind) kindByCell[tile.y * width + tile.x] = kind === "DESERT" ? 1 : 2;
  }
  const visited = new Uint8Array(width * height);
  const regions: BiomeRegionRecord[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startCell = y * width + x;
      const code = kindByCell[startCell]!;
      if (code === 0 || visited[startCell]) continue;
      visited[startCell] = 1;
      // Unwrapped coordinates so the centre of a region straddling the edge stays contiguous.
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      const cells: number[] = [startCell];
      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index]!;
        for (const [dx, dy] of STEPS) {
          const ux = current.x + dx;
          const uy = current.y + dy;
          const cell = wrap(uy, height) * width + wrap(ux, width);
          if (visited[cell] || kindByCell[cell] !== code) continue;
          visited[cell] = 1;
          cells.push(cell);
          queue.push({ x: ux, y: uy });
        }
      }
      if (cells.length < HOUSE_CHARGE_REGION_MIN_TILES || cells.length > HOUSE_CHARGE_REGION_MAX_TILES) continue;
      let sumX = 0;
      let sumY = 0;
      for (const point of queue) {
        sumX += point.x;
        sumY += point.y;
      }
      regions.push({
        id: `${x},${y}`,
        kind: code === 1 ? "DESERT" : "TUNDRA",
        cells: Int32Array.from(cells),
        centre: { x: wrap(Math.round(sumX / queue.length), width), y: wrap(Math.round(sumY / queue.length), height) }
      });
    }
  }
  return { width, regions, byId: new Map(regions.map((region) => [region.id, region] as const)) };
};
