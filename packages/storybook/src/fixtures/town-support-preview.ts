import { supportRingRadiusForTier } from "@border-empires/shared";
import type { Scene } from "three";
import type { TownTier } from "../../../client/src/client-map-3d-town-overlay.js";
import { createTownSupportTileOverlay, type TownSupportTileOverlay } from "../../../client/src/client-map-3d-town-support-tile/client-map-3d-town-support-tile.js";
import { PLOT_VERTICES } from "../../../client/src/client-town-support-plot/plot-style.js";

export const supportPreviewOffsets = (tier: TownTier): readonly (readonly [number, number])[] => {
  if (tier === "SETTLEMENT") return [];
  const radius = supportRingRadiusForTier(tier);
  const offsets: [number, number][] = [];
  for (let y = -radius; y <= radius; y += 1) for (let x = -radius; x <= radius; x += 1) {
    if (x !== 0 || y !== 0) offsets.push([x, y]);
  }
  return offsets;
};

// Preview the shipped corner-marker geometry on the fixture's flat grass.
// A hover affects a single plot, rather than lighting the entire ring.
export const createTownSupportPreview = (
  scene: Scene, offsets: readonly (readonly [number, number])[], highlighted: boolean
): TownSupportTileOverlay => {
  const overlay = createTownSupportTileOverlay(scene, 24);
  const heights = Float32Array.from(PLOT_VERTICES, () => 0.012);
  offsets.forEach(([x, z], i) => overlay.addInstance(x, z, heights, highlighted && i === 0));
  overlay.commit();
  return overlay;
};
