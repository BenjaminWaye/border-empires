// Render-side glue for border-contact seams (see
// client-reach-overlay-border-contact.ts for the detection logic and
// client-map-3d-border-dust-fx.ts for the particle layer). Pulled out of
// client-map-3d.ts -- already well over the repo's 500-line file cap -- to
// keep that file's net line count from growing (AGENTS.md's file-line-limit
// gate: an oversized file may not increase in line count).
import type { TileCoord } from "../client-reach-overlay/client-reach-overlay.js";
import type { OwnedPylonPoint, OwnedPylonSegment } from "../client-reach-overlay-3d-multi/client-reach-overlay-3d-multi.js";
import {
  computeBorderContactPylons,
  computeBorderContactSegments,
  pointKey,
  splitSegmentByContact,
  type BorderContactSegment
} from "../client-reach-overlay-border-contact/client-reach-overlay-border-contact.js";
import type { BorderDustSeam } from "../client-map-3d-border-dust-fx/client-map-3d-border-dust-fx.js";

export type BorderContactRenderState = {
  readonly pylonKeys: ReadonlySet<string>;
  readonly seams: readonly BorderContactSegment[];
};

export const EMPTY_BORDER_CONTACT_STATE: BorderContactRenderState = { pylonKeys: new Set(), seams: [] };

// Single source of truth for the contact-seam color/opacity tuning, shared
// by client-map-3d.ts's real renderer and the storybook demo -- a duplicated
// literal in the story once drifted out of sync with the tuned value here.
// Near-white reads far brighter than a hue at equal alpha, so the multiplier
// needs to sit well below the owner lines' own opacity (0.8), not just
// under 1, or the "shared, fading beam" reads as "the strongest line on
// screen" instead.
export const BORDER_CONTACT_BEAM_COLOR = "#f5f0ff";
export const BORDER_CONTACT_OPACITY_MULT = 0.2;

// Re-exported so callers checking pylon membership (client-map-3d.ts) use
// the exact same key format this module used to build pylonKeys above,
// instead of a second hand-rolled copy that could silently drift out of
// sync. Segment rendering uses splitSegmentByContact -- a wall must be
// split into sub-pieces, not recolored wholesale, since a wall can run
// past its own overlap with a rival (see that function's doc comment).
export { pointKey, splitSegmentByContact };

export const computeBorderContactRenderState = (
  myOwnerId: string,
  myPylons: ReadonlyArray<TileCoord>,
  otherPylons: ReadonlyArray<OwnedPylonPoint>,
  mySegments: ReadonlyArray<{ from: TileCoord; to: TileCoord }>,
  otherSegments: ReadonlyArray<OwnedPylonSegment>
): BorderContactRenderState => {
  const seams = computeBorderContactSegments(myOwnerId, mySegments, otherSegments);
  return {
    seams,
    pylonKeys: new Set(computeBorderContactPylons(myOwnerId, myPylons, otherPylons, seams).map((p) => pointKey(p)))
  };
};

/** Pale/translucent blend at a contact point, otherwise the owner's own solid color -- see client-map-3d.ts's BORDER_CONTACT_* constants. */
export const resolveBorderContactVisual = (
  atContact: boolean,
  ownerColor: string,
  laserFraction: number,
  beamColor: string,
  opacityMult: number
): { color: string; laser: number } => (atContact ? { color: beamColor, laser: laserFraction * opacityMult } : { color: ownerColor, laser: laserFraction });

export const borderContactSeamsToDustSeams = (
  seams: readonly BorderContactSegment[],
  opts: {
    toroidDelta: (cam: number, value: number, size: number) => number;
    camX: number;
    camY: number;
    worldWidth: number;
    worldHeight: number;
    surfaceYForCorner: (x: number, y: number) => number;
    effectiveOverlayColor: (ownerId: string) => string;
  }
): BorderDustSeam[] =>
  seams.map((seam) => ({
    x0: opts.toroidDelta(opts.camX, seam.from.x, opts.worldWidth),
    y0: opts.surfaceYForCorner(seam.from.x, seam.from.y),
    z0: opts.toroidDelta(opts.camY, seam.from.y, opts.worldHeight),
    x1: opts.toroidDelta(opts.camX, seam.to.x, opts.worldWidth),
    y1: opts.surfaceYForCorner(seam.to.x, seam.to.y),
    z1: opts.toroidDelta(opts.camY, seam.to.y, opts.worldHeight),
    colorA: opts.effectiveOverlayColor(seam.ownerIdA),
    colorB: opts.effectiveOverlayColor(seam.ownerIdB)
  }));
