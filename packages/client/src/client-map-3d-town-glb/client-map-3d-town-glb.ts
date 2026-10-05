// Town / City / Great City / Metropolis models, one textured InstancedMesh per
// tier (one draw call each however many towns are on screen). Sources are
// Meshy-generated low-poly steampunk glbs with a 1024px base-colour texture.
// Unlike the flat-colour farmland/fishing models they keep their texture, so
// they are not run through loadMergedGlbGeometry. SETTLEMENT has no model and
// is always drawn procedurally.
//
// Every model is sized from its own bounding box: scaled so its longer ground
// side is TOWN_MODEL_FOOTPRINT tiles wide, centred on the tile, and lifted so
// its lowest point rests on the terrain surface. Taller tiers therefore stay
// inside their tile and just grow upward.
//
// The glbs load asynchronously; until a tier's model lands (or if it fails)
// addInstance returns false and the caller draws that tier procedurally.
import { Box3, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import type { BufferGeometry, Material, Mesh, Scene } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type TownModelTier = "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";

export const TOWN_MODEL_URLS: Readonly<Record<TownModelTier, string>> = {
  TOWN: "/models/town.glb",
  CITY: "/models/city.glb",
  GREAT_CITY: "/models/great-city.glb",
  METROPOLIS: "/models/metropolis.glb"
};

const TOWN_MODEL_TIERS: readonly TownModelTier[] = ["TOWN", "CITY", "GREAT_CITY", "METROPOLIS"];

// Longer ground side of every model, in tiles.
export const TOWN_MODEL_FOOTPRINT = 0.88;

type LoadedTownModel = {
  readonly geometry: BufferGeometry;
  readonly material: Material;
  readonly scale: number;
  /** Raises the scaled model so its lowest point sits on the surface. */
  readonly baseLift: number;
};

const cached = new Map<TownModelTier, Promise<LoadedTownModel>>();

/** Loads (and caches) one tier's geometry + textured material, with its
 * footprint scale and base lift. Shared by every overlay, so overlays must not
 * dispose the geometry or material. */
export const loadTownModel = (tier: TownModelTier): Promise<LoadedTownModel> => {
  let pending = cached.get(tier);
  if (!pending) {
    const url = TOWN_MODEL_URLS[tier];
    pending = new Promise<LoadedTownModel>((resolve, reject) => {
      new GLTFLoader().load(
        url,
        (gltf) => {
          let found: Mesh | undefined;
          gltf.scene.updateMatrixWorld(true);
          gltf.scene.traverse((node) => {
            const mesh = node as Mesh;
            if (!found && mesh.isMesh) found = mesh;
          });
          if (!found) {
            reject(new Error(`${url} contains no mesh`));
            return;
          }
          const geometry = found.geometry.clone().applyMatrix4(found.matrixWorld);
          geometry.computeBoundingBox();
          const box = geometry.boundingBox ?? new Box3();
          const size = box.getSize(new Vector3());
          const centre = box.getCenter(new Vector3());
          geometry.translate(-centre.x, 0, -centre.z);
          const scale = TOWN_MODEL_FOOTPRINT / Math.max(size.x, size.z, 1e-6);
          const material = Array.isArray(found.material) ? found.material[0]! : found.material;
          resolve({ geometry, material, scale, baseLift: -box.min.y * scale });
        },
        undefined,
        (err) => reject(err instanceof Error ? err : new Error(String(err)))
      );
    });
    cached.set(tier, pending);
  }
  return pending;
};

export type TownModelOverlay = {
  /** Draws a tier's model on the tile; false (nothing drawn) when that tier's
   * glb isn't loaded yet or its buffer is full, so the caller can fall back. */
  readonly addInstance: (tier: string, sceneX: number, sceneZ: number, surfaceY: number) => boolean;
  readonly clear: () => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

type TierSlot = { mesh: InstancedMesh; scale: number; baseLift: number; count: number };

export const createTownModelOverlay = (scene: Scene, maxTiles: number): TownModelOverlay => {
  // Keyed by plain tier string so callers need no cast; only TownModelTier keys are ever set.
  const slots = new Map<string, TierSlot>();
  let disposed = false;

  const matrix = new Matrix4();
  const quaternion = new Quaternion();
  const position = new Vector3();
  const scale = new Vector3();

  for (const tier of TOWN_MODEL_TIERS) {
    void loadTownModel(tier).then(({ geometry, material, scale: modelScale, baseLift }) => {
      if (disposed) return;
      const mesh = new InstancedMesh(geometry, material, maxTiles);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      scene.add(mesh);
      slots.set(tier, { mesh, scale: modelScale, baseLift, count: 0 });
    }, (err: unknown) => {
      // A missing asset must not take down the map; that tier keeps the procedural look.
      console.error(`town model ${tier} failed to load`, err);
    });
  }

  return {
    addInstance: (tier, sceneX, sceneZ, surfaceY) => {
      const slot = slots.get(tier);
      if (!slot || slot.count >= maxTiles) return false;
      position.set(sceneX, surfaceY + slot.baseLift, sceneZ);
      scale.set(slot.scale, slot.scale, slot.scale);
      matrix.compose(position, quaternion, scale);
      slot.mesh.setMatrixAt(slot.count, matrix);
      slot.count += 1;
      return true;
    },
    clear: () => {
      for (const slot of slots.values()) slot.count = 0;
    },
    commit: () => {
      for (const slot of slots.values()) {
        slot.mesh.count = slot.count;
        slot.mesh.instanceMatrix.clearUpdateRanges();
        if (slot.count === 0) continue;
        slot.mesh.instanceMatrix.addUpdateRange(0, slot.count * 16);
        slot.mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose: () => {
      disposed = true;
      for (const slot of slots.values()) {
        scene.remove(slot.mesh);
        slot.mesh.dispose();
      }
      slots.clear();
    }
  };
};
