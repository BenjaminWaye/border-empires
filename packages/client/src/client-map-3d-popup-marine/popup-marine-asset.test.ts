// Regression coverage for the real checked-in marine model, parsed straight
// off disk (GLTFLoader.parse on the raw bytes, no network fetch). This
// matters because popup-marine-overlay-fx.test.ts mocks the asset module out
// entirely (vi.mock("./popup-marine-asset.js", ...)), so without this file
// nothing exercises a real parse of the real asset.
//
// Every case here pins a bug that shipped a CLEAN-LOOKING glb with silently
// wrong data — no exporter warning, no console error, just a battle that
// renders wrong (see bake-popup-marine-titan-model.py's header for the full
// list). They are cheap; please keep them.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Bone, Box3, SkinnedMesh, Vector3 } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MARINE_CLIP_NAMES } from "./popup-marine-asset.js";
import { MARINE_SURFACE_MASK_ATTRIBUTE } from "./popup-marine-material.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_DIR = resolve(__dirname, "../../public/models");
// Every soldier model the overlay loads (popup-marine-asset.ts's
// MODEL_URL_BY_KEY): each must pass the same rig checks.
const MODELS = ["popup-marine-titan-24bone.glb", "popup-marine-heavy-24bone.glb"] as const;

// The height the bake script normalises the rig to (TARGET_HEIGHT there).
const EXPECTED_HEIGHT = 0.052;

const parseModel = (file: string): Promise<GLTF> => {
  const bytes = readFileSync(resolve(MODEL_DIR, file));
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((res, rej) => {
    new GLTFLoader().parse(arrayBuffer, "", res, rej);
  });
};

describe.each(MODELS)("%s (real checked-in asset)", (file) => {
  it("carries every clip the overlay plays", async () => {
    const gltf = await parseModel(file);
    const names = gltf.animations.map((clip) => clip.name);
    for (const clipName of Object.values(MARINE_CLIP_NAMES)) {
      expect(names).toContain(clipName);
    }
    // Read by name directly (not via MARINE_CLIP_NAMES) by the muster-transit
    // march overlay — see popup-marine-asset.ts's header comment.
    expect(names).toContain("PistolWalk");
  });

  it("ships a real humanoid rig, including the bone the muzzle flash hangs off", async () => {
    const gltf = await parseModel(file);
    let skinned: SkinnedMesh | undefined;
    gltf.scene.traverse((o) => {
      if (!skinned && o instanceof SkinnedMesh) skinned = o;
    });
    expect(skinned).toBeDefined();
    const boneNames = skinned!.skeleton.bones.map((b) => b.name);
    // popup-marine-overlay-fx.ts pins the muzzle flash to this bone by name.
    expect(boneNames).toContain("RightHand");
    expect(boneNames).toContain("Hips");
    expect(skinned!.skeleton.bones.every((b) => b instanceof Bone)).toBe(true);
  });

  it("keeps its scale on the ROOT NODE, and renders at the pipeline's height", async () => {
    const gltf = await parseModel(file);
    gltf.scene.updateMatrixWorld(true);
    // The bake script deliberately leaves the scale as an unapplied root-node
    // transform so bone rest data and animation translations stay at ONE
    // consistent scale. Baking it into the data instead rescaled the rest
    // pose but NOT the clips' translation keyframes, which flung the marine
    // ~1000x its own height off-screen the moment a clip played.
    const root = gltf.scene.children.find((c) => c.name === "Armature");
    expect(root).toBeDefined();
    expect(root!.scale.x).toBeLessThan(1);
    expect(root!.scale.x).toBeGreaterThan(0);

    const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
    expect(size.y).toBeGreaterThan(EXPECTED_HEIGHT * 0.5);
    expect(size.y).toBeLessThan(EXPECTED_HEIGHT * 2);
  });

  it("has no clip that animates the root node's own transform", async () => {
    const gltf = await parseModel(file);
    // Each source clip carried the SOURCE armature's object-level scale
    // (0.01) as a track on the root node. Left in, playing any clip
    // overwrote the root-node scale above and resized the whole rig ~32x the
    // instant a battle started. Clips must only ever drive bones.
    for (const clip of gltf.animations) {
      for (const track of clip.tracks) {
        expect(track.name.startsWith("Armature.")).toBe(false);
      }
    }
  });

  it("loops its in-place clips without walking the marine off its tile", async () => {
    const gltf = await parseModel(file);
    // Horizontal root motion is stripped at bake time because the timeline
    // (popup-marine-timeline.ts) owns each marine's position; a clip that
    // still translated would fight it and drift across the tile.
    //
    // Clip translations are authored in the rig's own (source) units — the
    // root node's scale is what brings them to final size — so convert
    // before comparing against a final-size threshold.
    const rootScale = gltf.scene.children.find((c) => c.name === "Armature")!.scale.x;
    for (const clip of gltf.animations) {
      const hips = clip.tracks.find((t) => t.name === "Hips.position");
      if (!hips) continue;
      const xs: number[] = [];
      const zs: number[] = [];
      for (let i = 0; i < hips.values.length; i += 3) {
        xs.push(hips.values[i]! * rootScale);
        zs.push(hips.values[i + 2]! * rootScale);
      }
      const spread = (v: number[]): number => Math.max(...v) - Math.min(...v);
      // Small residual hip sway is fine; a stride's worth of travel is not.
      expect(spread(xs)).toBeLessThan(EXPECTED_HEIGHT);
      expect(spread(zs)).toBeLessThan(EXPECTED_HEIGHT);
    }
  });
});


const skinnedMeshOf = (gltf: GLTF): SkinnedMesh => {
  let skinned: SkinnedMesh | undefined;
  gltf.scene.traverse((o) => {
    if (!skinned && o instanceof SkinnedMesh) skinned = o;
  });
  return skinned!;
};

// The heavy armour (bake-popup-marine-heavy-model.py): its titanium edging
// renders as bare metal through the surface mask, and Meshy's A-pose sculpt
// came with empty hands, so the bake grafts the standard marine's rifle on.
describe("popup-marine-heavy-24bone.glb surface and rifle", () => {
  it("carries a surface mask with titanium edging, mostly team-colour plates", async () => {
    const geometry = skinnedMeshOf(await parseModel("popup-marine-heavy-24bone.glb")).geometry;
    const mask = geometry.getAttribute(MARINE_SURFACE_MASK_ATTRIBUTE);
    expect(mask).toBeDefined();
    let metal = 0;
    for (let i = 0; i < mask.count; i++) if (mask.getX(i) > 0.5) metal++;
    const share = metal / mask.count;
    // Edging and rivets, not a chrome suit: the plates must stay paintable.
    expect(share).toBeGreaterThan(0.05);
    expect(share).toBeLessThan(0.4);
  });

  it("holds a rifle in its right hand, reaching well past the gauntlet", async () => {
    const skinned = skinnedMeshOf(await parseModel("popup-marine-heavy-24bone.glb"));
    const geometry = skinned.geometry;
    const hand = skinned.skeleton.bones.findIndex((b) => b.name === "RightHand");
    const position = geometry.getAttribute("position");
    const joints = geometry.getAttribute("skinIndex");
    const weights = geometry.getAttribute("skinWeight");
    const onHand: Vector3[] = [];
    for (let v = 0; v < position.count; v++) {
      for (let k = 0; k < 4; k++) {
        if (joints.getComponent(v, k) === hand && weights.getComponent(v, k) > 0.99) {
          onHand.push(new Vector3().fromBufferAttribute(position, v));
        }
      }
    }
    const box = new Box3().setFromPoints(onHand);
    const height = new Box3().setFromBufferAttribute(position as never).getSize(new Vector3()).z;
    // The grafted hand + rifle shell is rigid on RightHand; a bare gauntlet
    // spans a fraction of the rifle's length.
    expect(onHand.length).toBeGreaterThan(200);
    expect(box.getSize(new Vector3()).length()).toBeGreaterThan(height * 0.2);
  });
});
