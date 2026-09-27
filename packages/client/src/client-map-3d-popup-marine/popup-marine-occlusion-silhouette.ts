// Keeps every battle marine readable no matter what it stands in or behind.
//
// Marines are placed at the tile's terrain height, but tiles carry opaque
// models of their own — the farm plot (farmland.glb), structures, forests,
// deposits — each with its own height, and a hill can sit between the camera
// and a fight. Any of those used to swallow the squad outright (a fight on a
// farm played out entirely inside the crop beds). Rather than lifting marines
// per ground-cover model, which silently breaks again whenever a new or
// taller model lands, each marine carries an x-ray silhouette: a second
// SkinnedMesh sharing its geometry and skeleton, drawn in flat team colour
// with depthFunc GreaterDepth, so it only lands on pixels where something
// nearer than the marine has already been drawn.
//
// Ordering is what makes this work. The silhouette is opaque with
// MARINE_SILHOUETTE_RENDER_ORDER, so it draws after the world's opaque
// geometry (default renderOrder 0 up to the ~36 used by other unit
// overlays) but BEFORE the marine body itself (MARINE_RENDER_ORDER). It
// doesn't write depth, so the body then paints normally over every visible
// part — the silhouette survives only where the body is truly hidden, and a
// marine's own limbs never tint its torso.
import { GreaterDepth, MeshBasicMaterial, SkinnedMesh } from "three";

export const MARINE_RENDER_ORDER = 37;
export const MARINE_SILHOUETTE_RENDER_ORDER = MARINE_RENDER_ORDER - 0.5;
export const MARINE_SILHOUETTE_NAME = "marine-occlusion-silhouette";

/** Attaches the occluded-only silhouette to a (cloned) marine body and returns
 * its material, whose colour the caller keeps in step with the team tint. */
export const attachOcclusionSilhouette = (body: SkinnedMesh): MeshBasicMaterial => {
  const material = new MeshBasicMaterial({
    toneMapped: false,
    color: "#ffffff",
    depthFunc: GreaterDepth,
    depthWrite: false,
    fog: false
  });
  const silhouette = new SkinnedMesh(body.geometry, material);
  silhouette.name = MARINE_SILHOUETTE_NAME;
  // Child of the body with an identity transform, so it shares the body's
  // matrixWorld and, bound to the same skeleton, deforms identically.
  silhouette.bind(body.skeleton, body.bindMatrix);
  silhouette.bindMode = body.bindMode;
  silhouette.frustumCulled = false;
  silhouette.renderOrder = MARINE_SILHOUETTE_RENDER_ORDER;
  body.add(silhouette);
  return material;
};
