// Loads the Voidcrystal Colossus model used by the barbarian-tile overlay
// (client-map-3d-barbarian-overlay.ts), replacing the earlier procedural
// "skull on a spike" marker with a real sculpted 3D unit.
//
// Source: an external Meshy-AI "Voidcrystal Colossus (biped)" export
// (28-bone rig, PBR albedo/metallic/roughness/normal maps), assembled from
// THREE separate Meshy export batches, each with one captured clip on its
// own copy of the same rig: "Attack", "Running" (baked in but currently
// unused by the overlay — see below), and "Walking" (a third batch whose
// one FBX Meshy didn't give a readable name; the convert script finds it
// by elimination). Converted to this .glb by
// packages/client/scripts/convert-voidcrystal-colossus-model.py: textures
// downscaled to 1024px and re-encoded as JPEG, mesh decimated to ~30% of
// its source triangle count (many instances can be on screen at once — see
// MAX_RENDERED_COLOSSI in the overlay).
//
// IMPORTANT: built from the Running export's OWN mesh+armature (with
// Attack grafted on via a straight NLA transplant, and Walking retargeted
// by constrain-and-bake because a straight transplant of THAT particular
// action produced garbage), not the source set's separate
// Character_output.fbx — see the convert script's header for the full
// story on both.
//
// The overlay plays "Walking" while a colossus is moving between tiles,
// "Attack" in place when a barbarian tile captures a settled
// (town/structure) neighbor (i.e. an actual fight, not a routine frontier
// expansion), and holds an exact, unmoving bind pose otherwise — a
// standing colossus has no idle animation and is not animated at all.
//
// Like popup-marine-asset.ts, the whole gltf.scene is the template to
// clone (via SkeletonUtils.clone), not the bare SkinnedMesh — the root
// node can carry transform data that a bare-mesh extraction would drop.
import { AnimationClip, Group, SkinnedMesh } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Object3D } from "three";
import { firstSkinnedMesh } from "./client-map-3d-popup-marine/popup-marine-asset.js";

const VOIDCRYSTAL_COLOSSUS_MODEL_URL = "/models/voidcrystal-colossus.glb";

/** Clip names baked into the model by the convert script. */
export const VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME = "Attack";
/** Baked into the model but not currently used by the overlay — kept in
 * case a future visual wants a true run vs. walk distinction. */
export const VOIDCRYSTAL_COLOSSUS_RUNNING_CLIP_NAME = "Running";
export const VOIDCRYSTAL_COLOSSUS_WALKING_CLIP_NAME = "Walking";

export type VoidcrystalColossusTemplate = {
  /** Whole loaded scene — clone this, not the bare mesh. */
  root: Group;
  clips: Map<string, AnimationClip>;
};

let cached: Promise<VoidcrystalColossusTemplate> | undefined;

/** Loads (and caches) the colossus template every per-tile clone is copied
 * from. Safe to call from multiple overlay instances — the GLTF fetch/parse
 * only ever happens once per page load. */
export const loadVoidcrystalColossusTemplate = (): Promise<VoidcrystalColossusTemplate> => {
  if (!cached) {
    const loader = new GLTFLoader();
    cached = new Promise<VoidcrystalColossusTemplate>((resolve, reject) => {
      loader.load(
        VOIDCRYSTAL_COLOSSUS_MODEL_URL,
        (gltf) => {
          try {
            // Throws if the model has no skin at all, so a broken asset
            // fails here rather than rendering nothing on every barbarian tile.
            firstSkinnedMesh(gltf.scene as unknown as Object3D);
            const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]));
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

export const __resetVoidcrystalColossusCacheForTests = (): void => {
  cached = undefined;
};

// Re-exported so callers that only need the shared traversal helper don't
// have to reach into popup-marine-asset.ts for an unrelated model's util.
export { firstSkinnedMesh };
export type { SkinnedMesh };
