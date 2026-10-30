// The remembered-land overlays drawn under the fogged mist, split out of
// client-map-3d.ts (far past the file-length limit). Fogged tiles get a
// slate wash quad (normal blend at FOGGED_WASH_OPACITY, regardless of
// frontier/settled -- reuses both mesh buckets identically) plus a separate,
// dimmer ownership tint of the last-witnessed owner. Kept as distinct overlay
// instances from the live ownership overlay so the live SETTLED_OPACITY
// (0.85) constant is never touched. The owner tint is an explicit multiply
// blend -- alpha blend read washed-out.
// Where they drape a hill dome that rises out of the mist, they are drawn
// after the dome's own haze, so they take the mist themselves
// (client-map-3d-fogged-mist-haze.ts) -- otherwise the wash paints most of
// the haze back out and every remembered hill breaks the fog as a dark patch
// cut off at the sheet's height.
import type { Material, Scene } from "three";
import { createOwnershipOverlay, type OwnershipOverlay } from "../client-map-3d-ownership-overlay.js";
import { FOG_OVERLAY_RENDER_ORDERS } from "../client-map-3d-render-order.js";
import { FOGGED_WASH_OPACITY } from "../client-unexplored-storm/client-unexplored-storm-palette.js";
import type { ShoreFringe } from "../client-map-3d-shore/client-map-3d-shore-sand.js";
import { applyFoggedEdgeClipToOverlay, type FoggedEdgeUniforms } from "./client-map-3d-fogged-edge-clip.js";
import { applyFoggedMistHaze, type FoggedMistHazeMode, type FoggedMistHazeUniforms } from "./client-map-3d-fogged-mist-haze.js";

export type FogOverlays = {
  /** Slate wash: remembered land dimmed and desaturated under the fogged mist. */
  readonly fogDarkenOverlay: OwnershipOverlay;
  /** The last-witnessed owner's tint on remembered land. */
  readonly fogOwnershipOverlay: OwnershipOverlay;
  /** Carries both out over the beach fringe, evenly (no waterline fade). */
  readonly extendOntoShore: (fringe: ShoreFringe) => void;
};

// All four buckets: flat ones lie under the sheet, where the haze's own height gate skips them.
const applyFoggedMistHazeToOverlay = (overlay: OwnershipOverlay, uniforms: FoggedMistHazeUniforms, mode: FoggedMistHazeMode): void => {
  for (const mesh of [overlay.settledMesh, overlay.frontierMesh, overlay.settledHillMesh, overlay.frontierHillMesh]) {
    applyFoggedMistHaze(mesh.material as Material, uniforms, mode);
  }
};

export const createFogOverlays = (scene: Scene, maxTiles: number, edgeUniforms: FoggedEdgeUniforms, hazeUniforms: FoggedMistHazeUniforms): FogOverlays => {
  const fogDarkenOverlay = createOwnershipOverlay(scene, maxTiles, { settled: FOGGED_WASH_OPACITY, frontier: FOGGED_WASH_OPACITY }, undefined, { settled: "normal", frontier: "normal" }, FOG_OVERLAY_RENDER_ORDERS);
  const fogOwnershipOverlay = createOwnershipOverlay(scene, maxTiles, { settled: 0.4, frontier: 0.12 }, undefined, { settled: "multiply", frontier: "multiply" }, FOG_OVERLAY_RENDER_ORDERS);
  // Both end on the fogged mist's organic edge just past the tiles in sight, not on a square tile edge.
  applyFoggedEdgeClipToOverlay(fogDarkenOverlay, edgeUniforms, "alpha");
  applyFoggedEdgeClipToOverlay(fogOwnershipOverlay, edgeUniforms, "multiply");
  applyFoggedMistHazeToOverlay(fogDarkenOverlay, hazeUniforms, "normal");
  applyFoggedMistHazeToOverlay(fogOwnershipOverlay, hazeUniforms, "multiply");
  const extendOntoShore = (fringe: ShoreFringe): void => {
    fogDarkenOverlay.extendOntoShore(fringe);
    fogOwnershipOverlay.extendOntoShore(fringe);
  };
  return { fogDarkenOverlay, fogOwnershipOverlay, extendOntoShore };
};
