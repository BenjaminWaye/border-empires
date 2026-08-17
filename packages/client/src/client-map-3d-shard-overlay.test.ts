// makeShimmerGlowTexture draws a real <canvas> gradient, unconditionally.
// happy-dom's canvas 2d context isn't implemented (confirmed the same way
// client-map-3d-water-surface.test.ts had to work around it), so this stubs
// `document` directly rather than relying on a DOM environment.
import { AdditiveBlending, InstancedMesh, MeshBasicMaterial, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createShardOverlay } from "./client-map-3d-shard-overlay.js";

const stubCanvasDocument = (): void => {
  const ctx = {
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    fillRect: vi.fn(),
    fillStyle: ""
  };
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx)
    }))
  });
};

describe("shard overlay glow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The cheap-glow fix: a flat-color disc under AdditiveBlending would look
  // wrong (a hard-edged colored shape popping in, not a soft glow) — only
  // reads as glow because the shimmer now has a radial-gradient texture
  // that fades to transparent at its edge. Pinning both together so a
  // future edit can't drop the texture while leaving additive blending on.
  it("gives the ground shimmer additive blending and a gradient texture, not a flat disc", () => {
    stubCanvasDocument();
    const scene = new Scene();
    const overlay = createShardOverlay(scene, 4);

    const meshes = scene.children[0]!.children.filter((child): child is InstancedMesh => child instanceof InstancedMesh);
    expect(meshes.length).toBe(2);
    const shimmerMesh = meshes.find((mesh) => (mesh.material as MeshBasicMaterial).blending === AdditiveBlending);
    expect(shimmerMesh).toBeDefined();
    const material = shimmerMesh!.material as MeshBasicMaterial;
    expect(material.map).not.toBeNull();

    overlay.dispose();
  });

  // Draw-call-count-independence check: unlike the aether bridge pylon's
  // aura (one Sprite per pylon, safe because MAX_BRIDGE_PYLONS is small),
  // shard sites share the same MAX_VISIBLE_TILES budget as every other
  // overlay — the glow has to live on the existing InstancedMesh, not a
  // new per-shard object, or it isn't safe to assume cheap at scale.
  it("keeps the glow on the existing instanced shimmer mesh rather than adding a per-shard object", () => {
    stubCanvasDocument();
    const scene = new Scene();
    const overlay = createShardOverlay(scene, 4);

    const objectCountBefore = scene.children[0]!.children.length;
    overlay.addInstance(0.5, 0.5, 0, 0, 0);
    overlay.addInstance(1.5, 1.5, 0, 1, 1);
    overlay.commit();
    const objectCountAfter = scene.children[0]!.children.length;

    expect(objectCountAfter).toBe(objectCountBefore);

    overlay.dispose();
  });
});
