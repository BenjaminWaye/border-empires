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

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = resolve(__dirname, "../../public/models/popup-marine-titan-24bone.glb");

// The height the bake script normalises the rig to (TARGET_HEIGHT there).
const EXPECTED_HEIGHT = 0.052;

const parseModel = (): Promise<GLTF> => {
  const bytes = readFileSync(MODEL_PATH);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((res, rej) => {
    new GLTFLoader().parse(arrayBuffer, "", res, rej);
  });
};

describe("popup-marine-titan-24bone.glb (real checked-in asset)", () => {
  it("carries every clip the overlay plays", async () => {
    const gltf = await parseModel();
    const names = gltf.animations.map((clip) => clip.name);
    for (const clipName of Object.values(MARINE_CLIP_NAMES)) {
      expect(names).toContain(clipName);
    }
  });

  it("ships a real humanoid rig, including the bone the muzzle flash hangs off", async () => {
    const gltf = await parseModel();
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
    const gltf = await parseModel();
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
    const gltf = await parseModel();
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
    const gltf = await parseModel();
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
