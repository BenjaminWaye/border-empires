import type { IncursionEdges } from "./client-reach-incursion.js";
import type { IncursionBreachStyle } from "./client-incursion-breach-style.js";

// Where the "breach" look goes for one incursion tile (rival land inside my
// reach -- see client-reach-incursion.ts). Only the boundary between the
// pocket and MY land gets it; sides facing unowned or third-party land keep
// the plain strip, so the effect only ever marks what's under threat.
//
// The ground looks (ember, ink) are drawn as a distance field around that
// boundary, so they stay seamless across tiles and corners: each tile near the
// boundary gets one quad, and an 8-neighbour bitmask tells the shader which
// neighbouring squares are "the other side". Pure + renderer-agnostic.

/** What sits at offset (dx, dy) from the pocket tile: more of this pocket, my land, or anything else. */
export type BreachNeighbourKind = "pocket" | "mine" | "other";

/** Neighbour offsets in bitmask order: bit i of a mask is NEIGHBOUR_OFFSETS[i]. Mirrored in the 3D band shader. */
export const NEIGHBOUR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
];

/**
 * One tile of the distance-field band, at (dx, dy) from the pocket tile.
 * side +1 = my tile (the field measures distance to the pocket squares in
 * `mask`), -1 = the pocket tile itself (distance to my squares in `mask`).
 */
export type BreachBandTile = { readonly dx: number; readonly dy: number; readonly side: 1 | -1; readonly mask: number };

export type IncursionBreachLayout = {
  /** Sides still drawn as the plain strip. */
  readonly straightEdges: IncursionEdges;
  /** Distance-field band tiles (ember / ink). My tiles may be listed by several pocket tiles; the renderer de-duplicates by world tile. */
  readonly band: readonly BreachBandTile[];
  /** Sides that raise the veil (veil style). */
  readonly veilSides: readonly (keyof IncursionEdges)[];
};

const SIDES: ReadonlyArray<{ readonly key: keyof IncursionEdges; readonly dx: number; readonly dy: number }> = [
  { key: "north", dx: 0, dy: -1 },
  { key: "east", dx: 1, dy: 0 },
  { key: "south", dx: 0, dy: 1 },
  { key: "west", dx: -1, dy: 0 }
];

const maskAround = (dx: number, dy: number, wanted: BreachNeighbourKind, kindAt: (dx: number, dy: number) => BreachNeighbourKind): number =>
  NEIGHBOUR_OFFSETS.reduce((mask, [ox, oy], bit) => (kindAt(dx + ox, dy + oy) === wanted ? mask | (1 << bit) : mask), 0);

export const incursionBreachLayout = (style: IncursionBreachStyle, kindAt: (dx: number, dy: number) => BreachNeighbourKind): IncursionBreachLayout => {
  const straightEdges = { north: false, east: false, south: false, west: false };
  const veilSides: (keyof IncursionEdges)[] = [];
  for (const side of SIDES) {
    const across = kindAt(side.dx, side.dy);
    if (across === "pocket") continue;
    if (style === "straight" || across !== "mine") straightEdges[side.key] = true;
    else if (style === "veil") veilSides.push(side.key);
  }
  if (style !== "ember" && style !== "ink") return { straightEdges, band: [], veilSides };

  const band: BreachBandTile[] = [];
  const ownMask = maskAround(0, 0, "mine", kindAt);
  // Ink only stains my side; ember glows both ways across the seam.
  if (ownMask !== 0 && style === "ember") band.push({ dx: 0, dy: 0, side: -1, mask: ownMask });
  NEIGHBOUR_OFFSETS.forEach(([dx, dy], bit) => {
    if ((ownMask & (1 << bit)) === 0) return;
    band.push({ dx, dy, side: 1, mask: maskAround(dx, dy, "pocket", kindAt) });
  });
  return { straightEdges, band, veilSides };
};
