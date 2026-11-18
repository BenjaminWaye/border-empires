import type { RoadDirections } from "../client-road-network/client-road-network.js";

// The 2D centreline every road tile is drawn along, in scene XZ. Shared by the
// ground ribbon (client-map-3d-road-overlay.ts) and the monorail guideway +
// trains (client-map-3d-monorail/), so the rail, its shadow and the trains all
// follow exactly the same curve.
//
// A tile with exactly two arms (and not a town terminal) is one smooth cubic
// curve from one tile-edge point to the other. Any other tile is a hub: a
// straight-ish arm from near the centre out to each edge point. Edge points sit
// on the tile boundary, so neighbouring tiles always meet end to end.

export type RoadDir = keyof Omit<RoadDirections, "terminal">;
export type XZ = [number, number];

export const ROAD_DIRS: readonly RoadDir[] = [
  "north", "northeast", "east", "southeast",
  "south", "southwest", "west", "northwest"
];

export const ROAD_STEP: Record<RoadDir, XZ> = {
  north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
  northeast: [1, -1], northwest: [-1, -1], southeast: [1, 1], southwest: [-1, 1]
};

export const OPPOSITE_DIR: Record<RoadDir, RoadDir> = {
  north: "south", south: "north", east: "west", west: "east",
  northeast: "southwest", southwest: "northeast", northwest: "southeast", southeast: "northwest"
};

export const HUB_RADIUS = 0.085;
const ARM_START_RADIUS = HUB_RADIUS * 0.72;
const CURVE_SAMPLES = 12;
const ARM_SAMPLES = 7;

export const boundaryPoint = (dir: RoadDir, sx: number, sz: number): XZ => {
  const [dx, dz] = ROAD_STEP[dir];
  return [sx + dx * 0.5, sz + dz * 0.5];
};

const normalize = (v: XZ): XZ => {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  return len < 0.0001 ? [0, 0] : [v[0] / len, v[1] / len];
};

const bezier = (t: number, p0: XZ, p1: XZ, p2: XZ, p3: XZ): XZ => {
  const mt = 1 - t;
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
};

const roadHash01 = (tileX: number, tileY: number, salt: number): number => {
  const v = Math.sin((tileX + 0.5) * 127.1 + (tileY + 0.5) * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

export const activeRoadDirections = (dirs: RoadDirections): RoadDir[] => ROAD_DIRS.filter((dir) => dirs[dir] === true);

// Two arms and not a town: drawn as one through-curve instead of a hub.
export const isThroughTile = (dirs: RoadDirections): boolean =>
  dirs.terminal !== true && activeRoadDirections(dirs).length === 2;

// Hub arm, centre -> tile edge, with a small per-tile bend so straight runs of
// hub tiles don't look ruled.
export const roadArmPoints = (tileX: number, tileY: number, sceneX: number, sceneZ: number, dir: RoadDir): XZ[] => {
  const outward = normalize(ROAD_STEP[dir]);
  const perp: XZ = [-outward[1], outward[0]];
  const end = boundaryPoint(dir, sceneX, sceneZ);
  const start: XZ = [sceneX + outward[0] * ARM_START_RADIUS, sceneZ + outward[1] * ARM_START_RADIUS];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const bend = (roadHash01(tileX, tileY, ROAD_DIRS.indexOf(dir) + 1) - 0.5) * 0.11;
  const c1: XZ = [start[0] + outward[0] * length * 0.35 + perp[0] * bend, start[1] + outward[1] * length * 0.35 + perp[1] * bend];
  const c2: XZ = [end[0] - outward[0] * length * 0.36, end[1] - outward[1] * length * 0.36];
  const points: XZ[] = [];
  for (let i = 0; i < ARM_SAMPLES; i += 1) points.push(bezier(i / (ARM_SAMPLES - 1), start, c1, c2, end));
  return points;
};

// Through-curve from the `from` edge to the `to` edge. Symmetric, so the same
// curve comes out whichever end it is sampled from.
export const roadThroughPoints = (sceneX: number, sceneZ: number, from: RoadDir, to: RoadDir): XZ[] => {
  const p1 = boundaryPoint(from, sceneX, sceneZ);
  const p2 = boundaryPoint(to, sceneX, sceneZ);
  const d1 = normalize(ROAD_STEP[from]);
  const d2 = normalize(ROAD_STEP[to]);
  const tangentLen = 0.45 * Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const c1: XZ = [p1[0] - d1[0] * tangentLen, p1[1] - d1[1] * tangentLen];
  const c2: XZ = [p2[0] - d2[0] * tangentLen, p2[1] - d2[1] * tangentLen];
  const points: XZ[] = [];
  for (let i = 0; i < CURVE_SAMPLES; i += 1) points.push(bezier(i / (CURVE_SAMPLES - 1), p1, c1, c2, p2));
  return points;
};

// Every polyline the tile draws: one through-curve, or one arm per direction.
export const roadTileCenterlines = (tileX: number, tileY: number, sceneX: number, sceneZ: number, dirs: RoadDirections): XZ[][] => {
  const arms = activeRoadDirections(dirs);
  if (arms.length === 0) return [];
  if (isThroughTile(dirs)) return [roadThroughPoints(sceneX, sceneZ, arms[0]!, arms[1]!)];
  return arms.map((dir) => roadArmPoints(tileX, tileY, sceneX, sceneZ, dir));
};
