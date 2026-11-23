// The scout drone's way home (docs/explore-scout-plan.md §13): straight back to the AFC when
// nothing is in the way, else the way round any rival border with fewest tiles, taken only when it
// is faster than retracing (a detour over open land, 3s a tile, can be fewer tiles yet slower than
// flying back over home ground, 1s a tile; review of PR #2931). It used to retrace the whole route whenever a rival border lay across the straight line, so a drone that turned near
// enemy land flew every stop back again instead of the few tiles home (player report 2026-11-22).
// Client and server both run this (the route preview must match the flight), so ties are broken
// by a fixed neighbour order and insertion order, never by anything that varies between them.
import {
  SCOUT_DRONE_HOME_STEP_MS,
  SCOUT_DRONE_STEP_MS,
  scoutDroneBlockAt,
  scoutDroneLine,
  type ScoutDroneWorld
} from "./scout-drone.js";

type Point = { x: number; y: number };
export type ScoutDroneHomeTile = Point & { stepMs: number };

/**
 * Tiles the search may settle before it gives up and the drone retraces its route instead. Counting
 * tiles keeps the search tight (the estimate is exact over open ground), so a detour of 100 tiles
 * round a 40-tile rival block settles a few thousand; it also runs on the client while planning.
 */
export const SCOUT_DRONE_HOME_SEARCH_MAX_NODES = 20_000;

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]
];

const wrap = (v: number, size: number): number => ((v % size) + size) % size;
const axisDistance = (a: number, b: number, size: number): number => {
  const d = Math.abs(wrap(a, size) - wrap(b, size));
  return Math.min(d, size - d);
};
/** Tiles between two points for an 8-way mover on the wrapping map: never more than the true path. */
const chebyshev = (a: Point, b: Point, world: ScoutDroneWorld): number =>
  Math.max(axisDistance(a.x, b.x, world.width), axisDistance(a.y, b.y, world.height));

/** Each homeward leg is paced by the tile it flies out of, as speedUpScoutDroneFlight judges return legs. */
const legMs = (from: Point, world: ScoutDroneWorld): number =>
  world.classify(from.x, from.y).kind === "HOME" ? SCOUT_DRONE_HOME_STEP_MS : SCOUT_DRONE_STEP_MS;

const paced = (path: readonly Point[], world: ScoutDroneWorld): ScoutDroneHomeTile[] => {
  const tiles: ScoutDroneHomeTile[] = [];
  for (let i = 1; i < path.length; i += 1) tiles.push({ x: path[i]!.x, y: path[i]!.y, stepMs: legMs(path[i - 1]!, world) });
  return tiles;
};

/** The straight line home, or undefined when a rival border lies across it. */
const straightLine = (from: Point, launch: Point, world: ScoutDroneWorld): Point[] | undefined => {
  const line = scoutDroneLine(from, launch, world.width, world.height);
  for (let i = 1; i < line.length; i += 1) if (scoutDroneBlockAt(line[i - 1]!, line[i]!, world)) return undefined;
  return line;
};

type Node = { key: number; x: number; y: number; g: number; f: number; seq: number };

const before = (a: Node, b: Node): boolean => a.f < b.f || (a.f === b.f && (a.g > b.g || (a.g === b.g && a.seq < b.seq)));

/** A small binary min-heap on (f, deeper first, insertion order): deterministic on client and server. */
class OpenSet {
  private readonly items: Node[] = [];
  get size(): number {
    return this.items.length;
  }
  push(node: Node): void {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!before(items[i]!, items[parent]!)) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }
  pop(): Node | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0 && last) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < items.length && before(items[l]!, items[best]!)) best = l;
        if (r < items.length && before(items[r]!, items[best]!)) best = r;
        if (best === i) break;
        [items[i], items[best]] = [items[best]!, items[i]!];
        i = best;
      }
    }
    return top;
  }
}

/** A* over 8-way steps a drone may take (scoutDroneBlockAt), fewest tiles, under `maxSteps` tiles, or undefined. */
const searchAround = (from: Point, launch: Point, world: ScoutDroneWorld, maxSteps: number): Point[] | undefined => {
  const estimate = (p: Point): number => chebyshev(p, launch, world);
  const keyOf = (x: number, y: number): number => y * world.width + x;
  const goal = keyOf(wrap(launch.x, world.width), wrap(launch.y, world.height));
  const parent = new Map<number, number>();
  const best = new Map<number, number>();
  const open = new OpenSet();
  let seq = 0;
  const startKey = keyOf(wrap(from.x, world.width), wrap(from.y, world.height));
  best.set(startKey, 0);
  open.push({ key: startKey, x: wrap(from.x, world.width), y: wrap(from.y, world.height), g: 0, f: estimate(from), seq: seq++ });
  let settled = 0;
  while (open.size > 0 && settled < SCOUT_DRONE_HOME_SEARCH_MAX_NODES) {
    const node = open.pop()!;
    if (node.g !== best.get(node.key)) continue;
    if (node.key === goal) {
      const path: Point[] = [];
      for (let key: number | undefined = node.key; key !== undefined; key = parent.get(key)) {
        path.push({ x: key % world.width, y: Math.floor(key / world.width) });
      }
      return path.reverse();
    }
    settled += 1;
    const g = node.g + 1;
    if (g >= maxSteps) continue;
    for (const [dx, dy] of NEIGHBOURS) {
      const next = { x: wrap(node.x + dx, world.width), y: wrap(node.y + dy, world.height) };
      const key = keyOf(next.x, next.y);
      const known = best.get(key);
      if (known !== undefined && known <= g) continue;
      if (scoutDroneBlockAt(node, next, world)) continue;
      const f = g + estimate(next);
      if (f >= maxSteps) continue;
      best.set(key, g);
      parent.set(key, node.key);
      open.push({ key, x: next.x, y: next.y, g, f, seq: seq++ });
    }
  }
  return undefined;
};

/**
 * The tiles home from `from` to `launch` (`from` itself not included): the straight line when it
 * is clear, else the way round the rival borders in between with fewest tiles. Undefined when that
 * way is no faster than `maxMs` (the caller retraces its route, which takes that long).
 */
export const scoutDroneHomePath = (from: Point, launch: Point, world: ScoutDroneWorld, maxMs: number): ScoutDroneHomeTile[] | undefined => {
  const line = straightLine(from, launch, world);
  if (line) return paced(line, world);
  // Every tile takes at least home pace, so no way faster than `maxMs` has more tiles than this.
  const around = searchAround(from, launch, world, Math.ceil(maxMs / SCOUT_DRONE_HOME_STEP_MS));
  if (!around) return undefined;
  const tiles = paced(around, world);
  return tiles.reduce((sum, tile) => sum + tile.stepMs, 0) < maxMs ? tiles : undefined;
};
