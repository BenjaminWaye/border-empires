// River-adjacent land tiles for town placement (server-worldgen-towns.ts
// places ~35% of towns here first), deduplicated and deterministically
// shuffled rather than left in path order, which would cluster placements at
// whichever river happens to sort first.
import { tilesAlongRiverEdge, type RiverPath, type TileKey } from "@border-empires/shared";

export const riverAdjacentTilesFor = (
  paths: readonly RiverPath[],
  // worldgenVersion >= 9 (edgeRiversActive): paths run along tile edges.
  edgeRivers: boolean,
  shuffleKey: (x: number, y: number) => number,
  key: (x: number, y: number) => TileKey
): Array<{ x: number; y: number }> => {
  const seen = new Set<TileKey>();
  const tiles: Array<{ x: number; y: number }> = [];
  const add = (x: number, y: number): void => {
    const tileKey = key(x, y);
    if (seen.has(tileKey)) return;
    seen.add(tileKey);
    tiles.push({ x, y });
  };
  for (const path of paths) {
    if (edgeRivers) {
      // v9+: points are tile corners and each step is one tile edge, so a
      // river's neighbours are exactly the two tiles either side of each edge.
      for (let i = 0; i + 1 < path.length; i += 1) {
        const a = path[i]!;
        const b = path[i + 1]!;
        for (const t of tilesAlongRiverEdge(a.wx, a.wy, b.wx, b.wy)) add(t.x, t.y);
      }
      continue;
    }
    // v1-v8: points are tile centres, densely resampled (Catmull-Rom); every
    // 4th point covers the river's length without near-duplicate tiles.
    for (let i = 0; i < path.length; i += 4) {
      const point = path[i]!;
      add(Math.round(point.wx), Math.round(point.wy));
    }
  }
  return tiles.sort((a, b) => shuffleKey(a.x, a.y) - shuffleKey(b.x, b.y));
};
