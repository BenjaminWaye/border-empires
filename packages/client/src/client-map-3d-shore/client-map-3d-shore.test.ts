// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from "vitest";
import { BufferGeometry, Mesh, Scene } from "three";
import { appendShoreFoam, computeShoreCalm, foamMouthFade, type FoamBuffers } from "./client-map-3d-shore.js";
import { createWaterSurface, WATER_SURFACE_Y } from "../client-map-3d-water-surface.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";

describe("coastline polish: calm shore and foam", () => {
  beforeAll(() => {
    const fakeCtx = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => undefined };
    HTMLCanvasElement.prototype.getContext = (() => fakeCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  it("calms waves fully at corners touching land, easing back in over two rings", () => {
    // Regression: sea corners at the coast bobbed ~0.22, flickering the square sea-tile edges.
    const calm = computeShoreCalm(6, 1, (c) => c === 0); // land tile at column 0
    expect(Array.from(calm)).toEqual([1, 1, 0.6000000238418579, 0.25, 0, 0]);
  });

  it("lays foam only near land, strongest at the waterline and rounded around corners", () => {
    const buffers: FoamBuffers = { positions: [], colors: [], indices: [] };
    appendShoreFoam(buffers, 5, 5, 0, (gc, gr) => gc === 4 && gr === 5); // land to the west
    const alphaAt = (x: number, z: number): number => {
      for (let i = 0; i < buffers.positions.length / 3; i++) {
        if (Math.abs(buffers.positions[i * 3]! - x) < 1e-6 && Math.abs(buffers.positions[i * 3 + 2]! - z) < 1e-6) return buffers.colors[i * 4 + 3]!;
      }
      return NaN;
    };
    expect(alphaAt(5, 5 + 1 / 3)).toBeGreaterThan(0.4); // on the waterline
    expect(alphaAt(6, 5 + 1 / 3)).toBe(0); // far side of the tile
    const open: FoamBuffers = { positions: [], colors: [], indices: [] };
    appendShoreFoam(open, 5, 5, 0, () => false);
    expect(open.positions).toHaveLength(0);
  });

  it("puts foam only along real coasts in the water surface, not around every sea tile", () => {
    // Regression: foam looked land up in the wrong (scene vs window-relative)
    // coordinates and framed every sea tile.
    const scene = new Scene();
    // 3x3 sea tiles at world (10..12, 10..12); land only at world (9, 11), west of the middle row.
    const water = createWaterSurface(scene, 9, { isLandAt: (x, z) => x === 9 && z === 11 });
    // Scene grid starts at (5, 5) so scene and window-relative coords differ.
    for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) water.addTile(x + 5.5, z + 5.5, false, x + 10, z + 10);
    water.commit();
    const foam = scene.children.find((c): c is Mesh => c instanceof Mesh && c.renderOrder === RENDER_ORDER.shoreFoam);
    expect(foam).toBeDefined();
    const pos = (foam!.geometry as BufferGeometry).getAttribute("position").array as Float32Array;
    const col = (foam!.geometry as BufferGeometry).getAttribute("color").array as Float32Array;
    for (let i = 0; i < pos.length / 3; i++) {
      if (col[i * 4 + 3]! > 0) expect(pos[i * 3]!).toBeLessThan(5.5); // only near the west edge (scene x = 5)
      expect(pos[i * 3 + 1]!).toBeGreaterThan(WATER_SURFACE_Y);
    }
    water.dispose();
  });
  it("fades the foam out around a river mouth, so it doesn't run across the river's entry", () => {
    const mouths = [{ x: 5, z: 5 }];
    expect(foamMouthFade(5, 5, mouths)).toBe(0);
    expect(foamMouthFade(5.4, 5, mouths)).toBeGreaterThan(0);
    expect(foamMouthFade(5.4, 5, mouths)).toBeLessThan(1);
    expect(foamMouthFade(7, 5, mouths)).toBe(1);
    const near: FoamBuffers = { positions: [], colors: [], indices: [] };
    appendShoreFoam(near, 5, 5, 0, (gc, gr) => gc === 4 && gr === 5, [{ x: 5, z: 5.5 }]);
    const far: FoamBuffers = { positions: [], colors: [], indices: [] };
    appendShoreFoam(far, 5, 5, 0, (gc, gr) => gc === 4 && gr === 5);
    const sum = (b: FoamBuffers): number => b.colors.filter((_, i) => i % 4 === 3).reduce((a, v) => a + v, 0);
    expect(sum(near)).toBeLessThan(sum(far) * 0.6);
  });
});
