import { describe, expect, it } from "vitest";
import { BufferGeometry, Mesh, Scene, ShaderMaterial, Vector2, type WebGLRenderer } from "three";

import { createFrontierSupplyOverlay } from "./client-map-3d-frontier-supply-overlay.js";
import type { FrontierSupplyModel } from "./client-frontier-supply/client-frontier-supply.js";

const model = (): FrontierSupplyModel => ({
  links: [
    { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, tip: false },
    { from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, tip: true }
  ],
  cuts: [{ x: 0, y: 0 }]
});
const sceneFor = (x: number, y: number) => ({ sceneX: x, sceneZ: y, surfaceY: 0 });

const meshes = (scene: Scene) => {
  const mesh = scene.children.find((child): child is Mesh => child instanceof Mesh)!;
  return { mesh, geometry: mesh.geometry as BufferGeometry, material: mesh.material as ShaderMaterial };
};

describe("createFrontierSupplyOverlay", () => {
  it("builds a dashed ribbon per route plus a ring on each cut tile", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    overlay.sync(model(), sceneFor, "origin-a", "#3fa9f5");

    const { mesh, geometry, material } = meshes(scene);
    expect(mesh.visible).toBe(true);
    const ring = Array.from(geometry.getAttribute("aRing").array as Float32Array);
    expect(ring.filter((v) => v === 1).length).toBeGreaterThan(0);
    const ringVertex = ring.indexOf(1);
    const position = geometry.getAttribute("position");
    expect(Math.hypot(position.getX(ringVertex), position.getZ(ringVertex))).toBeCloseTo(0.3, 5); // centred on the cut tile
    const distances = Array.from(geometry.getAttribute("aDistance").array as Float32Array);
    expect(Math.max(...distances)).toBeCloseTo(2, 5); // dashes measured along the full two hops
    expect(material.fragmentShader).toContain("discard"); // gaps between dashes
    expect(material.uniforms.uTimeS).toBeUndefined(); // static: nothing animates
    overlay.dispose();
  });

  it("keeps the line at least a pixel wide on screen: vertices sit on the centre line and the shader pushes them out", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    overlay.sync(model(), sceneFor, "origin-a", "#3fa9f5");
    const { mesh, geometry, material } = meshes(scene);
    const position = geometry.getAttribute("position");
    const ring = geometry.getAttribute("aRing");
    const lineVertex = Array.from(ring.array as Float32Array).indexOf(0);
    // Both sides of the ribbon start on the centre line (z = 0 for this east-running route)...
    expect(position.getZ(lineVertex)).toBeCloseTo(0, 5);
    expect(position.getZ(lineVertex + 1)).toBeCloseTo(0, 5);
    // ...with opposite push directions and the world half-width to push by.
    expect(geometry.getAttribute("aSide").getZ(lineVertex)).toBeCloseTo(-geometry.getAttribute("aSide").getZ(lineVertex + 1), 5);
    expect(geometry.getAttribute("aHalf").getX(lineVertex)).toBeGreaterThan(0);
    expect(material.vertexShader).toContain("uMinHalfPx");
    // The viewport size the shader measures pixels in comes from the renderer each frame.
    const renderer = { getSize: (target: Vector2) => target.set(800, 600) } as unknown as WebGLRenderer;
    mesh.onBeforeRender(renderer, scene, undefined as never, geometry, material, undefined as never);
    expect((material.uniforms.uViewport!.value as Vector2).toArray()).toEqual([800, 600]);
    overlay.dispose();
  });

  it("rebuilds only when the model changes (e.g. a reroute) or the origin moves", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    const first = model();
    let placements = 0;
    const counting = (x: number, y: number) => { placements += 1; return sceneFor(x, y); };

    overlay.sync(first, counting, "origin-a", "#3fa9f5");
    const afterFirst = placements;
    overlay.sync(first, counting, "origin-a", "#3fa9f5");
    expect(placements).toBe(afterFirst);

    const rerouted: FrontierSupplyModel = { links: [{ ...first.links[0]!, to: { x: 1, y: 1 }, tip: true }], cuts: first.cuts };
    overlay.sync(rerouted, counting, "origin-a", "#3fa9f5");
    expect(placements).toBeGreaterThan(afterFirst);

    const beforeMove = placements;
    overlay.sync(rerouted, counting, "origin-b", "#3fa9f5");
    expect(placements).toBeGreaterThan(beforeMove);
    overlay.dispose();
  });

  it("hides itself when nothing is fragile", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    overlay.sync({ links: [], cuts: [] }, sceneFor, "origin-a", "#3fa9f5");
    expect(meshes(scene).mesh.visible).toBe(false);
    overlay.dispose();
  });
});
