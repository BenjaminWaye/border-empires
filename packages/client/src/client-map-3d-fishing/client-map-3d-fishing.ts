// Fishing site drawn on every FISH resource tile in the 3D renderer.
// Replaces the earlier procedural boat + drying-rack boxes.
//
// Source: fishing2.glb — a low-poly fishing scene (boats, a hut, a drying
// rack, a flag pole) authored in Blender: flat-colour materials, no
// textures. Its grey ground plate was cut out of the file so the terrain
// (water or shore) shows underneath; only the props are drawn.
//
// At load every mesh is baked into ONE geometry (see loadMergedGlbGeometry)
// so all fishing tiles draw as a single InstancedMesh. The authored model is
// off-centre and larger than a tile, so it is recentred on the tile, sat on
// the surface and scaled down to fit.
import { Box3, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import type { BufferGeometry, Material, Scene, Texture } from "three";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { farmlandYawAt } from "../client-map-3d-farmland/client-map-3d-farmland.js";
import { loadMergedGlbGeometry } from "../client-map-3d-merged-glb/client-map-3d-merged-glb.js";

export const FISHING_MODEL_URL = "/models/fishing2.glb";

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

// Scene axes: world +x is scene +x, world +y is scene +z. The authored model
// has its boats and nets on local +x (its water side) and the hut, planks and
// rack on local -x (its land side).
export type WaterDirection = { readonly dx: number; readonly dy: number };

const CARDINALS: ReadonlyArray<WaterDirection> = [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 }];
const DIAGONALS: ReadonlyArray<WaterDirection> = [{ dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }, { dx: 1, dy: -1 }];

/** The direction from world tile (wx, wy) towards water: an edge-adjacent
 * water tile if any, else a corner-adjacent one, else undefined. When
 * several qualify the choice is stable per tile, so a site doesn't spin as
 * the camera pans. */
export const fishingWaterDirection = (isWaterAt: (wx: number, wy: number) => boolean, wx: number, wy: number): WaterDirection | undefined => {
  for (const group of [CARDINALS, DIAGONALS]) {
    const wet = group.filter((d) => isWaterAt(wx + d.dx, wy + d.dy));
    if (wet.length > 0) return wet[Math.floor((farmlandYawAt(wx, wy) / (Math.PI / 2)) % wet.length)];
  }
  return undefined;
};

/** Yaw that turns the model's water side (local +x) towards `water`; with no
 * water nearby, falls back to a random quarter turn stable per tile. */
export const fishingYawFor = (water: WaterDirection | undefined, wx: number, wy: number): number =>
  water ? Math.atan2(-water.dy, water.dx) : farmlandYawAt(wx, wy);

export type FishingOverlay = {
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number, worldTileX: number, worldTileY: number, water?: WaterDirection) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type Placement = { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number };

let cached: Promise<BufferGeometry> | undefined;

/** Loads (and caches) the fitted fishing geometry once per page load. The
 * geometry is shared, so overlays must not dispose it. */
export const loadFishing = (): Promise<BufferGeometry> => {
  if (!cached) {
    cached = loadMergedGlbGeometry(FISHING_MODEL_URL).then((geometry) => {
      geometry.computeBoundingBox();
      geometry.applyMatrix4(fishingModelFitMatrix(geometry.boundingBox as Box3));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return geometry;
    });
  }
  return cached;
};

export const createFishingOverlay = (scene: Scene, maxTiles: number, envMap?: Texture): FishingOverlay => {
  let placements: Placement[] = [];
  let mesh: InstancedMesh | undefined;
  let disposed = false;

  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3(1, 1, 1);
  const euler = new Euler();

  const apply = (): void => {
    if (!mesh) return;
    const count = Math.min(placements.length, maxTiles);
    for (let i = 0; i < count; i += 1) {
      const p = placements[i]!;
      quaternion.setFromEuler(euler.set(0, p.yaw, 0));
      position.set(p.x, p.y, p.z);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(i, matrix);
    }
    mesh.count = count;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  };

  void loadFishing().then((geometry) => {
    if (disposed) return;
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true });
    applyBuildingEnvMap(material, envMap);
    mesh = new InstancedMesh(geometry, material, maxTiles);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    apply();
  }, (err: unknown) => {
    // A missing asset must not take down the map; the tile just has no site.
    console.error("fishing model failed to load", err);
  });

  return {
    clear: () => { placements = []; },
    addInstance: (sceneX, sceneZ, surfaceY, worldTileX, worldTileY, water) => {
      placements.push({ x: sceneX, y: surfaceY, z: sceneZ, yaw: fishingYawFor(water, worldTileX, worldTileY) });
    },
    commit: apply,
    dispose: () => {
      disposed = true;
      if (!mesh) return;
      scene.remove(mesh);
      (mesh.material as Material).dispose();
      mesh.dispose();
      mesh = undefined;
    }
  };
};
