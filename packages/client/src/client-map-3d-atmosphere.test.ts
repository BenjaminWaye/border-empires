import { describe, expect, it } from "vitest";
import { Scene } from "three";
import { createAtmosphere } from "./client-map-3d-atmosphere.js";

// Regression coverage for a live bug: trees (client-map-3d-forest.ts) and
// most structures (client-map-3d-structure-builder.ts) cast/receive real
// shadows now, but nothing ever enabled the sun as a shadow-casting light or
// sized its shadow-camera frustum -- so every caster still rendered
// unshadowed regardless of its own castShadow flag. Trees in particular read
// as flatly "pasted on" the ground without a shadow anchoring them to it.
describe("createAtmosphere shadow wiring", () => {
  it("configures the sun as a shadow-casting light", () => {
    const scene = new Scene();
    const atmosphere = createAtmosphere(scene);
    expect(atmosphere.sun.castShadow).toBe(true);
    expect(scene.children).toContain(atmosphere.sun.target);
    atmosphere.dispose();
  });

  it("only the sun casts, not the fill/hemi lights (avoids doubling shadow-map cost)", () => {
    const scene = new Scene();
    const atmosphere = createAtmosphere(scene);
    expect(atmosphere.fillLight.castShadow).toBe(false);
    atmosphere.dispose();
  });

  it("updateShadowFrame widens the shadow camera's frustum with the visible-tile radius", () => {
    const scene = new Scene();
    const atmosphere = createAtmosphere(scene);
    atmosphere.updateShadowFrame(10);
    const narrow = atmosphere.sun.shadow.camera.right;
    atmosphere.updateShadowFrame(50);
    const wide = atmosphere.sun.shadow.camera.right;
    expect(wide).toBeGreaterThan(narrow);
    atmosphere.dispose();
  });

  it("updateShadowTarget recenters the shadow frustum while keeping the sun's fixed offset/angle", () => {
    const scene = new Scene();
    const atmosphere = createAtmosphere(scene);
    const beforeOffset = atmosphere.sun.position.clone().sub(atmosphere.sun.target.position);
    atmosphere.updateShadowTarget(37, -12);
    expect(atmosphere.sun.target.position.x).toBe(37);
    expect(atmosphere.sun.target.position.z).toBe(-12);
    const afterOffset = atmosphere.sun.position.clone().sub(atmosphere.sun.target.position);
    // Same offset from target to sun before and after -- the light's angle
    // relative to the ground never changes, only where the frustum centers.
    expect(afterOffset.x).toBeCloseTo(beforeOffset.x, 6);
    expect(afterOffset.y).toBeCloseTo(beforeOffset.y, 6);
    expect(afterOffset.z).toBeCloseTo(beforeOffset.z, 6);
    atmosphere.dispose();
  });
});
