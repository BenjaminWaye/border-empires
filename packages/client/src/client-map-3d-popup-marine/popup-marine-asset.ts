// Loads the low-poly space-marine model used by the pop-up-marine battle
// overlay. The .glb itself (packages/client/src/assets/models/popup-marine.glb)
// is not a downloaded third-party asset — it's baked offline from a plain
// Three.js primitive mesh (boxes for torso/legs/shoulders/helmet, a cylinder
// barrel, a cone antenna) via GLTFExporter; see
// packages/client/scripts/bake-popup-marine-model.mjs, which is the source
// of truth for the model's shape. Re-run `node
// packages/client/scripts/bake-popup-marine-model.mjs` from the repo root
// after editing that script to refresh the checked-in .glb.
//
// The model is deliberately a single merged mesh with one plain
// MeshStandardMaterial (no vertex colors, no textures) — the overlay tints
// it per-instance at runtime via InstancedMesh.setColorAt (attacker color vs
// defender color) rather than shipping attacker/defender variants, matching
// how the dot-swarm system this replaces tinted its own instances.
import { BufferGeometry } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Mesh, Object3D } from "three";

// Served straight from packages/client/public (Vite serves that directory's
// contents unprocessed at the site root), matching how every other static
// game asset in this package — /overlays/*.svg, /audio/*.m4a — is referenced
// by plain string path rather than imported as a module.
const POPUP_MARINE_MODEL_URL = "/models/popup-marine.glb";

let cached: Promise<BufferGeometry> | undefined;

const firstMeshGeometry = (root: Object3D): BufferGeometry => {
  let found: BufferGeometry | undefined;
  root.traverse((child) => {
    if (found) return;
    const mesh = child as Mesh;
    if (mesh.isMesh && mesh.geometry instanceof BufferGeometry) found = mesh.geometry;
  });
  if (!found) throw new Error("popup-marine.glb contains no mesh geometry");
  return found;
};

/** Loads (and caches) the marine's BufferGeometry, ready to drive an
 * InstancedMesh. Safe to call from multiple overlay instances — the GLTF
 * fetch/parse only ever happens once per page load. */
export const loadPopupMarineGeometry = (): Promise<BufferGeometry> => {
  if (!cached) {
    const loader = new GLTFLoader();
    cached = new Promise<BufferGeometry>((resolve, reject) => {
      loader.load(
        POPUP_MARINE_MODEL_URL,
        (gltf) => {
          try {
            resolve(firstMeshGeometry(gltf.scene));
          } catch (err) {
            reject(err as Error);
          }
        },
        undefined,
        (err) => reject(err instanceof Error ? err : new Error(String(err)))
      );
    });
  }
  return cached;
};

/** Test-only hook: lets popup-marine-overlay-fx tests reset the module-level
 * cache between cases instead of leaking a resolved/rejected promise across
 * them. */
export const __resetPopupMarineGeometryCacheForTests = (): void => {
  cached = undefined;
};
