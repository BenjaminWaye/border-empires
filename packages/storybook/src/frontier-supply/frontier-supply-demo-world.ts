import { computeFrontierSupplyModel, type FrontierSupplyModel, type FrontierSupplyTile } from "@client/client-frontier-supply/client-frontier-supply.js";

/**
 * Small fixture empires for the supply-line stories. Only the tiles and the
 * reach set are hand-built; the supply model itself always comes from the
 * real computeFrontierSupplyModel the game ships, and both stories draw it
 * with the real 2D/3D renderers.
 */

export const DEMO_ME = "player-1";
export const DEMO_COLOR = "#3fa9f5";
export const DEMO_WORLD = 64;

export type SupplyScenario = "snake" | "corridor" | "branching";

export type SupplyDemoWorld = {
  tiles: FrontierSupplyTile[];
  reach: Set<string>;
  model: FrontierSupplyModel;
  /** Bounds of the owned tiles, for framing the camera. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const REACH_RADIUS = 3;
const HOME = { x: 20, y: 20 };

export const buildSupplyDemoWorld = (scenario: SupplyScenario): SupplyDemoWorld => {
  const byKey = new Map<string, FrontierSupplyTile>();
  const put = (x: number, y: number, ownershipState: "SETTLED" | "FRONTIER"): void => {
    byKey.set(`${x},${y}`, { x, y, ownerId: DEMO_ME, ownershipState });
  };
  const reach = new Set<string>();

  // A home town: settled core, frontier out to the edge of its reach disk.
  for (let dy = -REACH_RADIUS; dy <= REACH_RADIUS; dy += 1) {
    for (let dx = -REACH_RADIUS; dx <= REACH_RADIUS; dx += 1) {
      reach.add(`${HOME.x + dx},${HOME.y + dy}`);
      put(HOME.x + dx, HOME.y + dy, Math.max(Math.abs(dx), Math.abs(dy)) <= 1 ? "SETTLED" : "FRONTIER");
    }
  }

  const eastStart = HOME.x + REACH_RADIUS + 1;
  if (scenario === "snake") {
    // The reported case: a one-tile-wide line pushed far past reach. Every
    // tile on it is a chokepoint for everything beyond it.
    for (let i = 0; i < 14; i += 1) put(eastStart + i, HOME.y + (i >= 7 ? 1 : 0), "FRONTIER");
  } else if (scenario === "corridor") {
    // Two tiles wide: no single tile holds the line up, until it narrows at the tip.
    for (let i = 0; i < 10; i += 1) {
      put(eastStart + i, HOME.y, "FRONTIER");
      put(eastStart + i, HOME.y + 1, "FRONTIER");
    }
    for (let i = 10; i < 13; i += 1) put(eastStart + i, HOME.y, "FRONTIER");
  } else {
    // A trunk that forks: the trunk carries both branches, so its chokepoints count more tiles.
    for (let i = 0; i < 5; i += 1) put(eastStart + i, HOME.y, "FRONTIER");
    for (let i = 1; i <= 6; i += 1) put(eastStart + 4 + i, HOME.y - i, "FRONTIER");
    for (let i = 1; i <= 8; i += 1) put(eastStart + 4 + i, HOME.y + Math.min(i, 3), "FRONTIER");
  }

  const tiles = [...byKey.values()];
  const model = computeFrontierSupplyModel({ tiles, me: DEMO_ME, reach, worldWidth: DEMO_WORLD, worldHeight: DEMO_WORLD });
  const xs = tiles.map((tile) => tile.x);
  const ys = tiles.map((tile) => tile.y);
  return { tiles, reach, model, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

export const SUPPLY_SCENARIO_DESCRIPTIONS: Record<SupplyScenario, string> = {
  snake: "A one-tile-wide line pushed 14 tiles past reach (the reported case). Every tile on it is an amber chokepoint: lose any one and everything past it goes.",
  corridor: "A two-wide corridor: no chokepoints until it narrows to one tile at the tip.",
  branching: "A trunk that forks into two branches. The trunk's chokepoints hold up both branches."
};
