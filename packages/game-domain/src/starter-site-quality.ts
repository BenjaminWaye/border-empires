import { TOWN_REACH_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, wrapX, wrapY } from "@border-empires/shared";
import type { DomainTileState } from "./index/index.js";

// The first useful target must be claimable before building a beacon.
export const STARTER_FOOD_DISTANCE = TOWN_REACH_RADIUS;
export const STARTER_FOOD_SUPPLY_DISTANCE = 6;
export const STARTER_ECONOMY_DISTANCE = 8;
export const STARTER_FOOD_SLOTS = 4;
export const STARTER_TOWN_CLEARANCE = 5;

export type StarterSiteQuality = {
  foodDistance: number;
  townDistance: number;
  foodSlots: number;
};

/** Bounded cardinal land paths: nearby across a bay or mountain is not reachable. */
export const starterSiteQuality = (
  tiles: ReadonlyMap<string, DomainTileState>,
  x: number,
  y: number,
  width = WORLD_WIDTH,
  height = WORLD_HEIGHT,
  isOpenLand: (x: number, y: number) => boolean = () => true
): StarterSiteQuality | undefined => {
  const origin = tiles.get(`${x},${y}`);
  if (!origin || origin.terrain !== "LAND" || origin.ownerId || !isOpenLand(x, y)) return undefined;
  const queue = [{ x, y, distance: 0 }];
  // At most 145 coordinates in a radius-eight cardinal disk. Local to one query.
  const visited = new Set<string>([`${x},${y}`]);
  let foodDistance = Infinity;
  let townDistance = Infinity;
  let foodSlots = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const tile = tiles.get(`${current.x},${current.y}`)!;
    if (tile.town) {
      const dx = Math.min(Math.abs(current.x - x), width - Math.abs(current.x - x));
      const dy = Math.min(Math.abs(current.y - y), height - Math.abs(current.y - y));
      if (dx + dy < STARTER_TOWN_CLEARANCE) return undefined;
      townDistance = Math.min(townDistance, current.distance);
    }
    const slots = tile.resource === "FARM" ? 1 : tile.resource === "FISH" ? 2 : 0;
    if (slots > 0) {
      foodDistance = Math.min(foodDistance, current.distance);
      if (current.distance <= STARTER_FOOD_SUPPLY_DISTANCE) foodSlots += slots;
    }
    if (current.distance === STARTER_ECONOMY_DISTANCE) continue;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = wrapX(current.x + dx, width);
      const ny = wrapY(current.y + dy, height);
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const next = tiles.get(key);
      if (!next || next.terrain !== "LAND" || next.ownerId || !isOpenLand(nx, ny)) continue;
      queue.push({ x: nx, y: ny, distance: current.distance + 1 });
    }
  }
  if (townDistance > STARTER_ECONOMY_DISTANCE || foodDistance > STARTER_FOOD_DISTANCE || foodSlots < STARTER_FOOD_SLOTS) return undefined;
  return { foodDistance, townDistance, foodSlots };
};
