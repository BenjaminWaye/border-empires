// Settled-territory edge glow, renderer-neutral half: a settled tile's tint is
// strongest (rimOpacity) where it meets anything that isn't the same owner's
// settled land, fades smoothly to interiorOpacity over widthTiles, and a thin
// darker owner-colour line traces the boundary itself. The fade is computed
// per pixel from each tile's 8-neighbour mask, so it runs straight across tile
// seams instead of stepping per tile (a per-tile step would read as a tile
// state rather than lighting).
//
// 3D evaluates settledEdgeDistance/settledEdgeAlpha in a fragment shader
// (client-map-3d-settled-edge-glow.ts, which must stay in step with the
// functions below); 2D bakes them into small cached tiles
// (client-map-render-settled-edge-glow-2d.ts).
//
// widthTiles is capped at 1: the mask only knows a tile's immediate
// neighbours, and any boundary closer than one tile to a pixel is necessarily
// one of them, so distances below 1 are exact and the fade lands on
// interiorOpacity exactly where an unflagged interior tile begins.

export type SettledEdgeGlow = {
  readonly rimOpacity: number;
  readonly interiorOpacity: number;
  readonly widthTiles: number;
  // Boundary line half-width, in tiles. 0 disables the line. 3D only: 2D
  // already strokes exposed sides (client-tile-borders.ts).
  readonly lineTiles: number;
  // Line colour = owner colour * lineDarken.
  readonly lineDarken: number;
};

// interiorOpacity deliberately sits close to frontier's 0.3: the rim, not the
// fill strength, is what marks settled land.
export const DEFAULT_SETTLED_EDGE_GLOW: SettledEdgeGlow = {
  rimOpacity: 0.85,
  interiorOpacity: 0.35,
  widthTiles: 1,
  lineTiles: 0.035,
  lineDarken: 0.55
};

export const MAX_SETTLED_EDGE_GLOW_WIDTH_TILES = 1;
const MIN_SETTLED_EDGE_GLOW_WIDTH_TILES = 0.05;

export const clampSettledEdgeGlowWidth = (widthTiles: number): number =>
  Math.min(MAX_SETTLED_EDGE_GLOW_WIDTH_TILES, Math.max(MIN_SETTLED_EDGE_GLOW_WIDTH_TILES, widthTiles));

// Bit per neighbour that is NOT the same owner's settled land. Tile-local
// axes: u runs west->east (wx), v runs north->south (wy), matching both
// renderers' tile layout (3D corner00 = (wx, wy); 2D px/py = top-left).
export const EDGE_N = 1;
export const EDGE_E = 2;
export const EDGE_S = 4;
export const EDGE_W = 8;
export const EDGE_NE = 16;
export const EDGE_SE = 32;
export const EDGE_SW = 64;
export const EDGE_NW = 128;

const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [0, -1, EDGE_N], [1, 0, EDGE_E], [0, 1, EDGE_S], [-1, 0, EDGE_W],
  [1, -1, EDGE_NE], [1, 1, EDGE_SE], [-1, 1, EDGE_SW], [-1, -1, EDGE_NW]
];

// isSameSettled receives unwrapped neighbour coords; the caller wraps them.
export const settledEdgeMaskAt = (wx: number, wy: number, isSameSettled: (nx: number, ny: number) => boolean): number => {
  let mask = 0;
  for (const [dx, dy, bit] of NEIGHBOURS) {
    if (!isSameSettled(wx + dx, wy + dy)) mask |= bit;
  }
  return mask;
};

export type SettledEdgeNeighbourDeps = {
  readonly tiles: ReadonlyMap<string, { readonly ownerId?: string | null | undefined; readonly ownershipState?: string | undefined }>;
  readonly keyFor: (x: number, y: number) => string;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
};

// The glow follows the boundary of ownerId's SETTLED land, so a settled tile
// bordering its own owner's frontier still gets the rim (frontier reads as
// outside the settled outline).
export const settledEdgeMaskForOwner = (wx: number, wy: number, ownerId: string, deps: SettledEdgeNeighbourDeps): number =>
  settledEdgeMaskAt(wx, wy, (nx, ny) => {
    const neighbour = deps.tiles.get(deps.keyFor(deps.wrapX(nx), deps.wrapY(ny)));
    return neighbour?.ownerId === ownerId && neighbour.ownershipState === "SETTLED";
  });

// No flagged edge within reach -> 2, comfortably past any fade width.
const NO_EDGE_DISTANCE = 2;

/** Distance, in tiles, from tile-local (u, v) in [0,1]^2 to the nearest flagged edge or corner. */
export const settledEdgeDistance = (u: number, v: number, mask: number): number => {
  let d = NO_EDGE_DISTANCE;
  if (mask & EDGE_N) d = Math.min(d, v);
  if (mask & EDGE_E) d = Math.min(d, 1 - u);
  if (mask & EDGE_S) d = Math.min(d, 1 - v);
  if (mask & EDGE_W) d = Math.min(d, u);
  if (mask & EDGE_NE) d = Math.min(d, Math.hypot(1 - u, v));
  if (mask & EDGE_SE) d = Math.min(d, Math.hypot(1 - u, 1 - v));
  if (mask & EDGE_SW) d = Math.min(d, Math.hypot(u, 1 - v));
  if (mask & EDGE_NW) d = Math.min(d, Math.hypot(u, v));
  return d;
};

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Fill opacity at `distance` tiles from the settled boundary (no line). */
export const settledEdgeAlpha = (distance: number, glow: SettledEdgeGlow): number => {
  const fade = smoothstep(0, clampSettledEdgeGlowWidth(glow.widthTiles), distance);
  return glow.rimOpacity + (glow.interiorOpacity - glow.rimOpacity) * fade;
};
