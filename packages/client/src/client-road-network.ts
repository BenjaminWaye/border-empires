import type { Tile } from "./client-types.js";

export type RoadDirections = {
  north?: boolean;
  northeast?: boolean;
  east?: boolean;
  southeast?: boolean;
  south?: boolean;
  southwest?: boolean;
  west?: boolean;
  northwest?: boolean;
  terminal?: boolean;
};

type RoadBuildDeps = {
  tiles: Map<string, Tile>;
  keyFor: (x: number, y: number) => string;
  wrapX: (x: number) => number;
  wrapY: (y: number) => number;
};

type RoadNode = {
  x: number;
  y: number;
  tile: Tile;
};

type StepDir = keyof Omit<RoadDirections, "terminal">;

const ROAD_STEPS: Array<{ dx: number; dy: number; dir: StepDir; opposite: StepDir }> = [
  { dx: 0, dy: -1, dir: "north", opposite: "south" },
  { dx: 1, dy: -1, dir: "northeast", opposite: "southwest" },
  { dx: 1, dy: 0, dir: "east", opposite: "west" },
  { dx: 1, dy: 1, dir: "southeast", opposite: "northwest" },
  { dx: 0, dy: 1, dir: "south", opposite: "north" },
  { dx: -1, dy: 1, dir: "southwest", opposite: "northeast" },
  { dx: -1, dy: 0, dir: "west", opposite: "east" },
  { dx: -1, dy: -1, dir: "northwest", opposite: "southeast" }
];

const TOWN_TIER_WEIGHT: Record<NonNullable<NonNullable<Tile["town"]>["populationTier"]>, number> = {
  SETTLEMENT: 0,
  TOWN: 1,
  CITY: 2,
  GREAT_CITY: 3,
  METROPOLIS: 4
};

const isSettledLand = (tile: Tile | undefined): tile is Tile =>
  Boolean(tile && tile.terrain === "LAND" && tile.ownerId && tile.ownershipState === "SETTLED");

const isRoadTown = (tile: Tile | undefined): tile is Tile & { town: NonNullable<Tile["town"]> } =>
  Boolean(isSettledLand(tile) && tile.town);

const sortTowns = (a: RoadNode, b: RoadNode): number =>
  TOWN_TIER_WEIGHT[b.tile.town!.populationTier] - TOWN_TIER_WEIGHT[a.tile.town!.populationTier] ||
  a.y - b.y ||
  a.x - b.x;

const addLink = (roads: Map<string, RoadDirections>, key: string, dir: StepDir, terminal = false): void => {
  const current = roads.get(key) ?? {};
  current[dir] = true;
  if (terminal) current.terminal = true;
  roads.set(key, current);
};

const connectedComponentForOwner = (
  start: RoadNode,
  deps: RoadBuildDeps,
  seen: Set<string>
): Map<string, RoadNode> => {
  const component = new Map<string, RoadNode>();
  const queue: Array<{ x: number; y: number }> = [{ x: start.x, y: start.y }];
  const ownerId = start.tile.ownerId!;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = deps.keyFor(current.x, current.y);
    if (seen.has(key)) continue;
    const tile = deps.tiles.get(key);
    if (!isSettledLand(tile) || tile.ownerId !== ownerId) continue;
    seen.add(key);
    component.set(key, { x: current.x, y: current.y, tile });
    for (const step of ROAD_STEPS) {
      queue.push({
        x: deps.wrapX(current.x + step.dx),
        y: deps.wrapY(current.y + step.dy)
      });
    }
  }

  return component;
};

const findShortestPathToNetwork = (
  start: RoadNode,
  component: Map<string, RoadNode>,
  connectedTownKeys: Set<string>,
  deps: RoadBuildDeps
): Array<{ fromKey: string; toKey: string; dir: StepDir; opposite: StepDir }> | null => {
  const startKey = deps.keyFor(start.x, start.y);
  const queue: string[] = [startKey];
  const visited = new Set<string>([startKey]);
  const previous = new Map<string, { fromKey: string; dir: StepDir; opposite: StepDir }>();

  while (queue.length > 0) {
    const currentKey = queue.shift()!;
    const current = component.get(currentKey);
    if (!current) continue;
    if (currentKey !== startKey && connectedTownKeys.has(currentKey)) {
      const path: Array<{ fromKey: string; toKey: string; dir: StepDir; opposite: StepDir }> = [];
      let cursor = currentKey;
      while (cursor !== startKey) {
        const prev = previous.get(cursor);
        if (!prev) return null;
        path.push({ fromKey: prev.fromKey, toKey: cursor, dir: prev.dir, opposite: prev.opposite });
        cursor = prev.fromKey;
      }
      path.reverse();
      return path;
    }
    for (const step of ROAD_STEPS) {
      const nx = deps.wrapX(current.x + step.dx);
      const ny = deps.wrapY(current.y + step.dy);
      const nextKey = deps.keyFor(nx, ny);
      if (visited.has(nextKey) || !component.has(nextKey)) continue;
      visited.add(nextKey);
      previous.set(nextKey, { fromKey: currentKey, dir: step.dir, opposite: step.opposite });
      queue.push(nextKey);
    }
  }

  return null;
};

export const buildRoadNetwork = (deps: RoadBuildDeps): Map<string, RoadDirections> => {
  const roads = new Map<string, RoadDirections>();
  const seen = new Set<string>();

  for (const tile of deps.tiles.values()) {
    if (!isRoadTown(tile)) continue;
    const startKey = deps.keyFor(tile.x, tile.y);
    if (seen.has(startKey)) continue;
    const component = connectedComponentForOwner({ x: tile.x, y: tile.y, tile }, deps, seen);
    const towns = [...component.values()].filter((node) => isRoadTown(node.tile)).sort(sortTowns);
    if (towns.length < 2) continue;

    const connectedTownKeys = new Set<string>([deps.keyFor(towns[0]!.x, towns[0]!.y)]);
    for (let i = 1; i < towns.length; i += 1) {
      const town = towns[i]!;
      const townKey = deps.keyFor(town.x, town.y);
      const path = findShortestPathToNetwork(town, component, connectedTownKeys, deps);
      if (!path || path.length === 0) continue;
      for (const edge of path) {
        addLink(roads, edge.fromKey, edge.dir, connectedTownKeys.has(edge.fromKey) || edge.fromKey === townKey);
        addLink(roads, edge.toKey, edge.opposite, connectedTownKeys.has(edge.toKey) || edge.toKey === townKey);
      }
      connectedTownKeys.add(townKey);
    }
  }

  return roads;
};
