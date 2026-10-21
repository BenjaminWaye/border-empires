import type { InstancedMesh } from "three";

// Per-instance colour for the natural-terrain instanced meshes (forests,
// palms, mountain massifs), multiplied into their material colour. Each
// layer writes its own colours (per-tree/per-peak shade, times the slate
// FOGGED_FEATURE_TINT on remembered tiles) with setColorAt; this flags the
// written range for upload.

/** Flags the written range of a mesh's instance colours for upload (after its count is set). */
export const commitInstanceTint = (mesh: InstancedMesh): void => {
  if (!mesh.instanceColor) return;
  mesh.instanceColor.clearUpdateRanges();
  mesh.instanceColor.addUpdateRange(0, mesh.count * 3);
  mesh.instanceColor.needsUpdate = true;
};
