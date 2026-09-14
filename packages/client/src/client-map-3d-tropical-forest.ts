// Tropical/jungle tree variant for tiles gated by isTropicalForestTileAt
// (equatorial-belt forest, see worldgen-latitude.ts) -- a distinct palm-like
// silhouette (tall thin trunk, wide flat frond canopy) so the equatorial
// belt actually reads differently from the temperate pine/spruce forest
// instead of using the same tree everywhere. Mirrors createForest's
// InstancedMesh/layout/hash scheme (client-map-3d-forest.ts) rather than a
// shared abstraction, since the two only share the layout/hash constants,
// not the geometry or per-tile logic.
import {
  ConeGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Scene
} from "three";
import { LAYOUTS, TREES_PER_TILE, tileHash } from "./client-map-3d-forest.js";

export type TropicalForest = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createTropicalForest = (scene: Scene, maxTiles: number): TropicalForest => {
  // A very flat, wide cone reads as a palm's frond canopy at this scale
  // without needing individual leaf geometry.
  const canopyGeometry = new ConeGeometry(0.34, 0.22, 6, 1, false);
  const canopyMaterial = new MeshStandardMaterial({ color: "#4f9a4a", roughness: 0.85, metalness: 0, flatShading: true });

  const trunkGeometry = new CylinderGeometry(0.05, 0.09, 1.05, 6);
  const trunkMaterial = new MeshStandardMaterial({ color: "#8a6b45", roughness: 0.82, metalness: 0, flatShading: true });

  const maxInstances = maxTiles * TREES_PER_TILE;
  const canopyMesh = new InstancedMesh(canopyGeometry, canopyMaterial, maxInstances);
  const trunkMesh = new InstancedMesh(trunkGeometry, trunkMaterial, maxInstances);

  for (const mesh of [canopyMesh, trunkMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  scene.add(canopyMesh, trunkMesh);

  const tempMatrix = new Matrix4();
  const scaleMatrix = new Matrix4();
  let count = 0;

  const clear = (): void => {
    count = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number): void => {
    const layoutIdx = tileHash(worldX, worldZ, 7, LAYOUTS.length);
    const layout = LAYOUTS[layoutIdx]!;

    for (const tree of layout) {
      if (count >= maxInstances) continue;
      scaleMatrix.makeScale(tree.trunkScale, tree.trunkScale * 1.1, tree.trunkScale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(sceneX + tree.ox, surfaceY + tree.trunkY + 0.15, sceneZ + tree.oz);
      trunkMesh.setMatrixAt(count, tempMatrix);

      scaleMatrix.makeScale(tree.canopyScale, tree.canopyScale, tree.canopyScale);
      tempMatrix.copy(scaleMatrix);
      tempMatrix.setPosition(sceneX + tree.ox, surfaceY + tree.canopyY + 0.28, sceneZ + tree.oz);
      canopyMesh.setMatrixAt(count, tempMatrix);
      count += 1;
    }
  };

  const commit = (): void => {
    canopyMesh.count = count;
    trunkMesh.count = count;
    canopyMesh.instanceMatrix.clearUpdateRanges();
    canopyMesh.instanceMatrix.addUpdateRange(0, canopyMesh.count * 16);
    canopyMesh.instanceMatrix.needsUpdate = true;
    trunkMesh.instanceMatrix.clearUpdateRanges();
    trunkMesh.instanceMatrix.addUpdateRange(0, trunkMesh.count * 16);
    trunkMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(canopyMesh, trunkMesh);
    canopyGeometry.dispose();
    trunkGeometry.dispose();
    canopyMaterial.dispose();
    trunkMaterial.dispose();
  };

  return { clear, addInstance, commit, dispose };
};
