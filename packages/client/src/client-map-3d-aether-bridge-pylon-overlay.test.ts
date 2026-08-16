import { Mesh, Scene, Sprite } from "three";
import { describe, expect, it } from "vitest";
import { BLOOM_LAYER } from "./client-map-3d-bloom/client-map-3d-bloom-layer.js";
import { createAetherBridgePylonOverlay } from "./client-map-3d-aether-bridge-pylon-overlay.js";

const BLOOM_MASK = 1 << BLOOM_LAYER;

describe("aether bridge pylon overlay bloom tagging", () => {
  // Only the aether core and its aura should glow — the plinth, rivets,
  // towers, bands, finials, and gear are plain iron/brass/copper and must
  // stay untagged, or they'd render as glowing metal instead of solid metal.
  // The pool is built entirely at construction (see the pool.push loop in
  // the source), so no place()/beginFrame() call is needed to see it.
  it("tags exactly the core and aura per pylon, leaving every structural piece untagged", () => {
    const scene = new Scene();
    const overlay = createAetherBridgePylonOverlay(scene, 2);

    const allMaterialBearers: Array<Mesh | Sprite> = [];
    scene.traverse((obj) => {
      if (obj instanceof Mesh || obj instanceof Sprite) allMaterialBearers.push(obj);
    });

    const tagged = allMaterialBearers.filter((obj) => (obj.layers.mask & BLOOM_MASK) !== 0);
    const untagged = allMaterialBearers.filter((obj) => (obj.layers.mask & BLOOM_MASK) === 0);

    // 2 pylons * (1 core + 1 aura) = 4 tagged objects.
    expect(tagged.length).toBe(4);
    expect(tagged.every((obj) => obj instanceof Mesh || obj instanceof Sprite)).toBe(true);
    // Plinths, rivets, tower parts, bands, finials, and gear pieces easily
    // outnumber the 4 tagged objects — asserting a healthy margin rather
    // than an exact count keeps this from being an change-detector test
    // pinned to every geometric detail of the pylon model.
    expect(untagged.length).toBeGreaterThan(10);

    overlay.dispose();
  });
});
