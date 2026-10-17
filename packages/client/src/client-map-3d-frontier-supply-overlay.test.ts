import { describe, expect, it } from "vitest";
import { InstancedBufferGeometry, InstancedMesh, Mesh, Scene, ShaderMaterial } from "three";

import { createFrontierSupplyOverlay } from "./client-map-3d-frontier-supply-overlay.js";
import type { FrontierSupplyModel } from "./client-frontier-supply/client-frontier-supply.js";

const model = (): FrontierSupplyModel => ({
  links: [
    { from: { x: 0, y: 0 }, to: { x: 1, y: 0 }, depthBeyondReach: 1, fragile: false },
    { from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, depthBeyondReach: 2, fragile: true }
  ],
  chokepoints: new Map([
    ["1,0", { x: 1, y: 0, dependentTiles: 2, pinch: true }],
    ["2,0", { x: 2, y: 0, dependentTiles: 1, pinch: false }]
  ])
});
const sceneFor = (x: number, y: number) => ({ sceneX: x, sceneZ: y, surfaceY: 0 });

const meshes = (scene: Scene) => {
  const chevrons = scene.children.find((child): child is Mesh => child instanceof Mesh && !(child instanceof InstancedMesh))!;
  const rings = scene.children.find((child): child is InstancedMesh => child instanceof InstancedMesh)!;
  return { chevrons, rings, geometry: chevrons.geometry as InstancedBufferGeometry, material: chevrons.material as ShaderMaterial };
};

describe("createFrontierSupplyOverlay", () => {
  it("draws two flowing chevrons per supply hop, amber-flagged when fragile, and a ring only on pinch points", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    overlay.sync(model(), sceneFor, "origin-a", "#3fa9f5", 0);

    const { chevrons, rings, geometry } = meshes(scene);
    expect(geometry.instanceCount).toBe(4);
    expect(rings.count).toBe(1);
    expect(chevrons.visible).toBe(true);
    expect(rings.visible).toBe(true);
    // Each instance carries its hop's endpoints; the shader slides it between them.
    expect(Array.from((geometry.getAttribute("aTo").array as Float32Array).slice(0, 3))).toEqual([1, expect.closeTo(0.03, 5), 0]);
    expect(Array.from((geometry.getAttribute("aFragile").array as Float32Array).slice(0, 4))).toEqual([0, 0, 1, 1]);
    overlay.dispose();
  });

  it("animates through the time uniform only, without rebuilding for the same model and origin", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    const m = model();
    let placements = 0;
    const countingSceneFor = (x: number, y: number) => { placements += 1; return sceneFor(x, y); };

    overlay.sync(m, countingSceneFor, "origin-a", "#3fa9f5", 0);
    const afterFirst = placements;
    overlay.sync(m, countingSceneFor, "origin-a", "#3fa9f5", 400);
    expect(placements).toBe(afterFirst);
    expect(meshes(scene).material.uniforms.uFlow!.value).toBeCloseTo(0.25, 5);

    overlay.sync(m, countingSceneFor, "origin-b", "#3fa9f5", 800); // scene origin moved: re-place
    expect(placements).toBeGreaterThan(afterFirst);
    overlay.dispose();
  });

  it("hides itself when there is nothing beyond reach", () => {
    const scene = new Scene();
    const overlay = createFrontierSupplyOverlay(scene);
    overlay.sync({ links: [], chokepoints: new Map() }, sceneFor, "origin-a", "#3fa9f5", 0);
    const { chevrons, rings } = meshes(scene);
    expect(chevrons.visible).toBe(false);
    expect(rings.visible).toBe(false);
    overlay.dispose();
  });
});
