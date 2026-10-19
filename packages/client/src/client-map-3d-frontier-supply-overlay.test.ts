import { describe, expect, it } from "vitest";
import { BufferGeometry, Mesh, Scene, ShaderMaterial } from "three";

import { createFrontierSupplyOverlay } from "./client-map-3d-frontier-supply-overlay.js";
import type { FrontierSupplyModel } from "./client-frontier-supply/client-frontier-supply.js";

const model = (): FrontierSupplyModel => ({
  links: [
    { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, depthBeyondReach: 1, downstream: 2, tip: false },
    { from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, depthBeyondReach: 2, downstream: 1, tip: true }
  ]
});
const sceneFor = (x: number, y: number) => ({ sceneX: x, sceneZ: y, surfaceY: 0 });

const meshes = (scene: Scene) => {
  const routes = scene.children.find((child): child is Mesh => child instanceof Mesh)!;
  return { routes, geometry: routes.geometry as BufferGeometry, material: routes.material as ShaderMaterial };
};

describe("createFrontierSupplyOverlay", () => {
  it("builds one ribbon per route with no arrowhead at the tip", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    overlay.sync(model(), sceneFor, "origin-a", "#3fa9f5", 0);

    const { routes, geometry } = meshes(scene);
    expect(routes.visible).toBe(true);
    // Only ribbon vertices, in pairs across the route: no extra arrowhead triangle at the tip.
    expect(geometry.getAttribute("position").count % 2).toBe(0);
    expect(geometry.getAttribute("aTip")).toBeUndefined();
    const distances = Array.from(geometry.getAttribute("aDistance").array as Float32Array);
    expect(Math.max(...distances)).toBeCloseTo(2, 5); // pulses travel the full two hops
    overlay.dispose();
  });

  it("animates through the time uniform only, and rebuilds when the model changes (e.g. a reroute) or the origin moves", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    const first = model();
    let placements = 0;
    const counting = (x: number, y: number) => { placements += 1; return sceneFor(x, y); };

    overlay.sync(first, counting, "origin-a", "#3fa9f5", 0);
    const afterFirst = placements;
    overlay.sync(first, counting, "origin-a", "#3fa9f5", 500);
    expect(placements).toBe(afterFirst);
    expect(meshes(scene).material.uniforms.uTimeS!.value).toBeCloseTo(0.5, 5);

    const rerouted: FrontierSupplyModel = { links: [{ ...first.links[0]!, to: { x: 1, y: 1 }, tip: true }] };
    overlay.sync(rerouted, counting, "origin-a", "#3fa9f5", 600);
    expect(placements).toBeGreaterThan(afterFirst);

    const beforeMove = placements;
    overlay.sync(rerouted, counting, "origin-b", "#3fa9f5", 700);
    expect(placements).toBeGreaterThan(beforeMove);
    overlay.dispose();
  });

  it("hides itself when there is nothing beyond reach", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    overlay.sync({ links: [] }, sceneFor, "origin-a", "#3fa9f5", 0);
    expect(meshes(scene).routes.visible).toBe(false);
    overlay.dispose();
  });
});
