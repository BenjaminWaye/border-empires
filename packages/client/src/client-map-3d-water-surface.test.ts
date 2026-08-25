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

  // Regression test for black artifacts under coastal sea tiles: the water
  // surface is a flat, zero-thickness sheet with no underside geometry of
  // its own -- it relied entirely on the *land* skirt (a wall dropped along
  // every coastal land edge) to hide the void beneath it. Anywhere water
  // bordered non-water without an adjacent drawn land tile this frame (mid-
  // sea, a fog/window boundary, etc.) there was nothing there, so a grazing
  // or below-water view saw straight through to empty background.
  it("adds its own skirt wall along tile edges that border non-water", () => {
    const scene = new Scene();
    const water = createWaterSurface(scene, 4);
    water.addTile(0.5, 0.5, false); // a single water tile: every edge is exposed
    water.commit();

    const meshes = scene.children.filter((child): child is Mesh => child instanceof Mesh);
    expect(meshes.length).toBe(2); // surface + skirt
    const skirt = meshes.find((m) => m.renderOrder === 11);
    expect(skirt).toBeDefined();
    // 4 exposed edges * 4 verts/edge = 16 skirt vertices.
    expect(skirt!.geometry.attributes["position"]!.count).toBe(16);

    water.dispose();
  });

  it("adds no skirt wall when every tile edge borders another water tile", () => {
    const scene = new Scene();
    const water = createWaterSurface(scene, 9);
    // A fully-interior 1x1 patch surrounded on all 4 sides: no exposed edges.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        water.addTile(dx + 0.5, dz + 0.5, false);
      }
    }
    water.commit();

    const meshes = scene.children.filter((child): child is Mesh => child instanceof Mesh);
    // Surface mesh only -- the interior tile's own edges are all covered,
    // and the outer ring's edges get a skirt, but the center tile shouldn't.
    const skirt = meshes.find((m) => m.renderOrder === 11);
    expect(skirt).toBeDefined();
    // Outer ring: 8 tiles * up-to-4 exposed edges (corners expose 2, edges expose 1) = 12 exposed edges.
    expect(skirt!.geometry.attributes["position"]!.count).toBe(12 * 4);

    water.dispose();
  });
});
