import { Object3D, type InstancedMesh } from "three";

// Per-frame world-matrix update for the 3D map scene that only walks VISIBLE
// subtrees. three.js's own scene.updateMatrixWorld() (run inside every
// renderer.render()) recurses into every object regardless of `visible`. The
// map keeps large hidden pools parented to the scene -- 358 cloned marine
// rigs, survey-line and pylon pools -- so a staging session measured 17,441
// objects walked per frame for 850 visible ones, ~3ms/frame and the single
// largest self-time in a DevTools trace of a "page unresponsive" tab.
//
// Hidden subtrees are skipped, but if their parent's world matrix changed
// this frame they are flagged matrixWorldNeedsUpdate, so the frame they are
// shown again recomputes them (and, through `force`, their descendants)
// exactly as three.js would have. Classes that override updateMatrixWorld
// (Camera, SkinnedMesh, audio) are handed to their own implementation so
// their extra bookkeeping still runs.

const baseUpdateMatrixWorld = Object3D.prototype.updateMatrixWorld;

/**
 * Updates world matrices of `object` and its visible descendants, mirroring
 * Object3D.updateMatrixWorld. Visible InstancedMeshes with zero instances are
 * pushed onto `emptyInstanced` so the caller can hide them for the render
 * without a second traversal.
 */
export const updateVisibleMatrixWorld = (object: Object3D, force: boolean, emptyInstanced: Object3D[]): void => {
  if (object.updateMatrixWorld !== baseUpdateMatrixWorld) {
    object.updateMatrixWorld(force);
    return;
  }
  const mesh = object as InstancedMesh;
  if (mesh.isInstancedMesh && mesh.count === 0) emptyInstanced.push(object);
  if (object.matrixAutoUpdate) object.updateMatrix();
  if (object.matrixWorldNeedsUpdate || force) {
    if (object.matrixWorldAutoUpdate) {
      if (object.parent === null) object.matrixWorld.copy(object.matrix);
      else object.matrixWorld.multiplyMatrices(object.parent.matrixWorld, object.matrix);
    }
    object.matrixWorldNeedsUpdate = false;
    force = true;
  }
  const children = object.children;
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i]!;
    if (child.visible) updateVisibleMatrixWorld(child, force, emptyInstanced);
    else if (force) child.matrixWorldNeedsUpdate = true;
  }
};
