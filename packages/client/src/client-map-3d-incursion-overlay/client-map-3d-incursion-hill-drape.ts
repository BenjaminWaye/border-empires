// Hill-tile height lookup for the incursion hatch (client-map-3d-incursion-overlay.ts).
// A hill's dome is a separate mesh on top of the flat heightfield
// (client-map-3d-hills.ts), and its bumps rise well above the tile-centre
// height the flat hatch quad used, so they broke through the hatch. Tracing
// the same ground + dome curve lets the hatch and its edge strips drape over
// the hill the way the ownership fill does (client-map-3d-ownership-overlay.ts).
import { HEIGHTFIELD_HILLS_ELEVATION_BONUS } from "../client-map-3d-heightfield-terrain.js";
import { hillBumpsWithCorridorAt, hillNeighborFlagsAt, hillShapeHeight, type RoadCutDirections } from "../client-map-3d-hill-shape.js";
import type { IncursionEdges } from "../client-reach-incursion/client-reach-incursion.js";

/** Rendered surface height at a point of one tile; fx/fz run 0..1 from the tile's (wx, wy) corner. */
export type TileDrapeHeightAt = (fx: number, fz: number) => number;

export type IncursionHillDrapeDeps = {
  readonly cornerYAt: (cornerX: number, cornerZ: number) => number;
  readonly isHillsAt: (x: number, y: number) => boolean;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  /** The same road/AFC-pad cut the dome mesh was built with, so the drape follows a graded cut. */
  readonly hillCutAt: (x: number, y: number) => RoadCutDirections | undefined;
  readonly rise: number;
};

// Small clearance above the dome so the hatch never z-fights the terrain (ownership's HILL_DRAPE_CLEARANCE).
const HILL_DRAPE_CLEARANCE = 0.012;

/** Undefined off hills, where the flat hatch quad already sits on the ground. */
export const createIncursionHillDrape =
  (deps: IncursionHillDrapeDeps) =>
  (wx: number, wy: number): TileDrapeHeightAt | undefined => {
    if (!deps.isHillsAt(wx, wy)) return undefined;
    const wxNext = deps.wrapX(wx + 1);
    const wyNext = deps.wrapY(wy + 1);
    const c00 = deps.cornerYAt(wx, wy);
    const c10 = deps.cornerYAt(wxNext, wy);
    const c01 = deps.cornerYAt(wx, wyNext);
    const c11 = deps.cornerYAt(wxNext, wyNext);
    const bumps = hillBumpsWithCorridorAt(wx, wy, hillNeighborFlagsAt(wx, wy, deps.isHillsAt, deps.wrapX, deps.wrapY));
    const cut = deps.hillCutAt(wx, wy);
    const lift = deps.rise + HILL_DRAPE_CLEARANCE;
    return (fx, fz) => {
      // Same bilinear-corner ground + dome bump as client-map-3d-hills.ts.
      const ground = (c00 + (c10 - c00) * fx) * (1 - fz) + (c01 + (c11 - c01) * fx) * fz;
      return ground + HEIGHTFIELD_HILLS_ELEVATION_BONUS * hillShapeHeight(fx - 0.5, fz - 0.5, bumps, wx, wy, cut) + lift;
    };
  };

// Matches the dome mesh's SUBDIV (client-map-3d-hills.ts): the border is sampled at its grid points.
const BORDER_SAMPLES = 10;

/**
 * Highest point of a draped tile's border along `sides` (all four when none
 * is set). The breach front line (spikes, veil) is flat and straddles the tile
 * edge, so seating it on its own sides' border keeps a corridor ridge running
 * into a neighbouring hill from burying it, while on a plain edge it lies on
 * the draped hatch instead of hanging at the dome's centre height.
 */
export const tileBorderTopY = (drape: TileDrapeHeightAt, sides: IncursionEdges): number => {
  const any = sides.north || sides.east || sides.south || sides.west;
  let top = -Infinity;
  for (let i = 0; i <= BORDER_SAMPLES; i += 1) {
    const f = i / BORDER_SAMPLES;
    if (!any || sides.north) top = Math.max(top, drape(f, 0));
    if (!any || sides.south) top = Math.max(top, drape(f, 1));
    if (!any || sides.west) top = Math.max(top, drape(0, f));
    if (!any || sides.east) top = Math.max(top, drape(1, f));
  }
  return top;
};
