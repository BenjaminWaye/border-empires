import { describe, expect, it } from "vitest";
import { BufferGeometry, Mesh, Scene, ShaderMaterial, Vector2, type WebGLRenderer } from "three";

import { createFrontierSupplyOverlay } from "./client-map-3d-frontier-supply-overlay.js";
import type { FrontierSupplyModel } from "./client-frontier-supply/client-frontier-supply.js";

const model = (): FrontierSupplyModel => ({
  links: [
    { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, tip: false },
    { from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, tip: true }
  ],
  cuts: [{ x: 1, y: 0 }]
});
const sceneFor = (x: number, y: number) => ({ sceneX: x, sceneZ: y, surfaceY: 0 });

const meshes = (scene: Scene) => {
  const mesh = scene.children.find((child): child is Mesh => child instanceof Mesh)!;
  return { mesh, geometry: mesh.geometry as BufferGeometry, material: mesh.material as ShaderMaterial };
};

describe("createFrontierSupplyOverlay", () => {
  it("builds one ribbon per route, with no arrowhead at the tip, plus a ring on each cut tile", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    overlay.sync(model(), sceneFor, "origin-a", "#3fa9f5", 0);

    const { mesh, geometry } = meshes(scene);
    expect(mesh.visible).toBe(true);
    const kind = Array.from(geometry.getAttribute("aKind").array as Float32Array);
    // Only ribbon (0) and ring (1) vertices; ribbon vertices come in side pairs, so no arrowhead triangle.
    expect([...new Set(kind)].sort()).toEqual([0, 1]);
    expect(kind.filter((v) => v === 0).length % 2).toBe(0);
    const ringVertex = kind.indexOf(1);
    expect(ringVertex).toBeGreaterThanOrEqual(0);
    const position = geometry.getAttribute("position");
    const ringDistance = Math.hypot(position.getX(ringVertex) - 1, position.getZ(ringVertex));
    expect(ringDistance).toBeGreaterThan(0.25); // centred on the cut tile (1,0)
    expect(ringDistance).toBeLessThan(0.4);
    const distances = Array.from(geometry.getAttribute("aDistance").array as Float32Array);
    expect(Math.max(...distances)).toBeCloseTo(2, 5); // pulses travel the full two hops
    overlay.dispose();
  });

  it("keeps the route and ring at least a pixel wide on screen: vertices sit on the centre line and the shader pushes them out", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    overlay.sync(model(), sceneFor, "origin-a", "#3fa9f5", 0);
    const { mesh, geometry, material } = meshes(scene);
    const position = geometry.getAttribute("position");
    const lineVertex = Array.from(geometry.getAttribute("aKind").array as Float32Array).indexOf(0);
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

  it("wraps its clock to the pulse period, so long sessions don't run out of GPU float precision", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    overlay.sync(model(), sceneFor, "origin-a", "#3fa9f5", 3_600_000 + 500); // an hour in
    expect(meshes(scene).material.uniforms.uTimeS!.value).toBeCloseTo(0.5, 5);
    overlay.dispose();
  });

  it("animates through uniforms only (pulses and the ring's breath), and rebuilds when the model changes or the origin moves", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    const first = model();
    let placements = 0;
    const counting = (x: number, y: number) => { placements += 1; return sceneFor(x, y); };

    overlay.sync(first, counting, "origin-a", "#3fa9f5", 0);
    const afterFirst = placements;
    const { material } = meshes(scene);
    const ringAlpha0 = material.uniforms.uRingAlpha!.value as number;
    overlay.sync(first, counting, "origin-a", "#3fa9f5", 1000);
    expect(placements).toBe(afterFirst);
    expect(material.uniforms.uTimeS!.value).toBeCloseTo(1, 5);
    expect(material.uniforms.uRingAlpha!.value).not.toBeCloseTo(ringAlpha0, 2);

    const rerouted: FrontierSupplyModel = { links: [{ ...first.links[0]!, to: { x: 1, y: 1 }, tip: true }], cuts: first.cuts };
    overlay.sync(rerouted, counting, "origin-a", "#3fa9f5", 1100);
    expect(placements).toBeGreaterThan(afterFirst);

    const beforeMove = placements;
    overlay.sync(rerouted, counting, "origin-b", "#3fa9f5", 1200);
    expect(placements).toBeGreaterThan(beforeMove);
    overlay.dispose();
  });

  it("hides itself when nothing is fragile", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    overlay.sync({ links: [], cuts: [] }, sceneFor, "origin-a", "#3fa9f5", 0);
    expect(meshes(scene).mesh.visible).toBe(false);
    overlay.dispose();
  });
});
