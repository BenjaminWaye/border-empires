import { describe, expect, it, vi } from "vitest";
import type { Scene } from "three";

// Never resolves: the stand lift must not depend on the glb having loaded.
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
  GLTFLoader: class {
    load(): void {}
  }
}));

const { createFarmlandOverlay, FARMLAND_BASE_LIFT, FARMLAND_STAND_LIFT } = await import("./client-map-3d-farmland.js");

describe("farmland stand lift", () => {
  const scene = { add: vi.fn(), remove: vi.fn() } as unknown as Scene;

  it("lifts only tiles holding a plot, above the plot's own base lift", () => {
    const overlay = createFarmlandOverlay(scene, 16);
    overlay.addInstance(0.5, 0.5, 1, 12, 34);
    overlay.commit();

    expect(overlay.standLiftAt(12, 34)).toBe(FARMLAND_STAND_LIFT);
    expect(overlay.standLiftAt(12, 35)).toBe(0);
    expect(FARMLAND_STAND_LIFT).toBeGreaterThan(FARMLAND_BASE_LIFT);
  });

  it("forgets plots when the overlay is cleared for a rebuild", () => {
    const overlay = createFarmlandOverlay(scene, 16);
    overlay.addInstance(0.5, 0.5, 1, 12, 34);
    overlay.clear();

    expect(overlay.standLiftAt(12, 34)).toBe(0);
  });
});
