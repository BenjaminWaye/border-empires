import { InstancedMesh, Mesh, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BLOOM_LAYER } from "./client-map-3d-bloom/client-map-3d-bloom-layer.js";
import { createWaterSurface } from "./client-map-3d-water-surface.js";

// createNormalMap (in client-map-3d-water-surface.ts) generates its normal
// maps via a real <canvas>, unconditionally — unlike the terrain/badge
// texture generators, it has no `typeof document === "undefined"` guard.
// happy-dom's canvas 2d context isn't implemented, so this stubs `document`
// the same way client-map-3d-floating-text.test.ts does for its own
// canvas-drawn text sprites, rather than relying on a DOM environment.
const stubCanvasDocument = (): void => {
  const ctx = {
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: vi.fn()
  };
  vi.stubGlobal("document", {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx)
    }))
  });
};

describe("water surface bloom tagging", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The water material's emissive channel is real bloom material — see
  // client-map-3d-bloom-layer.ts for why bloom is opt-in (tag) rather than a
  // whole-scene threshold. The mesh is rebuilt from scratch on every
  // commit() as tiles pan in/out, so the tag has to survive rebuilds, not
  // just apply once at construction.
  it("tags the water mesh for bloom on every rebuild, not just the first", () => {
    stubCanvasDocument();
    const scene = new Scene();
    const water = createWaterSurface(scene, 16);

    water.addTile(0.5, 0.5, false);
    water.commit();
    const firstMesh = scene.children.find(
      (child): child is Mesh => child instanceof Mesh && !(child instanceof InstancedMesh)
    );
    expect(firstMesh).toBeDefined();
    expect((firstMesh!.layers.mask & (1 << BLOOM_LAYER)) !== 0).toBe(true);

    water.clear();
    water.addTile(2.5, 2.5, true);
    water.commit();
    const secondMesh = scene.children.find(
      (child): child is Mesh => child instanceof Mesh && !(child instanceof InstancedMesh)
    );
    expect(secondMesh).toBeDefined();
    expect((secondMesh!.layers.mask & (1 << BLOOM_LAYER)) !== 0).toBe(true);

    water.dispose();
  });
});
