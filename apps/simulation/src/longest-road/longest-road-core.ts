// Longest Road: the longest road (in tiles) between two of one empire's towns
// (Town tier or above) over its own garrisoned land, 8-way. Towns are joined in
// order, each by a shortest path to the nearest already-joined town; the record
// is the longest town-to-town path through those joins (two sweeps). Shared by
// the season record (season-stats.ts, at the crowning) and the live holder
// (longest-road-ticker.ts).
//
// Cost: one Map lookup per owned land tile of an empire with 2+ road towns,
// then flat typed-array searches. Scratch buffers are sized to the world once
// and reused with generation stamps, so nothing is cleared per run.
import { WORLD_WIDTH, WORLD_HEIGHT } from "@border-empires/shared";
import type { SeasonStats } from "@border-empires/sim-protocol";

export type RoadTile = {
  x: number;
  y: number;
  terrain: string;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  townTier?: string | undefined;
  townName?: string | undefined;
};

export type LongestRoad = NonNullable<SeasonStats["longestRoad"]>;
export type RoadEmpire = { ownerId: string; landKeys: Iterable<string>; townKeys: Iterable<string> };

const W = WORLD_WIDTH;
const H = WORLD_HEIGHT;
const ROAD_STEPS: ReadonlyArray<[number, number]> = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1]
];
const ROAD_TOWN_TIERS = new Set(["TOWN", "CITY", "GREAT_CITY", "METROPOLIS"]);

const isRoadLand = (tile: RoadTile | undefined, ownerId: string): tile is RoadTile =>
  Boolean(tile && tile.terrain === "LAND" && tile.ownerId === ownerId && tile.ownershipState === "SETTLED");

export const isRoadTown = (tile: RoadTile | undefined): boolean =>
  Boolean(tile && tile.ownerId && isRoadLand(tile, tile.ownerId) && tile.townTier && ROAD_TOWN_TIERS.has(tile.townTier));

type Scratch = { land: Int32Array; comp: Int32Array; seen: Int32Array; joined: Int32Array; prev: Int32Array; queue: Int32Array; stamp: number };
let scratch: Scratch | undefined;
const scratchBuffers = (): Scratch => {
  if (!scratch || scratch.stamp > 2_000_000_000) {
    const n = W * H;
    scratch = { land: new Int32Array(n), comp: new Int32Array(n), seen: new Int32Array(n), joined: new Int32Array(n), prev: new Int32Array(n), queue: new Int32Array(n), stamp: 0 };
  }
  return scratch;
};
const nextStamp = (s: Scratch): number => (s.stamp += 1);

const cellOf = (tile: RoadTile): number => tile.y * W + tile.x;
const neighbour = (cell: number, step: readonly [number, number]): number => {
  const x = (cell % W) + step[0];
  const y = Math.floor(cell / W) + step[1];
  return ((y + H) % H) * W + ((x + W) % W);
};

/** The empire's longest road, or undefined when no two of its towns are joined. */
const longestRoadForEmpire = (
  s: Scratch,
  empire: RoadEmpire,
  getTile: (key: string) => RoadTile | undefined
): { fromCell: number; toCell: number; length: number; fromTile: RoadTile; toTile: RoadTile } | undefined => {
  const towns: number[] = [];
  const townTiles = new Map<number, RoadTile>();
  for (const key of empire.townKeys) {
    const tile = getTile(key);
    if (!isRoadTown(tile) || tile!.ownerId !== empire.ownerId) continue;
    const cell = cellOf(tile!);
    if (townTiles.has(cell)) continue;
    towns.push(cell);
    townTiles.set(cell, tile!);
  }
  if (towns.length < 2) return undefined;
  const landStamp = nextStamp(s);
  for (const key of empire.landKeys) {
    const tile = getTile(key);
    if (isRoadLand(tile, empire.ownerId)) s.land[cellOf(tile)] = landStamp;
  }
  let best: { fromCell: number; toCell: number; length: number } | undefined;
  const compStamp = nextStamp(s);
  for (const start of towns) {
    if (s.comp[start] === compStamp || s.land[start] !== landStamp) continue;
    // Flood the land joined to this town; the flood's own mark is its component.
    const componentMark = nextStamp(s);
    let tail = 0;
    s.queue[tail++] = start;
    s.comp[start] = compStamp;
    s.seen[start] = componentMark;
    for (let head = 0; head < tail; head += 1) {
      const cell = s.queue[head]!;
      for (const step of ROAD_STEPS) {
        const next = neighbour(cell, step);
        if (s.land[next] !== landStamp || s.comp[next] === compStamp) continue;
        s.comp[next] = compStamp;
        s.seen[next] = componentMark;
        s.queue[tail++] = next;
      }
    }
    const componentTowns = towns.filter((cell) => s.seen[cell] === componentMark);
    if (componentTowns.length < 2) continue;
    // Land of other components is unreachable from here, so `comp` alone bounds the joins.
    const road = joinTowns(s, compStamp, componentTowns);
    if (road && (!best || road.length > best.length)) best = road;
  }
  return best && { ...best, fromTile: townTiles.get(best.fromCell)!, toTile: townTiles.get(best.toCell)! };
};

const joinTowns = (s: Scratch, compStamp: number, towns: readonly number[]): { fromCell: number; toCell: number; length: number } | undefined => {
  const roadGraph = new Map<number, number[]>();
  const link = (a: number, b: number): void => {
    (roadGraph.get(a) ?? roadGraph.set(a, []).get(a)!).push(b);
    (roadGraph.get(b) ?? roadGraph.set(b, []).get(b)!).push(a);
  };
  const joinedStamp = nextStamp(s);
  s.joined[towns[0]!] = joinedStamp;
  for (let i = 1; i < towns.length; i += 1) {
    const town = towns[i]!;
    if (s.joined[town] === joinedStamp) continue;
    const seenStamp = nextStamp(s);
    let tail = 0;
    s.queue[tail++] = town;
    s.seen[town] = seenStamp;
    for (let head = 0; head < tail; head += 1) {
      const cell = s.queue[head]!;
      if (cell !== town && s.joined[cell] === joinedStamp) {
        for (let cursor = cell; cursor !== town; ) {
          const prev = s.prev[cursor]!;
          link(prev, cursor);
          cursor = prev;
        }
        s.joined[town] = joinedStamp;
        break;
      }
      for (const step of ROAD_STEPS) {
        const next = neighbour(cell, step);
        if (s.seen[next] === seenStamp || s.comp[next] !== compStamp) continue;
        s.seen[next] = seenStamp;
        s.prev[next] = cell;
        s.queue[tail++] = next;
      }
    }
  }
  if (roadGraph.size < 2) return undefined;
  const townSet = new Set(towns);
  const farthestTown = (start: number): { cell: number; dist: number } => {
    const dist = new Map<number, number>([[start, 0]]);
    const queue = [start];
    let farthest = { cell: start, dist: 0 };
    for (let head = 0; head < queue.length; head += 1) {
      const cur = queue[head]!;
      for (const next of roadGraph.get(cur) ?? []) {
        if (dist.has(next)) continue;
        const d = dist.get(cur)! + 1;
        dist.set(next, d);
        if (townSet.has(next) && d > farthest.dist) farthest = { cell: next, dist: d };
        queue.push(next);
      }
    }
    return farthest;
  };
  const first = farthestTown(towns[0]!);
  const second = farthestTown(first.cell);
  return second.dist > 0 ? { fromCell: first.cell, toCell: second.cell, length: second.dist } : undefined;
};

/** Longest road over `empires` (the first strictly longest wins, so pass them in a stable order). */
export const longestRoadFrom = (
  getTile: (key: string) => RoadTile | undefined,
  empires: Iterable<RoadEmpire>,
  players: ReadonlyArray<{ id: string; name?: string }> = []
): LongestRoad | undefined => {
  const s = scratchBuffers();
  let best: LongestRoad | undefined;
  for (const empire of empires) {
    const road = longestRoadForEmpire(s, empire, getTile);
    if (!road || (best && road.length + 1 <= best.tileCount)) continue;
    best = {
      tileCount: road.length + 1,
      playerId: empire.ownerId,
      playerName: players.find((player) => player.id === empire.ownerId)?.name ?? empire.ownerId,
      fromCity: { x: road.fromTile.x, y: road.fromTile.y, name: road.fromTile.townName ?? `Town at (${road.fromTile.x}, ${road.fromTile.y})` },
      toCity: { x: road.toTile.x, y: road.toTile.y, name: road.toTile.townName ?? `Town at (${road.toTile.x}, ${road.toTile.y})` }
    };
  }
  return best;
};
