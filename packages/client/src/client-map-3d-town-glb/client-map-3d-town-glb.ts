// TOWN-tier model drawn through one InstancedMesh (one draw call however many
// towns are on screen). Source: town.glb — a Meshy-generated, textured
// low-poly steampunk town (~2.6k triangles, 1024px base-colour texture),
// normalised to ~1 x 0.92 x 1 units centred on the origin. Unlike the
// flat-colour farmland/fishing models it keeps its texture, so it is not run
// through loadMergedGlbGeometry. The glb loads asynchronously; until it lands
// `isReady` is false and the caller draws the procedural TOWN layout instead.
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import type { BufferGeometry, Material, Mesh, Scene } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const TOWN_MODEL_URL = "/models/town.glb";

// Footprint scale so the model sits inside the tile like the procedural town.
export const TOWN_MODEL_SCALE = 0.88;
// The model's lowest point is 0.4595 below its origin (before scaling); lifted
// so the footings rest on the terrain instead of sinking into it.
export const TOWN_MODEL_BASE_LIFT = 0.4595 * TOWN_MODEL_SCALE;

type LoadedTownModel = { readonly geometry: BufferGeometry; readonly material: Material };

let cached: Promise<LoadedTownModel> | undefined;

/** Loads (and caches) the town geometry + textured material. Shared by every
 * overlay, so overlays must not dispose either. */
export const loadTownModel = (): Promise<LoadedTownModel> => {
  if (!cached) {
    cached = new Promise<LoadedTownModel>((resolve, reject) => {
      new GLTFLoader().load(
        TOWN_MODEL_URL,
        (gltf) => {
          let found: Mesh | undefined;
          gltf.scene.traverse((node) => {
            const mesh = node as Mesh;
            if (!found && mesh.isMesh) found = mesh;
          });
          if (!found) {
            reject(new Error(`${TOWN_MODEL_URL} contains no mesh`));
            return;
          }
          const material = Array.isArray(found.material) ? found.material[0]! : found.material;
          resolve({ geometry: found.geometry, material });
        },
        undefined,
        (err) => reject(err instanceof Error ? err : new Error(String(err)))
      );
    });
  }
  return cached;
};

export type TownModelOverlay = {
  /** True once the glb has loaded; until then addInstance is a no-op. */
  readonly isReady: () => boolean;
  readonly clear: () => void;
  readonly addInstance: (sceneX: number, sceneZ: number, surfaceY: number) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createTownModelOverlay = (scene: Scene, maxTiles: number): TownModelOverlay => {
  let mesh: InstancedMesh | undefined;
  let count = 0;
  let disposed = false;

  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3(TOWN_MODEL_SCALE, TOWN_MODEL_SCALE, TOWN_MODEL_SCALE);

  void loadTownModel().then(({ geometry, material }) => {
    if (disposed) return;
    mesh = new InstancedMesh(geometry, material, maxTiles);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    scene.add(mesh);
  }, (err: unknown) => {
    // A missing asset must not take down the map; towns keep the procedural look.
    console.error("town model failed to load", err);
  });

  return {
    isReady: () => mesh !== undefined,
    clear: () => { count = 0; },
    addInstance: (sceneX, sceneZ, surfaceY) => {
      if (!mesh || count >= maxTiles) return;
      position.set(sceneX, surfaceY + TOWN_MODEL_BASE_LIFT, sceneZ);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(count, matrix);
      count += 1;
    },
    commit: () => {
      if (!mesh) return;
      mesh.count = count;
      mesh.instanceMatrix.clearUpdateRanges();
      if (count === 0) return;
      mesh.instanceMatrix.addUpdateRange(0, count * 16);
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      disposed = true;
      if (!mesh) return;
      scene.remove(mesh);
      mesh.dispose();
      mesh = undefined;
    }
  };
};
