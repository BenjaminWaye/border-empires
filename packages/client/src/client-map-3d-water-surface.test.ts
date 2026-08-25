// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { DoubleSide, Mesh, Scene } from "three";
import { createWaterSurface } from "./client-map-3d-water-surface.js";

// Regression test for the water surface rendering solid black from below:
// the surface mesh only winds a front face (normal pointing up), so without
// DoubleSide on the material, any camera angle catching the underside (or
// a steep enough grazing angle) saw straight through to empty background
// instead of water.
describe("createWaterSurface", () => {
  // happy-dom's canvas has no real 2D context (needs a native canvas
  // binding); stub just enough of it for the module's normal-map generator
  // to run without actually rasterizing anything.
  beforeAll(() => {
    const fakeCtx = {
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: () => undefined
    };
    HTMLCanvasElement.prototype.getContext = (() => fakeCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it("renders both sides of the surface mesh, not just the top face", () => {
    const scene = new Scene();
    const water = createWaterSurface(scene, 4);
    water.addTile(0.5, 0.5, false);
    water.commit();

    const mesh = scene.children.find((child): child is Mesh => child instanceof Mesh);
    expect(mesh).toBeDefined();
    const material = mesh!.material as { side: number };
    expect(material.side).toBe(DoubleSide);

    water.dispose();
  });
});
