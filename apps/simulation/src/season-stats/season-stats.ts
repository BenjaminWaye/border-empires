import type { SeasonStats } from "@border-empires/sim-protocol";
import type { RuntimeExportState } from "../runtime-state-export.js";
import { WORLD_WIDTH, WORLD_HEIGHT, wrapX, wrapY } from "@border-empires/shared";

type RoadTown = {
  key: string;
  x: number;
  y: number;
  ownerId: string;
};

type RoadEdge = {
  to: string;
  tiles: number;
};

const ROAD_STEPS: ReadonlyArray<[number, number]> = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1]
];

const ROAD_TOWN_TIERS = new Set(["TOWN", "CITY", "GREAT_CITY", "METROPOLIS"]);

const isRoadTown = (tile: RuntimeExportState["tiles"][number]): boolean =>
  tile.terrain === "LAND" &&
  Boolean(tile.ownerId) &&
  tile.ownershipState === "SETTLED" &&
  Boolean(tile.townPopulationTier && ROAD_TOWN_TIERS.has(tile.townPopulationTier));

const tileKey = (x: number, y: number): string => `${x},${y}`;

export const findMostDeadlyTile = (manpowerLossByTileKey: Map<string, number>): SeasonStats["mostDeadlyTile"] => {
  let best: { key: string; manpowerLost: number } | undefined;
  for (const [key, manpowerLost] of manpowerLossByTileKey) {
    if (!best || manpowerLost > best.manpowerLost) {
      best = { key, manpowerLost };
    }
  }
  if (!best) return undefined;
  const coords = best.key.split(",").map(Number);
  return { x: coords[0]!, y: coords[1]!, manpowerLost: Math.round(best.manpowerLost) };
};

export const computeLongestRoad = (tiles: RuntimeExportState["tiles"]): SeasonStats["longestRoad"] => {
  const tileMap = new Map<string, RuntimeExportState["tiles"][number]>();
  const roadTowns: RoadTown[] = [];
  for (const tile of tiles) {
    tileMap.set(tileKey(tile.x, tile.y), tile);
    if (isRoadTown(tile)) {
      roadTowns.push({ key: tileKey(tile.x, tile.y), x: tile.x, y: tile.y, ownerId: tile.ownerId! });
    }
  }

  let longest = 0;

  const visited = new Set<string>();
  for (const startTown of roadTowns) {
    if (visited.has(startTown.key)) continue;

    const component = new Map<string, RoadTown>();
    const queue: Array<{ x: number; y: number }> = [{ x: startTown.x, y: startTown.y }];
    const ownerId = startTown.ownerId;

    while (queue.length > 0) {
      const cur = queue.shift()!;
      const key = tileKey(cur.x, cur.y);
      if (visited.has(key)) continue;
      const tile = tileMap.get(key);
      if (!tile || tile.terrain !== "LAND" || !tile.ownerId || tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
      visited.add(key);
      component.set(key, { key, x: cur.x, y: cur.y, ownerId });
      for (const [dx, dy] of ROAD_STEPS) {
        queue.push({ x: wrapX(cur.x + dx, WORLD_WIDTH), y: wrapY(cur.y + dy, WORLD_HEIGHT) });
      }
    }

    const componentTowns = roadTowns.filter((t) => component.has(t.key) && isRoadTown(tileMap.get(t.key)!));
    if (componentTowns.length < 2) continue;

    const roadGraph = new Map<string, RoadEdge[]>();
    const connectedTownKeys = new Set<string>([componentTowns[0]!.key]);

    for (let i = 1; i < componentTowns.length; i += 1) {
      const town = componentTowns[i]!;
      const townKey = town.key;
      if (connectedTownKeys.has(townKey)) continue;

      const bfsQueue: string[] = [townKey];
      const bfsVisited = new Set<string>([townKey]);
      const previous = new Map<string, { fromKey: string; toKey: string }>();

      let found = false;
      while (bfsQueue.length > 0 && !found) {
        const currentKey = bfsQueue.shift()!;
        const current = component.get(currentKey);
        if (!current) continue;
        if (currentKey !== townKey && connectedTownKeys.has(currentKey)) {
          const path: Array<{ fromKey: string; toKey: string }> = [];
          let cursor = currentKey;
          while (cursor !== townKey) {
            const prev = previous.get(cursor);
            if (!prev) break;
            path.push({ fromKey: prev.fromKey, toKey: cursor });
            cursor = prev.fromKey;
          }

          for (const edge of path) {
            if (!roadGraph.has(edge.fromKey)) roadGraph.set(edge.fromKey, []);
            if (!roadGraph.has(edge.toKey)) roadGraph.set(edge.toKey, []);
            roadGraph.get(edge.fromKey)!.push({ to: edge.toKey, tiles: 1 });
            roadGraph.get(edge.toKey)!.push({ to: edge.fromKey, tiles: 1 });
          }
          connectedTownKeys.add(townKey);
          found = true;
          break;
        }
        for (const [dx, dy] of ROAD_STEPS) {
          const nx = wrapX(current.x + dx, WORLD_WIDTH);
          const ny = wrapY(current.y + dy, WORLD_HEIGHT);
          const nextKey = tileKey(nx, ny);
          if (bfsVisited.has(nextKey) || !component.has(nextKey)) continue;
          bfsVisited.add(nextKey);
          previous.set(nextKey, { fromKey: currentKey, toKey: nextKey });
          bfsQueue.push(nextKey);
        }
      }
    }

    const nodes = [...roadGraph.keys()];
    if (nodes.length < 2) continue;

    const bfsDist = (startKey: string): { farthestKey: string; maxDist: number } => {
      const dist = new Map<string, number>();
      const q: string[] = [startKey];
      dist.set(startKey, 0);
      let farthestKey = startKey;
      let maxDist = 0;
      while (q.length > 0) {
        const cur = q.shift()!;
        const edges = roadGraph.get(cur);
        if (!edges) continue;
        for (const edge of edges) {
          if (dist.has(edge.to)) continue;
          const d = dist.get(cur)! + edge.tiles;
          dist.set(edge.to, d);
          if (d > maxDist) {
            maxDist = d;
            farthestKey = edge.to;
          }
          q.push(edge.to);
        }
      }
      return { farthestKey, maxDist };
    };

    const first = bfsDist(nodes[0]!);
    const second = bfsDist(first.farthestKey);
    if (second.maxDist > longest) {
      longest = second.maxDist;
    }
  }

  if (longest === 0) return undefined;
  return { tileCount: longest + 1 };
};
