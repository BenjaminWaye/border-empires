// Demo world for the IncursionBreachEdge story: my empire is
// an 11x7 block, and inside it sit an L-shaped rival pocket, a single-tile
// pocket, and a pocket on my outer border whose east side faces unowned land
// (that side keeps the plain strip in every style). Where the breach look
// goes comes from the production client-incursion-breach-layout.ts.
import type { BreachNeighbourKind } from "@client/client-reach-incursion/client-incursion-breach-layout.js";
import type { IncursionBreachStyle } from "@client/client-reach-incursion/client-incursion-breach-style.js";

export const MINE_HALF_WIDTH = 5;
export const MINE_HALF_HEIGHT = 3;

export const BREACH_STYLE_LABELS: Readonly<Record<IncursionBreachStyle, string>> = {
  straight: "Old — straight outline",
  spikes: "Front-line spikes (default)",
  ember: "Option 1 — ember seam",
  ink: "Option 2 — ink bleed",
  veil: "Option 3 — aether veil"
};

export type BreachDemoWorld = {
  readonly mine: ReadonlySet<string>;
  /** Rival tiles inside my reach (drawn as incursions). */
  readonly pocket: ReadonlySet<string>;
  /** The same rival's own land outside my reach (plain fill, no incursion overlay). */
  readonly rival?: ReadonlySet<string>;
};

export const tileKey = (x: number, y: number): string => `${x},${y}`;

export const parseTileKey = (key: string): { x: number; y: number } => {
  const [x, y] = key.split(",").map(Number);
  return { x: x!, y: y! };
};

export const buildBreachDemoWorld = (): BreachDemoWorld => {
  const pocketTiles: ReadonlyArray<readonly [number, number]> = [
    [-3, -1],
    [-2, -1],
    [-2, 0],
    [1, 1],
    [5, -1],
    [5, 0]
  ];
  const pocket = new Set(pocketTiles.map(([x, y]) => tileKey(x, y)));
  const mine = new Set<string>();
  for (let y = -MINE_HALF_HEIGHT; y <= MINE_HALF_HEIGHT; y += 1) {
    for (let x = -MINE_HALF_WIDTH; x <= MINE_HALF_WIDTH; x += 1) {
      if (!pocket.has(tileKey(x, y))) mine.add(tileKey(x, y));
    }
  }
  return { mine, pocket };
};

/** The production breach layout's neighbour classifier (as incursionNeighbourKindAt), for a pocket tile of the demo world. */
export const demoKindAt =
  (world: BreachDemoWorld, x: number, y: number) =>
  (dx: number, dy: number): BreachNeighbourKind => {
    const key = tileKey(x + dx, y + dy);
    if (world.pocket.has(key)) return "pocket";
    if (world.rival?.has(key)) return "rival";
    return world.mine.has(key) ? "mine" : "other";
  };

/**
 * Two empires sharing a straight border (mine west, the rival's east of
 * x = 0.5), and the rival has pushed across it: a two-tile-deep bulge plus a
 * single tile further down, both still attached to their own land. Those
 * tiles are inside my reach, so they're incursions; the rival's land behind
 * the old border is not.
 */
export const buildBorderDemoWorld = (): BreachDemoWorld => {
  const pushed: ReadonlyArray<readonly [number, number]> = [
    [0, -2],
    [0, -1],
    [-1, -1],
    [0, 0],
    [-1, 0],
    [0, 2]
  ];
  const pocket = new Set(pushed.map(([x, y]) => tileKey(x, y)));
  const mine = new Set<string>();
  const rival = new Set<string>();
  for (let y = -MINE_HALF_HEIGHT; y <= MINE_HALF_HEIGHT; y += 1) {
    for (let x = -MINE_HALF_WIDTH; x <= MINE_HALF_WIDTH; x += 1) {
      const key = tileKey(x, y);
      if (pocket.has(key)) continue;
      (x <= 0 ? mine : rival).add(key);
    }
  }
  return { mine, pocket, rival };
};
