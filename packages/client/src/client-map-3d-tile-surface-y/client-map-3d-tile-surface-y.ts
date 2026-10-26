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

export type HillFootprintTopInputs = {
  readonly cornerYAt: (cornerX: number, cornerZ: number) => number;
  readonly wx: number;
  readonly wy: number;
  readonly wxNext: number;
  readonly wyNext: number;
  readonly rise: number;
  // Half-width (tiles) of the square, tile-centred footprint the prop covers.
  readonly halfExtent: number;
  readonly isHillsAt: (x: number, y: number) => boolean;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly hillCut: RoadCutDirections | undefined;
};

// For a flush, tile-centred prop with sunk walls (a support-plot hatch): the
// highest point of the *rendered* surface under its footprint, so on a hill
// its rim sits on the dome and its walls drop into it instead of the whole
// prop being buried under the dome at ground level. Off hills this is the
// usual max-of-corners height. `hillCut` must be the same road/AFC-pad cut
// the dome mesh was built with, so a plot on a graded road cut stays flush.
// 5x5: the dome's small peaks are narrow enough to slip between a 3x3 grid.
const FOOTPRINT_SAMPLES = [-1, -0.5, 0, 0.5, 1] as const;
export const hillFootprintTopY = (inputs: HillFootprintTopInputs): number => {
  const { cornerYAt, wx, wy, wxNext, wyNext, halfExtent } = inputs;
  const c00 = cornerYAt(wx, wy);
  const c10 = cornerYAt(wxNext, wy);
  const c01 = cornerYAt(wx, wyNext);
  const c11 = cornerYAt(wxNext, wyNext);
  let top = Math.max(c00, c10, c01, c11);
  if (inputs.isHillsAt(wx, wy)) {
    const bumps = hillBumpsWithCorridorAt(wx, wy, hillNeighborFlagsAt(wx, wy, inputs.isHillsAt, inputs.wrapX, inputs.wrapY));
    for (const sv of FOOTPRINT_SAMPLES) {
      for (const su of FOOTPRINT_SAMPLES) {
        const u = su * halfExtent;
        const v = sv * halfExtent;
        // Same bilinear-corner ground + dome bump as client-map-3d-hills.ts.
        const fx = u + 0.5;
        const fz = v + 0.5;
        const ground = (c00 + (c10 - c00) * fx) * (1 - fz) + (c01 + (c11 - c01) * fx) * fz;
        const y = ground + HEIGHTFIELD_HILLS_ELEVATION_BONUS * hillShapeHeight(u, v, bumps, wx, wy, inputs.hillCut);
        if (y > top) top = y;
      }
    }
  }
  return top + inputs.rise;
};
