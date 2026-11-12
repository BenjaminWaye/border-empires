import { Scene } from "three";
import { createDockOverlay } from "../client-map-3d-dock-overlay.js";
import { projectMeshesToSvg } from "../client-structure-info-catalog/mesh-projection-svg.js";

// The 2D canvas map's dock sprites (public/overlays/dock-overlay-N.svg, see
// client-map-render/client-map-overlay-images.ts) are flat projections of the
// production 3D quay, so the two renderers show the same harbour. Written by
// scripts/generate-dock-overlay-icons.mjs; the regression test keeps them in sync.

/** Quay facing for each 2D variant: the 2D map does not know which side the water is on, so the variants simply turn the quay. */
export const DOCK_OVERLAY_SVG_VARIANTS: readonly { readonly filename: string; readonly rotationY: number }[] = [
  { filename: "dock-overlay-1.svg", rotationY: 0 },
  { filename: "dock-overlay-2.svg", rotationY: Math.PI / 2 },
  { filename: "dock-overlay-3.svg", rotationY: -Math.PI / 2 }
];

export const dockOverlaySvg = (rotationY: number): string => {
  const scene = new Scene();
  const overlay = createDockOverlay(scene, 1);
  overlay.addInstance(0, 0, 0, rotationY, 0, 0);
  overlay.commit();
  try {
    return projectMeshesToSvg(overlay.group, "Dock");
  } finally {
    overlay.dispose();
  }
};
