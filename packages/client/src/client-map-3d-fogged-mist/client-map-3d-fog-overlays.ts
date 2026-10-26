// The remembered-land overlays drawn under the fogged mist, split out of
// client-map-3d.ts (far past the file-length limit). Fogged tiles get a
// slate wash quad (normal blend at FOGGED_WASH_OPACITY, regardless of
// frontier/settled -- reuses both mesh buckets identically) plus a separate,
// dimmer ownership tint of the last-witnessed owner. Kept as distinct overlay
// instances from the live ownership overlay so the live SETTLED_OPACITY
// (0.85) constant is never touched. The owner tint is an explicit multiply
// blend -- alpha blend read washed-out.
import type { Scene } from "three";
import { createOwnershipOverlay, type OwnershipOverlay } from "../client-map-3d-ownership-overlay.js";
import { FOG_OVERLAY_RENDER_ORDERS } from "../client-map-3d-render-order.js";
import { FOGGED_WASH_OPACITY } from "../client-unexplored-storm/client-unexplored-storm-palette.js";
import type { ShoreFringe } from "../client-map-3d-shore/client-map-3d-shore-sand.js";
import { applyFoggedEdgeClipToOverlay, type FoggedEdgeUniforms } from "./client-map-3d-fogged-edge-clip.js";

export type FogOverlays = {
  /** Slate wash: remembered land dimmed and desaturated under the fogged mist. */
  readonly fogDarkenOverlay: OwnershipOverlay;
  /** The last-witnessed owner's tint on remembered land. */
  readonly fogOwnershipOverlay: OwnershipOverlay;
  /** Carries both out over the beach fringe, evenly (no waterline fade). */
  readonly extendOntoShore: (fringe: ShoreFringe) => void;
};

export const createFogOverlays = (scene: Scene, maxTiles: number, edgeUniforms: FoggedEdgeUniforms): FogOverlays => {
  const fogDarkenOverlay = createOwnershipOverlay(scene, maxTiles, { settled: FOGGED_WASH_OPACITY, frontier: FOGGED_WASH_OPACITY }, undefined, { settled: "normal", frontier: "normal" }, FOG_OVERLAY_RENDER_ORDERS);
  const fogOwnershipOverlay = createOwnershipOverlay(scene, maxTiles, { settled: 0.4, frontier: 0.12 }, undefined, { settled: "multiply", frontier: "multiply" }, FOG_OVERLAY_RENDER_ORDERS);
  // Both end on the fogged mist's organic edge just past the tiles in sight, not on a square tile edge.
  applyFoggedEdgeClipToOverlay(fogDarkenOverlay, edgeUniforms, "alpha");
  applyFoggedEdgeClipToOverlay(fogOwnershipOverlay, edgeUniforms, "multiply");
  const extendOntoShore = (fringe: ShoreFringe): void => {
    fogDarkenOverlay.extendOntoShore(fringe);
    fogOwnershipOverlay.extendOntoShore(fringe);
  };
  return { fogDarkenOverlay, fogOwnershipOverlay, extendOntoShore };
};
