import { Scene } from "three";
import { HARBOUR_FACINGS, rotationForFacing, type Facing } from "../client-harbour-slipways/client-harbour-slipways.js";
import { createDockOverlay, type DockOverlay } from "../client-map-3d-dock-overlay.js";
import { projectedHalfExtent, projectMeshesToSvg } from "../client-structure-info-catalog/mesh-projection-svg.js";
import { DOCK_SPRITE_FILES, DOCK_SPRITE_SCALE, dockSpriteIndex } from "./dock-sprite-frame.js";

// The 2D canvas map's dock sprites are flat projections of the production 3D
// quay, one per facing, so the two renderers show the same harbour turned the
// same way (framing: dock-sprite-frame.ts). Written by
// scripts/generate-dock-overlay-icons.mjs; the regression test keeps them in sync.

/** One sprite per facing the 2D map picks from (by harbourFacingAt, as the 3D quay is turned). */
export const DOCK_OVERLAY_SVG_VARIANTS: readonly { readonly filename: string; readonly facing: Facing }[] =
  HARBOUR_FACINGS.map((facing) => ({ filename: DOCK_SPRITE_FILES[dockSpriteIndex(facing)]!, facing }));

// Faces under this many square SVG units vanish at map scale (the sprite is drawn about a tile wide).
const DOCK_SVG_MIN_FACE_AREA = 0.25;

const withQuay = <T>(facing: Facing, use: (overlay: DockOverlay) => T): T => {
  const overlay = createDockOverlay(new Scene(), 1);
  overlay.addInstance(0, 0, 0, rotationForFacing(facing), 0, 0);
  overlay.commit();
  try {
    return use(overlay);
  } finally {
    overlay.dispose();
  }
};

/** The largest scale at which every facing's quay fits the 128-unit sprite about its centre (DOCK_SPRITE_SCALE is this, rounded down). */
export const dockSpriteFitScale = (): number =>
  64 / Math.max(...HARBOUR_FACINGS.map((facing) => withQuay(facing, (overlay) => projectedHalfExtent(overlay.group))));

export const dockOverlaySvg = (facing: Facing): string =>
  withQuay(facing, (overlay) => projectMeshesToSvg(overlay.group, "Dock", { minFaceArea: DOCK_SVG_MIN_FACE_AREA, scale: DOCK_SPRITE_SCALE }));
