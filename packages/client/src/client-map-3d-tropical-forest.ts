// Tropical/jungle tree variant for tiles gated by isTropicalForestTileAt
// (equatorial-belt forest, see worldgen-latitude.ts) -- a distinct palm
// silhouette (tall curved trunk, crown of drooping fronds; model in
// client-map-3d-tree-models.ts) so the equatorial belt actually reads
// differently from the temperate pine/spruce forest instead of using the same
// tree everywhere. Mirrors createForest's InstancedMesh/layout/hash scheme
// (client-map-3d-forest.ts) rather than a shared abstraction, since the two
// only share the layout/hash constants, not the geometry or per-tile logic.
import { Color, InstancedMesh, Matrix4, Scene } from "three";
import { LAYOUTS, TREES_PER_TILE, tileHash } from "./client-map-3d-forest.js";
import { riverBankTreeFilter } from "./client-map-3d-rivers/client-map-3d-river-bank-trees.js";
import { commitInstanceTint } from "./client-map-3d-instance-tint.js";
import { createTreeMaterial, driveTreeWind } from "./client-map-3d-trees/client-map-3d-tree-material.js";
import { createPalmGeometry } from "./client-map-3d-trees/client-map-3d-tree-models.js";
import { composeTreeInstance, createTreePlacement } from "./client-map-3d-trees/client-map-3d-tree-variation.js";

export type TropicalForest = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number, tint?: Color) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createTropicalForest = (scene: Scene, maxTiles: number): TropicalForest => {
  // Sized like createForest's trees: roughly half a mountain massif's height.
  // Double-sided: fronds are open sheets, seen from below as they droop.
  const geometry = createPalmGeometry();
  const material = createTreeMaterial({ doubleSided: true });
  const maxInstances = maxTiles * TREES_PER_TILE;
  const mesh = new InstancedMesh(geometry, material, maxInstances);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  driveTreeWind(mesh);
  scene.add(mesh);

  const tempMatrix = new Matrix4();
  const tempColor = new Color();
  const placement = createTreePlacement();
  let count = 0;

  const clear = (): void => {
    count = 0;
  };

  const addInstance = (sceneX: number, sceneZ: number, surfaceY: number, worldX: number, worldZ: number, tint?: Color): void => {
    const layoutIdx = tileHash(worldX, worldZ, 7, LAYOUTS.length);
    const layout = LAYOUTS[layoutIdx]!;
    const inRiverBank = riverBankTreeFilter(worldX, worldZ);
    placement.y = surfaceY;
    placement.worldX = worldX;
    placement.worldZ = worldZ;
    placement.tint = tint;

    layout.forEach((tree, slot) => {
      if (count >= maxInstances) return;
      if (inRiverBank?.(tree.ox, tree.oz)) return;
      placement.x = sceneX + tree.ox;
      placement.z = sceneZ + tree.oz;
      placement.scale = tree.scale;
      placement.slot = slot;
      composeTreeInstance(placement, tempMatrix, tempColor);
      mesh.setMatrixAt(count, tempMatrix);
      mesh.setColorAt(count, tempColor);
      count += 1;
    });
  };

  const commit = (): void => {
    mesh.count = count;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    commitInstanceTint(mesh);
  };

  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  };

  return { clear, addInstance, commit, dispose };
};
