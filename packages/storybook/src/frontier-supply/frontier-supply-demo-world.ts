import { computeFrontierSupplyModel, type FrontierSupplyModel, type FrontierSupplyTile } from "@client/client-frontier-supply/client-frontier-supply.js";

/**
 * Small fixture empires for the supply-route stories. Only the tiles and the
 * reach set are hand-built; the supply model always comes from the real
 * computeFrontierSupplyModel the game ships, and both stories draw it with
 * the real 2D/3D renderers.
 */

export const DEMO_ME = "player-1";
export const DEMO_RIVAL = "rival";
export const DEMO_COLOR = "#3fa9f5";
export const DEMO_RIVAL_COLOR = "#e5484d";
export const DEMO_WORLD = 64;

export type SupplyScenario = "snake" | "corridor" | "branching" | "reroute";

export type SupplyDemoWorld = {
  /** The viewer's tiles plus any rival-captured ones (ownerId DEMO_RIVAL). */
  tiles: FrontierSupplyTile[];
  reach: Set<string>;
  model: FrontierSupplyModel;
  /** Bounds of all tiles, for framing the camera. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

const REACH_RADIUS = 3;
const HOME = { x: 20, y: 20 };
const EAST = HOME.x + REACH_RADIUS + 1;

/** The two tiles the Reroute story's rival takes in turn, one on each arm of the loop. */
export const REROUTE_TARGETS = [`${EAST + 2},${HOME.y - 2}`, `${EAST + 2},${HOME.y + 2}`] as const;

/**
 * Reroute phases: both arms held, upper arm cut, both held, lower arm cut.
 * Returns the tile keys the rival holds at `nowMs`.
 */
export const rerouteCapturesAt = (nowMs: number, phaseMs: number): string[] => {
  const phase = Math.floor(nowMs / phaseMs) % 4;
  return phase === 1 ? [REROUTE_TARGETS[0]] : phase === 3 ? [REROUTE_TARGETS[1]] : [];
};

export const buildSupplyDemoWorld = (scenario: SupplyScenario, captured: readonly string[] = []): SupplyDemoWorld => {
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

  if (scenario === "snake") {
    // The reported case: a one-tile-wide line pushed far past reach.
    for (let i = 0; i < 14; i += 1) put(EAST + i, HOME.y + (i >= 7 ? 1 : 0), "FRONTIER");
  } else if (scenario === "corridor") {
    // Two tiles wide: no single tile holds it up, until it narrows at the end.
    for (let i = 0; i < 10; i += 1) {
      put(EAST + i, HOME.y, "FRONTIER");
      put(EAST + i, HOME.y + 1, "FRONTIER");
    }
    for (let i = 10; i < 13; i += 1) put(EAST + i, HOME.y, "FRONTIER");
  } else if (scenario === "branching") {
    // A trunk that forks: the trunk carries both branches.
    for (let i = 0; i < 5; i += 1) put(EAST + i, HOME.y, "FRONTIER");
    for (let i = 1; i <= 6; i += 1) put(EAST + 4 + i, HOME.y - i, "FRONTIER");
    for (let i = 1; i <= 8; i += 1) put(EAST + 4 + i, HOME.y + Math.min(i, 3), "FRONTIER");
  } else {
    // A loop with a tail: both arms leave the town's frontier directly and
    // rejoin further out, so only the tail hangs on one tile. Losing a tile on
    // one arm leaves the other as the only way back.
    for (const side of [-1, 1]) {
      put(EAST, HOME.y + side, "FRONTIER");
      put(EAST + 1, HOME.y + side * 2, "FRONTIER");
      put(EAST + 2, HOME.y + side * 2, "FRONTIER");
      put(EAST + 3, HOME.y + side, "FRONTIER");
    }
    for (let i = 4; i <= 10; i += 1) put(EAST + i, HOME.y, "FRONTIER");
  }

  for (const key of captured) {
    const tile = byKey.get(key);
    if (tile) byKey.set(key, { ...tile, ownerId: DEMO_RIVAL, ownershipState: "FRONTIER" });
  }

  const tiles = [...byKey.values()];
  const model = computeFrontierSupplyModel({ tiles, me: DEMO_ME, reach, worldWidth: DEMO_WORLD, worldHeight: DEMO_WORLD });
  const xs = tiles.map((tile) => tile.x);
  const ys = tiles.map((tile) => tile.y);
  return { tiles, reach, model, minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

export const SUPPLY_SCENARIO_DESCRIPTIONS: Record<SupplyScenario, string> = {
  snake: "A one-tile-wide line pushed 14 tiles past reach: everything past its first tile hangs on that tile, so one line runs from a ring there to the tip.",
  corridor: "A two-wide corridor: no single tile holds it, so nothing is drawn until it narrows to one tile wide near the end.",
  branching: "A trunk that forks into two branches. Both hang on the trunk's first tile: one ring there, with the line splitting at the fork.",
  reroute: "A loop past reach with a tail. The loop has two ways back, so only the tail is flagged, from the tile where it leaves the loop. Every few seconds a rival (red) takes a tile on one arm: the other arm becomes the only way back, so a ring appears where that arm starts and the line runs down it (the stub left on the cut arm gets its own short line)."
};
