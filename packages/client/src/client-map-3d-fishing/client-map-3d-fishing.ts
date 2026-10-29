import { Box3, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import type { Material, Scene, Texture } from "three";
import { createFishingFoundation } from "./fishing-foundation.js";
import { fishingLayerMaterial, loadFishingLayers } from "./fishing-model-layers.js";
export { FISHING_MODEL_URL } from "./fishing-model-layers.js";

// Longest footprint side of the placed model, in tile units (a tile is 1
// wide), leaving a small margin so neighbouring sites don't touch.
export const FISHING_FOOTPRINT = 0.86;

/** Matrix that centres a model's footprint on the tile origin, rests its
 * lowest point on y = 0 and scales the longer footprint side to
 * FISHING_FOOTPRINT. */
export const fishingModelFitMatrix = (bounds: Box3): Matrix4 => {
  const size = bounds.getSize(new Vector3());
  const scale = FISHING_FOOTPRINT / Math.max(size.x, size.z, 1e-6);
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerZ = (bounds.min.z + bounds.max.z) / 2;
  return new Matrix4()
    .makeScale(scale, scale, scale)
    .multiply(new Matrix4().makeTranslation(-centerX, -bounds.min.y, -centerZ));
};

export { fishingWaterDirection, fishingYawFor } from "../client-food-tile-placement.js";
import { fishingSiteOffset, fishingYawFor, type WaterDirection } from "../client-food-tile-placement.js";
export type FishingOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number, water?: WaterDirection) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type Placement = { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly depth: number };

/** Four bounded instanced layers: body, metal, water and clean gray foundation.
 * The whole site moves 0.132 tiles toward adjacent water, preserving its layout. */
export const createFishingOverlay = (scene: Scene, maxTiles: number, envMap?: Texture,
  cornerYAt?: (wx: number, wy: number) => number): FishingOverlay => {
  const placements: Placement[] = [];
  const meshes: InstancedMesh[] = [];
  let disposed = false;
  const foundation = createFishingFoundation([0, 0, 0, 0], { inset: 0.132, lift: 1 });
  foundation.geometry.translate(-0.5, -1, -0.5);
  const apron = new InstancedMesh(foundation.geometry, new MeshStandardMaterial({ color: "#858880", roughness: 0.94 }), maxTiles);
  apron.name = "fishing-clean-apron";
  apron.count = 0; apron.frustumCulled = false; apron.receiveShadow = true;
  scene.add(apron);
  const matrix = new Matrix4(), quaternion = new Quaternion(), position = new Vector3(), scale = new Vector3(1, 1, 1), euler = new Euler();
  const apply = (): void => {
    const count = placements.length;
    for (let i = 0; i < count; i++) {
      const p = placements[i]!;
      quaternion.setFromEuler(euler.set(0, p.yaw, 0));
      position.set(p.x, p.y, p.z);
      matrix.compose(position, quaternion, scale.set(1, 1, 1));
      for (const mesh of meshes) mesh.setMatrixAt(i, matrix);
      matrix.compose(position, quaternion, scale.set(1, p.depth / 1.006, 1));
      apron.setMatrixAt(i, matrix);
    }
    for (const mesh of [...meshes, apron]) {
      mesh.count = count;
      mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, count * 16); mesh.instanceMatrix.needsUpdate = true;
    }
  };
  void loadFishingLayers().then(layers => {
    if (disposed) return;
    for (const { layer, geometry } of layers) {
      const mesh = new InstancedMesh(geometry, fishingLayerMaterial(layer, envMap), maxTiles);
      mesh.name = `fishing-${layer}`; mesh.frustumCulled = false; mesh.count = 0;
      mesh.castShadow = mesh.receiveShadow = true;
      meshes.push(mesh); scene.add(mesh);
    }
    apply();
  }, (err: unknown) => { console.error("fishing model failed to load", err); });
  return {
    clear: () => { placements.length = 0; },
    addInstance: (sceneX, sceneZ, surfaceY, worldTileX, worldTileY, water) => {
      if (placements.length >= maxTiles) return;
      const yaw = fishingYawFor(water, worldTileX, worldTileY);
      const offset = fishingSiteOffset(water);
      const bottom = cornerYAt ? Math.min(cornerYAt(worldTileX, worldTileY), cornerYAt(worldTileX + 1, worldTileY),
        cornerYAt(worldTileX, worldTileY + 1), cornerYAt(worldTileX + 1, worldTileY + 1)) : surfaceY - 0.025;
      placements.push({ x: sceneX + (water?.dx ?? 0) * offset, y: surfaceY + 0.003,
        z: sceneZ + (water?.dy ?? 0) * offset, yaw, depth: Math.max(0.028, surfaceY + 0.009 - bottom) });
    },
    commit: apply,
    dispose: () => {
      disposed = true;
      for (const mesh of [...meshes, apron]) {
        scene.remove(mesh); (mesh.material as Material).dispose(); mesh.dispose();
      }
      foundation.geometry.dispose(); placements.length = 0;
    }
  };
};
