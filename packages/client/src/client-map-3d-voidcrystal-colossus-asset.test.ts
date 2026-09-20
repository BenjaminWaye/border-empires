// @vitest-environment happy-dom
//
// happy-dom is required here (unlike popup-marine-asset.test.ts): that
// model's material is flat vertex-colored with no image textures, while
// this one has real baked JPEG albedo/metallic-roughness/normal maps, and
// GLTFLoader's texture-image decode path reaches into browser-only globals
// Node's default vitest environment doesn't provide.
//
// Regression coverage for the real checked-in colossus model, parsed
// straight off disk (GLTFLoader.parse on the raw bytes, no network fetch).
// See popup-marine-asset.test.ts for why this matters: a clean-looking glb
// with silently wrong data (missing clip, un-skinned mesh, a scale that
// drifted from what the overlay's MODEL_SCALE constant assumes) would
// otherwise ship undetected.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Box3, SkinnedMesh, Vector3 } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME,
  VOIDCRYSTAL_COLOSSUS_RUNNING_CLIP_NAME,
  VOIDCRYSTAL_COLOSSUS_WALKING_CLIP_NAME
} from "./client-map-3d-voidcrystal-colossus-asset.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_PATH = resolve(__dirname, "../public/models/voidcrystal-colossus.glb");

// The raw exported height client-map-3d-barbarian-overlay.ts's MODEL_SCALE
// constant divides by. If this drifts, every colossus on the map silently
// resizes.
const EXPECTED_RAW_HEIGHT = 1.7;

const parseModel = (): Promise<GLTF> => {
  const bytes = readFileSync(MODEL_PATH);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((res, rej) => {
    new GLTFLoader().parse(arrayBuffer, "", res, rej);
  });
};

describe("voidcrystal-colossus.glb (real checked-in asset)", () => {
  it("ships a skinned mesh", async () => {
    const gltf = await parseModel();
    let skinned: SkinnedMesh | undefined;
    gltf.scene.traverse((o) => {
      if (!skinned && o instanceof SkinnedMesh) skinned = o;
    });
    expect(skinned).toBeDefined();
    expect(skinned!.skeleton.bones.length).toBeGreaterThan(0);
  });

  it("carries the Attack, Running, and Walking clips", async () => {
    const gltf = await parseModel();
    const names = gltf.animations.map((clip) => clip.name);
    expect(names).toContain(VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME);
    expect(names).toContain(VOIDCRYSTAL_COLOSSUS_RUNNING_CLIP_NAME);
    expect(names).toContain(VOIDCRYSTAL_COLOSSUS_WALKING_CLIP_NAME);
  });

  const expectClipLoopsInPlace = async (clipName: string): Promise<void> => {
    // The overlay drives cross-tile movement itself (a separate translate
    // lerp) -- if the clip ALSO dragged the root forward, the colossus
    // would visibly skate/double-move while playing it.
    const gltf = await parseModel();
    const clip = gltf.animations.find((a) => a.name === clipName)!;
    const hipsTrack = clip.tracks.find((t) => t.name.endsWith("Hips.position"));
    if (!hipsTrack) return; // no position track on Hips at all -- trivially no drift
    const xs: number[] = [];
    const zs: number[] = [];
    for (let i = 0; i < hipsTrack.values.length; i += 3) {
      xs.push(hipsTrack.values[i]!);
      zs.push(hipsTrack.values[i + 2]!);
    }
    const spread = (v: number[]): number => Math.max(...v) - Math.min(...v);
    expect(spread(xs)).toBeLessThan(EXPECTED_RAW_HEIGHT * 0.1);
    expect(spread(zs)).toBeLessThan(EXPECTED_RAW_HEIGHT * 0.1);
  };

  it("Running clip loops in place (no root-motion drift)", () => expectClipLoopsInPlace(VOIDCRYSTAL_COLOSSUS_RUNNING_CLIP_NAME));

  it("Walking clip loops in place (no root-motion drift)", () => expectClipLoopsInPlace(VOIDCRYSTAL_COLOSSUS_WALKING_CLIP_NAME));

  it("renders at the raw height the overlay's MODEL_SCALE assumes", async () => {
    const gltf = await parseModel();
    gltf.scene.updateMatrixWorld(true);
    const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
    expect(size.y).toBeGreaterThan(EXPECTED_RAW_HEIGHT * 0.9);
    expect(size.y).toBeLessThan(EXPECTED_RAW_HEIGHT * 1.1);
  });
});
