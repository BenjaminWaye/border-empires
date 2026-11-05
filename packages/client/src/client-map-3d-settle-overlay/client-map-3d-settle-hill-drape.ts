// Hill-tile geometry for the 3D settle overlay (client-map-3d-settle-
// overlay.ts): the draped tint grid's dimensions and the dome-surface sampler
// that the drape, frame and wandering people all stand on.
import { hillShapeHeight, type HillBumpCluster, type RoadCutDirections } from "../client-map-3d-hill-shape.js";
import { HEIGHTFIELD_HILLS_ELEVATION_BONUS } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";

export const HILL_SUBDIV = 10; // was 6 -- must match the dome's own SUBDIV (client-map-3d-hills.ts) or this coarser grid dips below it between sample points, showing water/fog through as a light-blue sliver
export const HILL_VERTS_PER_TILE = (HILL_SUBDIV + 1) * (HILL_SUBDIV + 1);
export const HILL_INDICES_PER_TILE = HILL_SUBDIV * HILL_SUBDIV * 6;
const HILL_DRAPE_CLEARANCE = 0.012;
// The hill drape re-samples only when its fill moves by a step this size, so a
// tile parked at 100% (awaiting server confirm) costs nothing per frame.
export const HILL_FILL_STEPS = 200;

// Hill tiles carry their 4 flat-ground corner heights so the frame
// perimeter and wandering people can each sample the dome's actual height
// at their own (fx, fz) position, instead of sitting at one fixed peak
// height. A single fixed height only matches the dome at its exact center
// (r=0); anywhere else on the tile — like the frame's edges, or a person
// who has wandered away from the middle — the real dome surface is lower,
// so a fixed-height placement floats above it, worst at the tile's rim
// where the dome has already fallen back to ground level.
export type HillCorners = {
  readonly corner00Y: number;
  readonly corner10Y: number;
  readonly corner01Y: number;
  readonly corner11Y: number;
  readonly bumps: HillBumpCluster;
  // Scene-space tile extents, so tick() can re-drape the sweeping fill.
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
  // Road / AFC-pad cut through the dome (hillRoadCutMask), so the drape follows the same carved surface.
  readonly hillCut?: RoadCutDirections | undefined;
};

// Height of the draped dome surface at fractional tile position (fx, fz),
// each in [0, 1] — same bilinear-corner + bump-cluster formula (wx/wy pick
// the tile's cluster) used to build hillTintMesh's vertices, so anything
// placed with this stays flush with the visible tinted surface.
export const hillSurfaceYAt = (hill: HillCorners, fx: number, fz: number, wx: number, wy: number): number => {
  const top = hill.corner00Y + (hill.corner10Y - hill.corner00Y) * fx;
  const bottom = hill.corner01Y + (hill.corner11Y - hill.corner01Y) * fx;
  const groundY = top + (bottom - top) * fz;
  const u = fx - 0.5;
  const v = fz - 0.5;
  return groundY + HEIGHTFIELD_HILLS_ELEVATION_BONUS * hillShapeHeight(u, v, hill.bumps, wx, wy, hill.hillCut) + HILL_DRAPE_CLEARANCE;
};
