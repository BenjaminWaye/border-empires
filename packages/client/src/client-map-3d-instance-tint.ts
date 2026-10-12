import { Color, type InstancedMesh } from "three";

// Optional per-instance colour for the natural-terrain instanced meshes
// (forests, palms, mountain massifs), multiplied into their material colour.
// Used to print remembered ("fogged") tiles' trees and peaks in the same
// sepia as their ground (FOGGED_PRINT_FEATURE_TINT). A mesh that has never
// been tinted gets no instanceColor buffer at all, so live-only scenes pay
// nothing; once one exists, untinted instances are written back to white.

const WHITE = new Color(1, 1, 1);

export const setInstanceTint = (mesh: InstancedMesh, index: number, tint: Color | undefined): void => {
  if (!tint && !mesh.instanceColor) return;
  mesh.setColorAt(index, tint ?? WHITE);
};

/** Flags the written range of a mesh's instance colours for upload (after its count is set). */
export const commitInstanceTint = (mesh: InstancedMesh): void => {
  if (!mesh.instanceColor) return;
  mesh.instanceColor.clearUpdateRanges();
  mesh.instanceColor.addUpdateRange(0, mesh.count * 3);
  mesh.instanceColor.needsUpdate = true;
};
