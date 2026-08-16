import { InstancedMesh, Scene } from "three";
import { describe, expect, it } from "vitest";
import { BLOOM_LAYER } from "./client-map-3d-bloom/client-map-3d-bloom-layer.js";
import { createShardOverlay } from "./client-map-3d-shard-overlay.js";

describe("shard overlay bloom tagging", () => {
  // Both the emissive crystal and its ground shimmer are meant to glow —
  // unlike client-map-3d-aether-bridge-pylon-overlay.ts, there's no plain
  // structural geometry here to exclude, so both meshes tag in.
  it("tags both the shard crystal and its shimmer for bloom", () => {
    const scene = new Scene();
    const overlay = createShardOverlay(scene, 4);
    overlay.addInstance(0.5, 0.5, 0, 0, 0);
    overlay.commit();

    const meshes = scene.children
      .flatMap((child) => (child.children.length > 0 ? child.children : [child]))
      .filter((child): child is InstancedMesh => child instanceof InstancedMesh);

    expect(meshes.length).toBe(2);
    for (const mesh of meshes) {
      expect((mesh.layers.mask & (1 << BLOOM_LAYER)) !== 0).toBe(true);
    }

    overlay.dispose();
  });
});
