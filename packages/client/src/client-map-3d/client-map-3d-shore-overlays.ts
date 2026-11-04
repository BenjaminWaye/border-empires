import type { OwnershipOverlay } from "../client-map-3d-ownership-overlay.js";
import { OWNERSHIP_SHORE_EDGE_OPACITY } from "../client-map-3d-ownership-shore.js";
import type { ShoreFringe } from "../client-map-3d-shore/client-map-3d-shore-sand.js";
import type { ReachOverlay3D } from "../client-map-3d-aether-survey-line/client-map-3d-aether-survey-line.js";

/** Carries all land overlays over the same beach before water commits. */
export const extendMapShoreOverlays = (
  fringe: ShoreFringe,
  ownership: Pick<OwnershipOverlay, "extendOntoShore">,
  fog: { readonly extendOntoShore: (fringe: ShoreFringe) => void },
  reach: Pick<ReachOverlay3D, "extendIncursionOntoShore">
): void => {
  ownership.extendOntoShore(fringe, OWNERSHIP_SHORE_EDGE_OPACITY);
  fog.extendOntoShore(fringe);
  reach.extendIncursionOntoShore(fringe);
};
