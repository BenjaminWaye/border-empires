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

// EXPERIMENTAL: an alternative marine model decimated/rigged from an
// external Meshy-AI sculpt (see
// packages/client/scripts/bake-popup-marine-meshy-model.py for how it's
// built — Blender decimation + heat-diffusion automatic skin weights onto
// the SAME MARINE_BONE_NAMES skeleton popup-marine-pose.ts already drives).
// Left OFF by default: a geometric bend-test (comparing bind-pose vs.
// posed triangle-edge lengths) showed mostly clean skinning but with
// localized pinching (~0.2% of edges) near the right shoulder joint, and no
// GPU-rendered screenshot verification was possible in the authoring
// environment (no browser automation available) to visually confirm it —
// see the PR description for the full writeup. Flip this to try it; the
// procedural model stays the shipped default until someone visually
// verifies the Meshy rig holds up posed, in-engine, at the real camera
// angle.
const POPUP_MARINE_USE_MESHY_MODEL = false;
const POPUP_MARINE_MESHY_MODEL_URL = "/models/popup-marine-meshy.glb";
const ACTIVE_POPUP_MARINE_MODEL_URL = POPUP_MARINE_USE_MESHY_MODEL ? POPUP_MARINE_MESHY_MODEL_URL : POPUP_MARINE_MODEL_URL;

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
