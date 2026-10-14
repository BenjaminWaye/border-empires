import type { IncursionEdges } from "./client-reach-incursion.js";
import type { IncursionBreachStyle } from "./client-incursion-breach-style.js";

// Where the "breach" look goes for one incursion tile (rival land inside my
// reach -- see client-reach-incursion.ts). Only the boundary between the
// pocket and MY land gets it; sides facing unowned or third-party land keep
// the plain strip, so the effect only ever marks what's under threat.
//
// Spikes are flat polygons (`front`). The ground looks (ember, ink) are
// drawn as a distance field around that boundary, so they stay seamless across
// tiles and corners: each tile near the boundary gets one quad, and an
// 8-neighbour bitmask tells the shader which neighbouring squares are "the
// other side". Pure + renderer-agnostic.

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

export type BreachPoint = { readonly x: number; readonly y: number };

/**
 * One convex piece of the spikes-style front line (a line segment or half a
 * tooth), tile-local: the tile spans [-0.5, 0.5] on both axes, +x east, +y
 * south (= scene +z). Drawn in the attacker's colour times `shade` (1 = lit,
 * < 1 = the shaded half of a tooth).
 */
export type BreachFrontPiece = { readonly points: readonly BreachPoint[]; readonly shade: number };

export type IncursionBreachLayout = {
  /** Sides still drawn as the plain strip. */
  readonly straightEdges: IncursionEdges;
  /** Spikes style: a thin line round the pocket, with teeth on the sides facing my land. */
  readonly front: readonly BreachFrontPiece[];
  /** Distance-field band tiles (ember / ink). My tiles may be listed by several pocket tiles; the renderer de-duplicates by world tile. */
  readonly band: readonly BreachBandTile[];
  /** Sides that raise the veil (veil style). */
  readonly veilSides: readonly (keyof IncursionEdges)[];
};

/** Each side: its outward direction (dx, dy), the corner it starts at, and its unit tangent from there. */
const SIDES: ReadonlyArray<{ readonly key: keyof IncursionEdges; readonly dx: number; readonly dy: number; readonly a: BreachPoint; readonly t: BreachPoint }> = [
  { key: "north", dx: 0, dy: -1, a: { x: -0.5, y: -0.5 }, t: { x: 1, y: 0 } },
  { key: "east", dx: 1, dy: 0, a: { x: 0.5, y: -0.5 }, t: { x: 0, y: 1 } },
  { key: "south", dx: 0, dy: 1, a: { x: 0.5, y: 0.5 }, t: { x: -1, y: 0 } },
  { key: "west", dx: -1, dy: 0, a: { x: -0.5, y: 0.5 }, t: { x: 0, y: -1 } }
];

// Spikes style, after Hearts of Iron IV front lines: one solid shape in a
// single colour -- a thin line on the boundary with small, widely spaced
// teeth standing on it. Regular, not random: it should read as a map symbol.
// Teeth sit at the same spacing on every tile, so they continue evenly along
// a front that spans several tiles.
const LINE_WIDTH = 0.035;
const TEETH_PER_SIDE = 3;
const TOOTH_HEIGHT = 0.16;
const TOOTH_HALF_BASE = 0.065;
/** Light comes from the north-west (tile-local x, y); the tooth half facing away from it is shaded. */
const TOWARD_LIGHT = { x: -0.6, y: -0.8 };
const SHADED = 0.72;

const sideFront = (side: (typeof SIDES)[number], withTeeth: boolean, kindAt: (dx: number, dy: number) => BreachNeighbourKind): BreachFrontPiece[] => {
  const at = (u: number, out: number): BreachPoint => ({ x: side.a.x + side.t.x * u + side.dx * out, y: side.a.y + side.t.y * u + side.dy * out });
  const h = LINE_WIDTH / 2;
  // Centred on the boundary, overrunning each end by half its width so corners join cleanly.
  const pieces: BreachFrontPiece[] = [{ points: [at(-h, -h), at(1 + h, -h), at(1 + h, h), at(-h, h)], shade: 1 }];
  if (!withTeeth) return pieces;
  // At an inside corner the neighbouring pocket side's end tooth points into
  // the same tile of mine, so drop ours there or the two collide.
  const concaveAtStart = kindAt(side.dx - side.t.x, side.dy - side.t.y) === "pocket";
  const concaveAtEnd = kindAt(side.dx + side.t.x, side.dy + side.t.y) === "pocket";
  const startHalfLit = -side.t.x * TOWARD_LIGHT.x - side.t.y * TOWARD_LIGHT.y > 0;
  for (let i = 0; i < TEETH_PER_SIDE; i += 1) {
    if ((i === 0 && concaveAtStart) || (i === TEETH_PER_SIDE - 1 && concaveAtEnd)) continue;
    const u = (i + 0.5) / TEETH_PER_SIDE;
    const tip = at(u, h + TOOTH_HEIGHT);
    const mid = at(u, h * 0.5);
    pieces.push({ points: [at(u - TOOTH_HALF_BASE, h * 0.5), mid, tip], shade: startHalfLit ? 1 : SHADED });
    pieces.push({ points: [mid, at(u + TOOTH_HALF_BASE, h * 0.5), tip], shade: startHalfLit ? SHADED : 1 });
  }
  return pieces;
};

const maskAround = (dx: number, dy: number, wanted: BreachNeighbourKind, kindAt: (dx: number, dy: number) => BreachNeighbourKind): number =>
  NEIGHBOUR_OFFSETS.reduce((mask, [ox, oy], bit) => (kindAt(dx + ox, dy + oy) === wanted ? mask | (1 << bit) : mask), 0);

export const incursionBreachLayout = (style: IncursionBreachStyle, kindAt: (dx: number, dy: number) => BreachNeighbourKind): IncursionBreachLayout => {
  const straightEdges = { north: false, east: false, south: false, west: false };
  const veilSides: (keyof IncursionEdges)[] = [];
  const front: BreachFrontPiece[] = [];
  for (const side of SIDES) {
    const across = kindAt(side.dx, side.dy);
    if (across === "pocket") continue;
    // Spikes replace the strip all the way round with the thin front line; only sides facing my land get teeth.
    if (style === "spikes") front.push(...sideFront(side, across === "mine", kindAt));
    else if (style === "straight" || across !== "mine") straightEdges[side.key] = true;
    else if (style === "veil") veilSides.push(side.key);
  }
  if (style !== "ember" && style !== "ink") return { straightEdges, front, band: [], veilSides };

  const band: BreachBandTile[] = [];
  const ownMask = maskAround(0, 0, "mine", kindAt);
  // Ink only stains my side; ember glows both ways across the seam.
  if (ownMask !== 0 && style === "ember") band.push({ dx: 0, dy: 0, side: -1, mask: ownMask });
  NEIGHBOUR_OFFSETS.forEach(([dx, dy], bit) => {
    if ((ownMask & (1 << bit)) === 0) return;
    band.push({ dx, dy, side: 1, mask: maskAround(dx, dy, "pocket", kindAt) });
  });
  return { straightEdges, front, band, veilSides };
};
