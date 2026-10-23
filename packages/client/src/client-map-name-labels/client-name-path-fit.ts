// Fits a map name inside the tiles it belongs on (a player's explored
// garrisons, an island's explored garrisoned land):
//   - along the name: the path is walked in half-tile steps and cut down to
//     its longest stretch over those tiles, so the name compacts instead of
//     running out over other ground (or under the unexplored storm);
//   - across the name: the glyph height is capped by the clearance to the
//     nearest outside tile on either side of that stretch, so letters never
//     poke over the border.
// Returns undefined when too little of the path is inside to carry a name.
import type { NameLabelPath } from "./client-map-name-label-draw.js";

const STEP_TILES = 0.5;
const CLEARANCE_STEP_TILES = 0.25;
/** How far either side of the path the clearance search looks. */
const MAX_CLEARANCE_TILES = 6;
/** Inside stretch below which a name isn't shown. */
export const MIN_FIT_LABEL_TILES = 2;
/** Breathing room kept between the letters and the edge of the tiles. */
const EDGE_MARGIN_TILES = 0.15;

type Sample = { x: number; y: number; nx: number; ny: number; inside: boolean };

const isInsideAt = (inside: (x: number, y: number) => boolean, x: number, y: number): boolean => inside(Math.round(x), Math.round(y));

/** Distance from (x, y) along (nx, ny) to the first point outside, in tiles (capped). */
const clearanceAlong = (inside: (x: number, y: number) => boolean, sample: Sample, sign: 1 | -1): number => {
  for (let distance = CLEARANCE_STEP_TILES; distance <= MAX_CLEARANCE_TILES; distance += CLEARANCE_STEP_TILES) {
    if (!isInsideAt(inside, sample.x + sign * sample.nx * distance, sample.y + sign * sample.ny * distance)) {
      return distance - CLEARANCE_STEP_TILES / 2;
    }
  }
  return MAX_CLEARANCE_TILES;
};

/** The path stretched along its end tangents to cover its span's rim, so every place a letter may land is checked. */
const extendedPoints = (path: NameLabelPath): Array<{ x: number; y: number }> => {
  const points = [...path.points];
  let pathLength = 0;
  for (let index = 1; index < points.length; index += 1) pathLength += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  const rim = Math.max(0, (path.spanTiles - pathLength) / 2);
  if (rim <= 0 || points.length < 2) return points;
  const extend = (from: { x: number; y: number }, toward: { x: number; y: number }): { x: number; y: number } => {
    const length = Math.hypot(from.x - toward.x, from.y - toward.y) || 1;
    return { x: from.x + ((from.x - toward.x) / length) * rim, y: from.y + ((from.y - toward.y) / length) * rim };
  };
  return [extend(points[0]!, points[1]!), ...points, extend(points[points.length - 1]!, points[points.length - 2]!)];
};

export const fitNamePathToTiles = (path: NameLabelPath, inside: (x: number, y: number) => boolean): NameLabelPath | undefined => {
  const samples: Sample[] = [];
  const points = extendedPoints(path);
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const nx = -(b.y - a.y) / length;
    const ny = (b.x - a.x) / length;
    const steps = Math.max(1, Math.ceil(length / STEP_TILES));
    for (let step = samples.length === 0 ? 0 : 1; step <= steps; step += 1) {
      const t = step / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      samples.push({ x, y, nx, ny, inside: isInsideAt(inside, x, y) });
    }
  }
  let bestStart = -1;
  let bestEnd = -1;
  let runStart = -1;
  samples.forEach((sample, index) => {
    if (!sample.inside) {
      runStart = -1;
      return;
    }
    if (runStart < 0) runStart = index;
    if (index - runStart > bestEnd - bestStart) {
      bestStart = runStart;
      bestEnd = index;
    }
  });
  if (bestStart < 0) return undefined;
  const run = samples.slice(bestStart, bestEnd + 1);
  let lengthTiles = 0;
  for (let index = 1; index < run.length; index += 1) lengthTiles += Math.hypot(run[index]!.x - run[index - 1]!.x, run[index]!.y - run[index - 1]!.y);
  if (lengthTiles < MIN_FIT_LABEL_TILES || run.length < 2) return undefined;
  let clearance = MAX_CLEARANCE_TILES;
  for (const sample of run) clearance = Math.min(clearance, clearanceAlong(inside, sample, 1), clearanceAlong(inside, sample, -1));
  const heightTiles = Math.min(path.heightTiles, 2 * (clearance - EDGE_MARGIN_TILES));
  if (heightTiles <= 0) return undefined;
  // The stretch (rim included) is all the room the name gets.
  return { ...path, points: run.map(({ x, y }) => ({ x, y })), heightTiles, spanTiles: lengthTiles };
};
