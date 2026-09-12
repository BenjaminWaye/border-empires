// Loads the space-marine model used by the pop-up-marine battle overlay.
//
// The active .glb (packages/client/public/models/popup-marine-titan-24bone.glb)
// is a real 24-bone Mixamo-style humanoid rig carrying REAL CAPTURED
// ANIMATION CLIPS, not a hand-authored skeleton posed by procedural bone
// math. See packages/client/scripts/bake-popup-marine-titan-model.py for how
// it's built: an external Meshy-AI "Titan Vanguard" sculpt, decimated for the
// ~160-marines-on-screen budget, merged with its own captured
// Walking/Running/Dead clips plus Mixamo PistolIdle / PistolKneelingIdle /
// PistolRun / PistolWalk clips.
//
// The battle overlay plays PistolRun/PistolIdle/PistolKneelingIdle through
// an AnimationMixer per marine (popup-marine-overlay-fx.ts) instead of
// rotating bones by hand, so the squad's motion is authored animation
// rather than tuned constants. Which clip a marine should be in at a given
// moment is still decided by the deterministic timeline (MarinePose.stance),
// so scrubbing/rejoining stays reproducible. PistolWalk is read directly by
// name (not via MARINE_CLIP_NAMES below) by the separate muster-transit
// march overlay (client-map-3d-muster-transit-overlay.ts), which has no
// stance to choose between — a marching company just walks.
//
// IMPORTANT — the whole gltf.scene is the template, not the SkinnedMesh
// alone: this asset carries its final scale on the exported ROOT NODE
// (that's what keeps bone rest data and animation translations at one
// consistent scale — see the bake script's header). Extracting the bare
// SkinnedMesh, as the previous hand-rigged model did, would silently drop
// that root transform and render the rig at ~3000x its intended size.
//
// Earlier models are kept in the repo, unused, as easy revert paths — see
// POPUP_MARINE_FALLBACK_MODEL_URL / POPUP_MARINE_PREVIOUS_MESHY_MODEL_URL.
import { AnimationClip, Group, SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Object3D } from "three";

// Served straight from packages/client/public (Vite serves that directory's
// contents unprocessed at the site root), matching how every other static
// game asset in this package — /overlays/*.svg, /audio/*.m4a — is referenced
// by plain string path rather than imported as a module.
const ACTIVE_POPUP_MARINE_MODEL_URL = "/models/popup-marine-titan-24bone.glb";

// Kept only as documented, easy revert targets: models this file used before
// the animated Titan rig became the default. Not currently loaded by
// anything.
export const POPUP_MARINE_FALLBACK_MODEL_URL = "/models/popup-marine.glb";
export const POPUP_MARINE_PREVIOUS_MESHY_MODEL_URL = "/models/popup-marine-meshy.glb";

/** Clip names baked into the active model by the bake script. */
export const MARINE_CLIP_NAMES = {
  run: "PistolRun",
  stand: "PistolIdle",
  kneel: "PistolKneelingIdle"
} as const;

export type PopupMarineTemplate = {
  /** Whole loaded scene (root node's scale included) — clone this, not the mesh. */
  root: Group;
  /** Clips keyed by the name the bake script gave them. */
  clips: Map<string, AnimationClip>;
};

let cached: Promise<PopupMarineTemplate> | undefined;

export const firstSkinnedMesh = (root: Object3D): SkinnedMesh => {
  let found: SkinnedMesh | undefined;
  root.traverse((child) => {
    if (found) return;
    if (child instanceof SkinnedMesh) found = child;
  });
  if (!found) throw new Error("popup-marine model contains no SkinnedMesh");
  return found;
};

/** Loads (and caches) the marine template every pooled per-marine clone (see
 * popup-marine-overlay-fx.ts, via SkeletonUtils.clone) is copied from. Safe
 * to call from multiple overlay instances — the GLTF fetch/parse only ever
 * happens once per page load. */
export const loadPopupMarineTemplate = (): Promise<PopupMarineTemplate> => {
  if (!cached) {
    const loader = new GLTFLoader();
    cached = new Promise<PopupMarineTemplate>((resolve, reject) => {
      loader.load(
        ACTIVE_POPUP_MARINE_MODEL_URL,
        (gltf) => {
          try {
            // Throws if the model has no skin at all, so a broken asset
            // fails here rather than rendering an invisible squad.
            firstSkinnedMesh(gltf.scene);
            const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
            for (const name of Object.values(MARINE_CLIP_NAMES)) {
              if (!clips.has(name)) throw new Error(`popup-marine model is missing clip "${name}"`);
            }
            resolve({ root: gltf.scene, clips });
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
