// Where a captured dock burns on the 2D map: the 3D fire's anchors
// (client-wreck-models/dock-fire-model.ts, in the quay's frame) placed on the
// dock sprite turned toward the dock's water (client-map-3d-harbour/dock-sprite-frame.ts),
// so both renderers set the same buildings alight.
import type { Facing } from "../client-harbour-slipways/client-harbour-slipways.js";
import { dockSpritePoint } from "../client-map-3d-harbour/dock-sprite-frame.js";

type Anchor = readonly [x: number, y: number, z: number, size: number];

// Control office roof and window, the containers, the crane's power cell, the pier and the moored carrier.
const FLAME_ANCHORS: readonly Anchor[] = [
  [-0.27, 0.33, -0.24, 0.065], [-0.32, 0.2, -0.117, 0.04], [0, 0.2, -0.03, 0.06],
  [0.36, 0.25, -0.18, 0.045], [0.08, 0.09, 0.38, 0.05], [-0.19, 0.13, 0.37, 0.055]
];
const SMOKE_ANCHORS: readonly Anchor[] = [[-0.24, 0.34, -0.24, 1.25], [-0.19, 0.15, 0.37, 0.9]];
const SCORCH_ANCHOR: Anchor = [0, 0.085, -0.1, 0.3];

/** [x, y, size] as fractions of the tile (x, y from its top-left). */
export type DockFireSpot = readonly [number, number, number];

const place = (facing: Facing, [x, y, z, size]: Anchor): DockFireSpot => {
  const [fx, fy] = dockSpritePoint(facing, [x, y, z]);
  return [fx, fy, size];
};

export const dockFireLayout2D = (facing: Facing): { readonly flames: readonly DockFireSpot[]; readonly smoke: readonly DockFireSpot[]; readonly scorch: DockFireSpot } => ({
  flames: FLAME_ANCHORS.map((anchor) => place(facing, anchor)),
  smoke: SMOKE_ANCHORS.map((anchor) => place(facing, anchor)),
  scorch: place(facing, SCORCH_ANCHOR)
});
