import { describe, expect, it } from "vitest";
import { Mesh } from "three";
import { createScoutDroneModel } from "./client-map-3d-scout-drone-model.js";
import { applyScoutDroneLights, scoutStrobeOn } from "./client-map-3d-scout-drone-lights.js";

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

describe("the strobe", () => {
  it("is a tiny sharp point while it flashes, and fully dark between flashes", () => {
    const model = createScoutDroneModel();
    const strobe = model.lights.strobe;
    applyScoutDroneLights(model, 1, 0.5, true, 20, true);
    expect(strobe.glow.visible).toBe(true);
    expect(strobe.glow.scale.x).toBeLessThanOrEqual(0.03);
    applyScoutDroneLights(model, 1, 0.5, true, 600, true);
    expect(strobe.glow.visible).toBe(false);
    expect(strobe.bead.emissiveIntensity).toBe(0);
    model.dispose();
  });

  it("grows only the camera-lens halo with distance, not the other lights", () => {
    const model = createScoutDroneModel();
    applyScoutDroneLights(model, 1, 0.5, true, 600, true, 0);
    const near = model.lights.lens.glow.scale.x;
    const nav = model.lights.navLeft.glow.scale.x;
    applyScoutDroneLights(model, 1, 0.5, true, 600, true, 1);
    expect(model.lights.lens.glow.scale.x).toBeGreaterThan(near * 2);
    expect(model.lights.navLeft.glow.scale.x).toBe(nav);
    model.dispose();
  });
});
