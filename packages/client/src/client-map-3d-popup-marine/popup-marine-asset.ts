// Loads the space-marine model used by the pop-up-marine battle overlay.
// The active .glb (packages/client/public/models/popup-marine-meshy.glb) is
// decimated/rigged from an external Meshy-AI sculpt onto the same
// hand-authored MARINE_BONE_NAMES skeleton the procedural model used — see
// packages/client/scripts/bake-popup-marine-meshy-model.py (Blender
// decimation + heat-diffusion automatic skin weights) for how it's built.
// It replaced the older fully-procedural primitive-mesh model
// (packages/client/public/models/popup-marine.glb, baked via
// packages/client/scripts/bake-popup-marine-model.mjs) as the shipped
// default after GPU-rendered visual verification (skeleton/bone names,
// team-color tinting, and all real in-game pose states — cover, popped-up
// aim, firing, and rout/collapse — plus a stride/running pose) confirmed
// the Meshy rig holds up cleanly posed, in-engine, at the real camera
// angle. The procedural model's bake script and .glb are kept in the repo,
// unused, as an easy revert path — see POPUP_MARINE_FALLBACK_MODEL_URL
// below.
//
// The model is a single merged SkinnedMesh. The overlay renders one
// SkinnedMesh per marine slot (see popup-marine-overlay-fx.ts) — each clone
// gets its own material instance so it can be tinted per-marine (attacker
// color vs defender color) and its own cloned Skeleton so its bones can be
// posed independently frame to frame (crouch/aim/fire-recoil/collapse).
import { SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Object3D } from "three";

// Served straight from packages/client/public (Vite serves that directory's
// contents unprocessed at the site root), matching how every other static
// game asset in this package — /overlays/*.svg, /audio/*.m4a — is referenced
// by plain string path rather than imported as a module.
const ACTIVE_POPUP_MARINE_MODEL_URL = "/models/popup-marine-meshy.glb";

// Kept only as a documented, easy revert target: the earlier fully-
// procedural model (see packages/client/scripts/bake-popup-marine-model.mjs)
// this file used before the Meshy-sculpt model became the default. Not
// currently loaded by anything.
export const POPUP_MARINE_FALLBACK_MODEL_URL = "/models/popup-marine.glb";

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
        ACTIVE_POPUP_MARINE_MODEL_URL,
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
