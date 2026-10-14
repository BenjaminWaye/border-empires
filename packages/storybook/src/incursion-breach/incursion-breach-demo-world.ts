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
  straight: "Current — straight outline",
  spikes: "Front-line spikes",
  ember: "Option 1 — ember seam",
  ink: "Option 2 — ink bleed",
  veil: "Option 3 — aether veil"
};

export type BreachDemoWorld = {
  readonly mine: ReadonlySet<string>;
  readonly pocket: ReadonlySet<string>;
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

/** The production breach layout's neighbour classifier, for a pocket tile of the demo world. */
export const demoKindAt =
  (world: BreachDemoWorld, x: number, y: number) =>
  (dx: number, dy: number): BreachNeighbourKind => {
    const key = tileKey(x + dx, y + dy);
    return world.pocket.has(key) ? "pocket" : world.mine.has(key) ? "mine" : "other";
  };
