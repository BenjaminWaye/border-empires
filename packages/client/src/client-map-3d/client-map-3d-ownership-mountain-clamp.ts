import type { Tile } from "../client-types.js";

// Split out of client-map-3d.ts (already at the repo's 500-line file cap)
// so this new mountain-edge fix didn't push that file over the limit.
//
// The ownership overlay's flat quad traces the heightfield's real
// per-corner height (see the corner*Y comments at its call site) so it
// hugs the visible terrain exactly -- but that means a claimed tile
// sitting next to a MOUNTAIN inherits that mountain's much taller shared
// corner height on the facing edge. Mountains themselves never get an
// ownership quad (client-map-3d.ts `continue`s on MOUNTAIN before reaching
// this block), yet their height still leaks into a neighbor's corners,
// bridging flat ground up to mountain height and rendering as a steep,
// near-vertical green wall across the mountain's base instead of a flat
// tint on the ground. Clamping each such corner back down to this tile's
// own flat height keeps the quad level right up to the mountain-facing
// edge.
export type OwnershipQuadCorners = {
  corner00Y: number;
  corner10Y: number;
  corner01Y: number;
  corner11Y: number;
};

export const ownershipQuadCornersClampedAwayFromMountain = (
  wx: number,
  wy: number,
  wxNext: number,
  wyNext: number,
  wrapX: (n: number) => number,
  wrapY: (n: number) => number,
  terrainForWorldTile: (wx: number, wy: number) => Tile["terrain"],
  cornerYAt: (wx: number, wy: number) => number,
  elevationAt: (wx: number, wy: number) => number,
  ownershipRiseAboveHeightfield: number
): OwnershipQuadCorners => {
  const ownFlatCornerY = elevationAt(wx, wy) + ownershipRiseAboveHeightfield;
  const touchesMountain = (dx: number, dy: number): boolean =>
    terrainForWorldTile(wrapX(wx + dx), wrapY(wy + dy)) === "MOUNTAIN";
  const clamp = (cornerY: number, touches: boolean): number => (touches ? Math.min(cornerY, ownFlatCornerY) : cornerY);
  const raw = (atWx: number, atWy: number): number => cornerYAt(atWx, atWy) + ownershipRiseAboveHeightfield;
  return {
    corner00Y: clamp(raw(wx, wy), touchesMountain(-1, -1) || touchesMountain(0, -1) || touchesMountain(-1, 0)),
    corner10Y: clamp(raw(wxNext, wy), touchesMountain(1, -1) || touchesMountain(0, -1) || touchesMountain(1, 0)),
    corner01Y: clamp(raw(wx, wyNext), touchesMountain(-1, 1) || touchesMountain(0, 1) || touchesMountain(-1, 0)),
    corner11Y: clamp(raw(wxNext, wyNext), touchesMountain(1, 1) || touchesMountain(0, 1) || touchesMountain(1, 0))
  };
};
