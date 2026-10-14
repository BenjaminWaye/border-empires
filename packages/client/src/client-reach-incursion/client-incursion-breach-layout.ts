import type { IncursionEdges } from "./client-reach-incursion.js";
import type { IncursionBreachStyle } from "./client-incursion-breach-style.js";

// Where the "breach" look goes for one incursion tile (rival land inside my
// reach -- see client-reach-incursion.ts). Only the boundary between the
// pocket and MY land gets it; sides facing unowned or third-party land keep
// the plain strip, so the effect only ever marks what's under threat.
//
// Spikes are plain triangles (`teeth`). The ground looks (ember, ink) are
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
 * One front-line tooth (spikes style), tile-local: the tile spans [-0.5, 0.5]
 * on both axes, +x east, +y south (= scene +z). `fill` is drawn in the
 * attacker's colour on top of `outline`, a slightly larger copy drawn in the
 * pocket's outline colour so the tooth reads on any ground.
 */
export type BreachTooth = {
  readonly outline: readonly [BreachPoint, BreachPoint, BreachPoint];
  readonly fill: readonly [BreachPoint, BreachPoint, BreachPoint];
};

export type IncursionBreachLayout = {
  /** Sides still drawn as the plain strip. */
  readonly straightEdges: IncursionEdges;
  /** Front-line teeth on the sides facing my land (spikes style). */
  readonly teeth: readonly BreachTooth[];
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

// Front-line teeth: regular, not random -- it should read as a map symbol.
const TEETH_PER_SIDE = 4;
const TOOTH_HEIGHT = 0.2;
const TOOTH_HALF_BASE = 0.07;
const TOOTH_OUTLINE = 0.028;

const sideTeeth = (side: (typeof SIDES)[number], kindAt: (dx: number, dy: number) => BreachNeighbourKind): BreachTooth[] => {
  const at = (u: number, out: number): BreachPoint => ({ x: side.a.x + side.t.x * u + side.dx * out, y: side.a.y + side.t.y * u + side.dy * out });
  // At an inside corner the neighbouring pocket side's end tooth points into
  // the same tile of mine, so drop ours there or the two collide.
  const concaveAtStart = kindAt(side.dx - side.t.x, side.dy - side.t.y) === "pocket";
  const concaveAtEnd = kindAt(side.dx + side.t.x, side.dy + side.t.y) === "pocket";
  const teeth: BreachTooth[] = [];
  for (let i = 0; i < TEETH_PER_SIDE; i += 1) {
    if ((i === 0 && concaveAtStart) || (i === TEETH_PER_SIDE - 1 && concaveAtEnd)) continue;
    const u = (i + 0.5) / TEETH_PER_SIDE;
    const w = TOOTH_HALF_BASE;
    const g = TOOTH_OUTLINE;
    teeth.push({
      outline: [at(u - w - g, -0.03), at(u + w + g, -0.03), at(u, TOOTH_HEIGHT + g * 1.7)],
      fill: [at(u - w, -0.01), at(u + w, -0.01), at(u, TOOTH_HEIGHT)]
    });
  }
  return teeth;
};

const maskAround = (dx: number, dy: number, wanted: BreachNeighbourKind, kindAt: (dx: number, dy: number) => BreachNeighbourKind): number =>
  NEIGHBOUR_OFFSETS.reduce((mask, [ox, oy], bit) => (kindAt(dx + ox, dy + oy) === wanted ? mask | (1 << bit) : mask), 0);

export const incursionBreachLayout = (style: IncursionBreachStyle, kindAt: (dx: number, dy: number) => BreachNeighbourKind): IncursionBreachLayout => {
  const straightEdges = { north: false, east: false, south: false, west: false };
  const veilSides: (keyof IncursionEdges)[] = [];
  const teeth: BreachTooth[] = [];
  for (const side of SIDES) {
    const across = kindAt(side.dx, side.dy);
    if (across === "pocket") continue;
    if (style === "straight" || across !== "mine") straightEdges[side.key] = true;
    else if (style === "veil") veilSides.push(side.key);
    else if (style === "spikes") {
      // The strip stays as the front line itself; the teeth stand on it.
      straightEdges[side.key] = true;
      teeth.push(...sideTeeth(side, kindAt));
    }
  }
  if (style !== "ember" && style !== "ink") return { straightEdges, teeth, band: [], veilSides };

  const band: BreachBandTile[] = [];
  const ownMask = maskAround(0, 0, "mine", kindAt);
  // Ink only stains my side; ember glows both ways across the seam.
  if (ownMask !== 0 && style === "ember") band.push({ dx: 0, dy: 0, side: -1, mask: ownMask });
  NEIGHBOUR_OFFSETS.forEach(([dx, dy], bit) => {
    if ((ownMask & (1 << bit)) === 0) return;
    band.push({ dx, dy, side: 1, mask: maskAround(dx, dy, "pocket", kindAt) });
  });
  return { straightEdges, teeth, band, veilSides };
};
