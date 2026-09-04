// Loads the low-poly space-marine model used by the pop-up-marine battle
// overlay. The .glb itself (packages/client/public/models/popup-marine.glb)
// is not a downloaded third-party asset — it's baked offline from a plain
// Three.js primitive mesh (legs, torso, pauldrons, helmet, two arm
// segments, rifle) with a small hand-authored bone skeleton (rigid
// single-bone vertex skinning), via GLTFExporter; see
// packages/client/scripts/bake-popup-marine-model.mjs, which is the source
// of truth for the model's shape and skeleton. Re-run `node
// packages/client/scripts/bake-popup-marine-model.mjs` from the repo root
// after editing that script to refresh the checked-in .glb.
//
// The model is a single merged SkinnedMesh with a baked per-part vertex
// "color" attribute (glTF COLOR_0 — team-colored armor plates near white,
// joints a mid grey, helmet/rifle/arms near black; see
// bake-popup-marine-model.mjs's MARINE_VERTEX_TINT) and no textures. The
// overlay renders one SkinnedMesh per marine slot (see
// popup-marine-overlay-fx.ts) — each clone gets its own material instance
// so it can be tinted per-marine (attacker color vs defender color) and its
// own cloned Skeleton so its bones can be posed independently frame to
// frame (crouch/aim/fire-recoil/collapse), unlike the previous
// InstancedMesh-of-one-rigid-body approach this replaced.
import { SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Object3D } from "three";

// Served straight from packages/client/public (Vite serves that directory's
// contents unprocessed at the site root), matching how every other static
// game asset in this package — /overlays/*.svg, /audio/*.m4a — is referenced
// by plain string path rather than imported as a module.
const POPUP_MARINE_MODEL_URL = "/models/popup-marine.glb";

let cached: Promise<SkinnedMesh> | undefined;

const firstSkinnedMesh = (root: Object3D): SkinnedMesh => {
  let found: SkinnedMesh | undefined;
  root.traverse((child) => {
    if (found) return;
    if (child instanceof SkinnedMesh) found = child;
  });
  if (!found) throw new Error("popup-marine.glb contains no SkinnedMesh");
  return found;
};

/** Loads (and caches) the marine's template SkinnedMesh — the shared
 * geometry/skeleton every pooled per-marine clone (see
 * popup-marine-overlay-fx.ts, via SkeletonUtils.clone) is copied from. Safe
 * to call from multiple overlay instances — the GLTF fetch/parse only ever
 * happens once per page load. */
export const loadPopupMarineTemplate = (): Promise<SkinnedMesh> => {
  if (!cached) {
    const loader = new GLTFLoader();
    cached = new Promise<SkinnedMesh>((resolve, reject) => {
      loader.load(
        POPUP_MARINE_MODEL_URL,
        (gltf) => {
          try {
            resolve(firstSkinnedMesh(gltf.scene));
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
