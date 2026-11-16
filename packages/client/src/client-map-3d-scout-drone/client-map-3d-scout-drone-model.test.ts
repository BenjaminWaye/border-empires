import { describe, expect, it } from "vitest";
import { Mesh } from "three";
import { createScoutDroneModel } from "./client-map-3d-scout-drone-model.js";
import { scoutStrobeOn } from "./client-map-3d-scout-drone-lights.js";

describe("Survey Quad model", () => {
  // Only one scout drone is ever drawn (the player's own), so it is budgeted as a single-instance
  // hero asset: dense enough to stay smooth in close-ups, still a small share of the frame.
  it("stays within its triangle and draw-call budget", () => {
    const model = createScoutDroneModel();
    let triangles = 0;
    let meshes = 0;
    model.root.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      meshes += 1;
      const geometry = mesh.geometry;
      triangles += (geometry.index ? geometry.index.count : geometry.getAttribute("position").count) / 3;
    });
    expect(triangles).toBeLessThanOrEqual(9_000);
    expect(meshes).toBeLessThanOrEqual(40);
    model.dispose();
  });

  it("exposes four props, the gimbal stages, the legs and every light", () => {
    const model = createScoutDroneModel();
    expect(model.rotors).toHaveLength(4);
    expect(model.rotorLocal).toHaveLength(4);
    expect(model.gimbalTilt.parent).toBe(model.gimbalPan);
    expect(Object.keys(model.lights).sort()).toEqual(["lens", "navLeft", "navRight", "rec", "status", "strobe"]);
    model.dispose();
  });
});

describe("scoutStrobeOn", () => {
  it("double-flashes: two short pulses, then a pause", () => {
    const on = [0, 50, 100, 170, 260, 900].map(scoutStrobeOn);
    expect(on).toEqual([true, true, false, true, false, false]);
  });
});
