import { HEIGHTFIELD_HILLS_ELEVATION_BONUS } from "../client-map-3d-heightfield-terrain.js";
import { hillBumpsWithCorridorAt, hillNeighborFlagsAt, hillShapeHeight, type RoadCutDirections } from "../client-map-3d-hill-shape.js";

// Overlays sit on the *rendered* surface, not the tile's base elevation. The
// heightfield's drawn corners get pulled up by averaging with raised
// neighbours (mountains, hills), so a tile's painted surface can be much
// higher than its base. Max of all 4 corners + small buffer keeps props above
// the ground at every interior point of the tile. elevationAt already bakes
// HEIGHTFIELD_HILLS_ELEVATION_BONUS into a hill tile's own cached base
// elevation (see sampleTile in client-map-3d-heightfield.ts).
//
// That "highest point" height is right for props (towns, forts) but wrong for
// flat tile-sized planes/labels on a hill: the hill dome (client-map-3d-hills.ts)
// only reaches BONUS * hillShapeHeight above ground -- about a fifth of the
// bonus at the tile centre -- so a flat overlay parked at the bonus height
// floated visibly in the air. `flatOverlayY` follows the dome instead.
export type TileSurfaceHeights = {
  readonly surfaceY: number;
  readonly flatOverlayY: number;
};

export type TileSurfaceHeightfield = {
  readonly elevationAt: (wx: number, wy: number) => number;
  readonly cornerYAt: (cornerX: number, cornerZ: number) => number;
};

export type TileSurfaceInputs = {
  readonly heightfield: TileSurfaceHeightfield;
  readonly wx: number;
  readonly wy: number;
  readonly wxNext: number;
  readonly wyNext: number;
  readonly rise: number;
  readonly isHillsAt: (x: number, y: number) => boolean;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly roadDirsAt: (x: number, y: number) => RoadCutDirections | undefined;
};

export const tileSurfaceHeights = (inputs: TileSurfaceInputs): TileSurfaceHeights => {
  const { heightfield, wx, wy, wxNext, wyNext, rise } = inputs;
  const c00 = heightfield.cornerYAt(wx, wy);
  const c10 = heightfield.cornerYAt(wxNext, wy);
  const c01 = heightfield.cornerYAt(wx, wyNext);
  const c11 = heightfield.cornerYAt(wxNext, wyNext);
  const surfaceY = Math.max(heightfield.elevationAt(wx, wy), c00, c10, c01, c11) + rise;
  if (!inputs.isHillsAt(wx, wy)) return { surfaceY, flatOverlayY: surfaceY };
  const bumps = hillBumpsWithCorridorAt(wx, wy, hillNeighborFlagsAt(wx, wy, inputs.isHillsAt, inputs.wrapX, inputs.wrapY));
  const groundY = (c00 + c10 + c01 + c11) * 0.25;
  const domeY = groundY + HEIGHTFIELD_HILLS_ELEVATION_BONUS * hillShapeHeight(0, 0, bumps, wx, wy, inputs.roadDirsAt(wx, wy));
  return { surfaceY, flatOverlayY: Math.min(surfaceY, Math.max(domeY, groundY) + rise) };
};

export type TileCornerYs = {
  readonly corner00Y: number;
  readonly corner10Y: number;
  readonly corner01Y: number;
  readonly corner11Y: number;
};

/**
 * The heightfield's rendered Y at a tile's four corners, lifted by `rise`.
 * Per-tile ground overlays (ownership fill, settle sweep, rival-reach hatch)
 * trace exactly the visible surface with these; wxNext/wyNext are the
 * already-wrapped neighbour coordinates.
 */
export const tileCornerYs = (
  heightfield: Pick<TileSurfaceHeightfield, "cornerYAt">,
  wx: number,
  wy: number,
  wxNext: number,
  wyNext: number,
  rise: number
): TileCornerYs => ({
  corner00Y: heightfield.cornerYAt(wx, wy) + rise,
  corner10Y: heightfield.cornerYAt(wxNext, wy) + rise,
  corner01Y: heightfield.cornerYAt(wx, wyNext) + rise,
  corner11Y: heightfield.cornerYAt(wxNext, wyNext) + rise
});
