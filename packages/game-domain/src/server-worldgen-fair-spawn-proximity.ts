import type { DomainTileState } from "./index/index.js";

/**
 * O(1) "is any of these points within Manhattan radius r" lookups for
 * computeFairSpawnSites (server-worldgen-fair-spawn-sites.ts).
 *
 * That function used to answer each question with a linear scan of every
 * town / food tile for every candidate tile. On a 204,800-tile world that is
 * tens of thousands of candidates × hundreds of towns × thousands of food
 * tiles, ~2s per call on a dev laptop (several seconds on prod), and season
 * rollover runs it twice synchronously on the simulation main thread (the
 * worldgen acceptance check, then resource-network landing protection), so
 * it was a large share of the rollover's event-loop blocks. Stamping each
 * point's diamond into a grid once costs points × r² and gives exactly the
 * same answers.
 */
export type ProximityMask = (x: number, y: number) => boolean;

type Point = { readonly x: number; readonly y: number };

/**
 * Torus-wrapped Manhattan proximity: true when some point has
 * min(|dx|, width-|dx|) + min(|dy|, height-|dy|) <= radius. Coordinates outside
 * [0,width)×[0,height) fall back to the direct scan so the answer never changes.
 */
export const wrappedProximityMask = (points: readonly Point[], radius: number, width: number, height: number): ProximityMask => {
  const scan: ProximityMask = (x, y) => points.some((point) => {
    const dx = Math.min(Math.abs(point.x - x), width - Math.abs(point.x - x));
    const dy = Math.min(Math.abs(point.y - y), height - Math.abs(point.y - y));
    return dx + dy <= radius;
  });
  // A diamond wider than the world would stamp the same cell from two
  // directions with different distances; the scan is exact there.
  if (radius < 0 || 2 * radius >= width || 2 * radius >= height) return scan;
  const mask = new Uint8Array(width * height);
  for (const point of points) {
    if (!inBounds(point.x, point.y, width, height)) return scan;
    for (let oy = -radius; oy <= radius; oy += 1) {
      const span = radius - Math.abs(oy);
      const row = (((point.y + oy) % height) + height) % height * width;
      for (let ox = -span; ox <= span; ox += 1) mask[row + ((((point.x + ox) % width) + width) % width)] = 1;
    }
  }
  return (x, y) => (inBounds(x, y, width, height) ? mask[y * width + x] === 1 : scan(x, y));
};

/**
 * Unwrapped Manhattan proximity restricted to one land region: true when some
 * point has |dx| + |dy| <= radius and `sameRegion(x, y, point)` — the
 * region test computeFairSpawnSites applies (a candidate with no region
 * matches any point). `regionAt` must be the same lookup `sameRegion` uses.
 */
export const regionProximityMask = (
  points: readonly Point[],
  radius: number,
  tileList: readonly DomainTileState[],
  regionAt: (x: number, y: number) => number | undefined
): ProximityMask => {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const tile of tileList) {
    if (tile.x < minX) minX = tile.x;
    if (tile.y < minY) minY = tile.y;
    if (tile.x > maxX) maxX = tile.x;
    if (tile.y > maxY) maxY = tile.y;
  }
  const scan: ProximityMask = (x, y) => {
    const origin = regionAt(x, y);
    return points.some((point) => Math.abs(point.x - x) + Math.abs(point.y - y) <= radius && (origin === undefined || regionAt(point.x, point.y) === origin));
  };
  if (tileList.length === 0 || radius < 0) return scan;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const mask = new Uint8Array(width * height);
  for (const point of points) {
    const pointRegion = regionAt(point.x, point.y);
    for (let oy = -radius; oy <= radius; oy += 1) {
      const y = point.y + oy;
      if (y < minY || y > maxY) continue;
      const span = radius - Math.abs(oy);
      for (let ox = -span; ox <= span; ox += 1) {
        const x = point.x + ox;
        if (x < minX || x > maxX) continue;
        const region = regionAt(x, y);
        if (region === undefined || region === pointRegion) mask[(y - minY) * width + (x - minX)] = 1;
      }
    }
  }
  return (x, y) => (x >= minX && x <= maxX && y >= minY && y <= maxY ? mask[(y - minY) * width + (x - minX)] === 1 : scan(x, y));
};

const inBounds = (x: number, y: number, width: number, height: number): boolean =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;
