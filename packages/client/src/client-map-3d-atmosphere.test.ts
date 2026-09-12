import { describe, expect, it, vi } from "vitest";
import { Scene, Texture, type WebGLRenderer } from "three";
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
    atmosphere.updateShadowFrame(20);
    const wide = atmosphere.sun.shadow.camera.right;
    expect(wide).toBeGreaterThan(narrow);
    atmosphere.dispose();
  });

  // Regression: at max zoom-out the visible-tile half-extent can run past 50
  // tiles, which spreads the shadow map's fixed texel grid thin enough
  // relative to trunk/wall-scale geometry to read as acne (surfaces
  // flickering self-shadowed) rather than a clean shadow -- exactly what
  // made buildings still look dark/unlit even with castShadow/receiveShadow
  // on. The frustum now silently stops growing past a cap instead of
  // spreading indefinitely thin.
  it("caps the shadow frustum's half-extent instead of growing indefinitely at extreme zoom-out", () => {
    const scene = new Scene();
    const atmosphere = createAtmosphere(scene);
    atmosphere.updateShadowFrame(60);
    const cappedAt60 = atmosphere.sun.shadow.camera.right;
    atmosphere.updateShadowFrame(200);
    const cappedAt200 = atmosphere.sun.shadow.camera.right;
    expect(cappedAt200).toBe(cappedAt60);
    atmosphere.dispose();
  });

  // Requested directly ("make the shadow a bit lighter") -- a fully-dark
  // shadow (the three.js default, shadow.intensity = 1) also fought the
  // ownership-tint overlay's multiply blend by making a shadowed owned tile
  // read as near-black instead of a visibly-tinted darker patch.
  it("softens the shadow instead of using the fully-dark three.js default", () => {
    const scene = new Scene();
    const atmosphere = createAtmosphere(scene);
    expect(atmosphere.sun.shadow.intensity).toBeLessThan(1);
    expect(atmosphere.sun.shadow.intensity).toBeGreaterThan(0);
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

// Regression coverage for a live bug: structure materials (mintworks and
// most other buildings) use non-trivial MeshStandardMaterial `metalness`
// (0.2-0.9), while three.js scales a metallic surface's diffuse response
// toward zero -- it's lit almost entirely by specular reflection of
// `scene.environment`, not by AmbientLight/HemisphereLight/DirectionalLight
// the way `metalness: 0` tree materials (client-map-3d-forest.ts) are.
// Nothing ever set `scene.environment`, so every metallic building rendered
// near-black regardless of the hemi/sun/fill boost above, while trees
// (metalness 0) looked correctly lit. This exercises the wiring with an
// injected fake bake (no real WebGL context available in this test env)
// rather than the real PMREM generation, which three.js itself owns.
describe("createAtmosphere building-material lighting", () => {
  it("bakes and assigns an environment texture for metallic structure materials to reflect", () => {
    const scene = new Scene();
    const fakeRenderer = {} as WebGLRenderer;
    const fakeTexture = new Texture();
    const atmosphere = createAtmosphere(scene, fakeRenderer, () => fakeTexture);
    expect(scene.environment).toBe(fakeTexture);
    atmosphere.dispose();
  });

  it("disposes the environment texture along with the rest of the atmosphere", () => {
    const scene = new Scene();
    const fakeRenderer = {} as WebGLRenderer;
    const fakeTexture = new Texture();
    const disposeSpy = vi.spyOn(fakeTexture, "dispose");
    const atmosphere = createAtmosphere(scene, fakeRenderer, () => fakeTexture);
    atmosphere.dispose();
    expect(disposeSpy).toHaveBeenCalledOnce();
    expect(scene.environment).toBeNull();
  });

  it("leaves scene.environment unset when no renderer is available (test-only path)", () => {
    const scene = new Scene();
    const atmosphere = createAtmosphere(scene);
    expect(scene.environment).toBeNull();
    atmosphere.dispose();
  });
});
