import type { IncursionEdges } from "./client-reach-incursion.js";
import type { IncursionBreachStyle } from "./client-incursion-breach-style.js";
import { isOuterStartCorner, organicSideFront, type BreachFrontPiece, type FrontNeighbourKind } from "./client-incursion-breach-front.js";

export type { BreachFrontPiece, BreachPoint } from "./client-incursion-breach-front.js";

// Where the "breach" look goes for one incursion tile (rival land inside my
// reach -- see client-reach-incursion.ts). Only the boundary between the
// pocket and MY land gets it; sides facing unowned or third-party land keep
// the plain strip, so the effect only ever marks what's under threat.
//
// Spikes are flat polygons (`front`, see client-incursion-breach-front.ts).
// The ground looks (ember, ink) are drawn as a distance field around that
// boundary, so they stay seamless across tiles and corners: each tile near
// the boundary gets one quad, and an 8-neighbour bitmask tells the shader
// which neighbouring squares are "the other side". Pure + renderer-agnostic.

/** What sits at offset (dx, dy) from the pocket tile: more of this pocket, the rival's own land outside my reach, my land, or anything else. */
export type BreachNeighbourKind = FrontNeighbourKind;

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
  /** Spikes style: a thin line round the pocket, with teeth on the sides facing my land. */
  readonly front: readonly BreachFrontPiece[];
  /** Spikes style: the tile's outer corners the line rounds off (bit 0 NW, 1 NE, 2 SE, 3 SW), so the hatch can round them too. */
  readonly roundedCorners: number;
  /** Distance-field band tiles (ember / ink / the spikes' pressure wash). My tiles may be listed by several pocket tiles; the renderer de-duplicates by world tile. */
  readonly band: readonly BreachBandTile[];
  /** Sides that raise the veil (veil style). */
  readonly veilSides: readonly (keyof IncursionEdges)[];
};

/** Each side: its outward direction (dx, dy), the corner it starts at, and its unit tangent from there. */
const SIDES: ReadonlyArray<{ readonly key: keyof IncursionEdges; readonly dx: number; readonly dy: number; readonly a: { x: number; y: number }; readonly t: { x: number; y: number } }> = [
  { key: "north", dx: 0, dy: -1, a: { x: -0.5, y: -0.5 }, t: { x: 1, y: 0 } },
  { key: "east", dx: 1, dy: 0, a: { x: 0.5, y: -0.5 }, t: { x: 0, y: 1 } },
  { key: "south", dx: 0, dy: 1, a: { x: 0.5, y: 0.5 }, t: { x: -1, y: 0 } },
  { key: "west", dx: -1, dy: 0, a: { x: -0.5, y: 0.5 }, t: { x: 0, y: -1 } }
];

const maskAround = (dx: number, dy: number, wanted: BreachNeighbourKind, kindAt: (dx: number, dy: number) => BreachNeighbourKind): number =>
  NEIGHBOUR_OFFSETS.reduce((mask, [ox, oy], bit) => (kindAt(dx + ox, dy + oy) === wanted ? mask | (1 << bit) : mask), 0);

/** `worldX`/`worldY` place the tile on the map (the spikes line meanders by world position, so neighbours line up). */
export const incursionBreachLayout = (
  style: IncursionBreachStyle,
  kindAt: (dx: number, dy: number) => BreachNeighbourKind,
  worldX = 0,
  worldY = 0
): IncursionBreachLayout => {
  const straightEdges = { north: false, east: false, south: false, west: false };
  const veilSides: (keyof IncursionEdges)[] = [];
  const front: BreachFrontPiece[] = [];
  let roundedCorners = 0;
  SIDES.forEach((side, index) => {
    const across = kindAt(side.dx, side.dy);
    // Pocket continues, or the old border with the rival's own land: no edge there.
    if (across === "pocket" || across === "rival") return;
    // Each side starts at corner `index` (NW, NE, SE, SW).
    if (style === "spikes" && isOuterStartCorner(side, kindAt)) roundedCorners |= 1 << index;
    // Spikes replace the strip all the way round with the thin front line; only sides facing my land get teeth.
    if (style === "spikes") front.push(...organicSideFront(side, across === "mine", worldX, worldY, kindAt));
    else if (style === "straight" || across !== "mine") straightEdges[side.key] = true;
    else if (style === "veil") veilSides.push(side.key);
  });
  // Spikes also get a band: the pressure wash under the front line, on my side only.
  if (style !== "ember" && style !== "ink" && style !== "spikes") return { straightEdges, front, roundedCorners, band: [], veilSides };

  const band: BreachBandTile[] = [];
  const ownMask = maskAround(0, 0, "mine", kindAt);
  // Ink only stains my side; ember glows both ways across the seam.
  if (ownMask !== 0 && style === "ember") band.push({ dx: 0, dy: 0, side: -1, mask: ownMask });
  NEIGHBOUR_OFFSETS.forEach(([dx, dy], bit) => {
    if ((ownMask & (1 << bit)) === 0) return;
    band.push({ dx, dy, side: 1, mask: maskAround(dx, dy, "pocket", kindAt) });
  });
  return { straightEdges, front, roundedCorners, band, veilSides };
};
