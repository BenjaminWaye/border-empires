import { MeshDepthMaterial, MeshStandardMaterial, Scene, type InstancedMesh, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";
import { createTownOverlay } from "../client-map-3d-town-overlay.js";
import { applyTownGrowth, TOWN_GROW_RISE, townClockSecondsAt } from "./town-growth-shader.js";
import { TOWN_TIME_PERIOD } from "./town-animation-shaders.js";
import { getTownTierGeometry } from "./town-tier-geometry.js";

const fakeShader = (): WebGLProgramParametersWithUniforms =>
  ({ uniforms: {}, vertexShader: "void main() {\n#include <begin_vertex>\n#include <project_vertex>\n}", fragmentShader: "" }) as unknown as WebGLProgramParametersWithUniforms;

describe("applyTownGrowth", () => {
  it("adds the growth before projection, keeps the material's own hook, and supplies the clock if missing", () => {
    const material = new MeshStandardMaterial();
    let previousRan = false;
    material.onBeforeCompile = () => { previousRan = true; };
    applyTownGrowth(material, true);
    const shader = fakeShader();
    material.onBeforeCompile(shader, undefined as unknown as WebGLRenderer);
    expect(previousRan).toBe(true);
    expect(shader.uniforms.uTownTime).toBeDefined();
    expect(shader.vertexShader).toContain("uniform float uTownTime;");
    expect(shader.vertexShader).toContain("attribute vec2 townGrow;");
    expect(shader.vertexShader.indexOf("townGrow.y > 0.5")).toBeLessThan(shader.vertexShader.indexOf("#include <project_vertex>"));
    expect(material.customProgramCacheKey()).toContain("town-grow-plinth");
  });

  it("maps performance time onto the wrapped town clock", () => {
    expect(townClockSecondsAt(1_500)).toBeCloseTo(1.5);
    expect(townClockSecondsAt((TOWN_TIME_PERIOD + 2) * 1000)).toBeCloseTo(2);
    expect(townClockSecondsAt(-1_000)).toBeCloseTo(TOWN_TIME_PERIOD - 1);
  });
});

describe("town overlay growth attribute", () => {
  it("writes each live instance's growth, plain towns as no growth, without touching the shared tier geometry", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, "CITY", 1, 1);
    overlay.addInstance(1, 0, 0, "CITY", 2, 1, false, { mode: TOWN_GROW_RISE, startSeconds: 12 });
    overlay.commit();
    const body = scene.getObjectByName("town-CITY") as InstancedMesh;
    const followers = scene.children.filter((child) => child.name.startsWith("town-CITY-")) as InstancedMesh[];
    const grow = body.geometry.getAttribute("townGrow");
    expect([grow.getX(0), grow.getY(0), grow.getX(1), grow.getY(1)]).toEqual([0, 0, 12, TOWN_GROW_RISE]);
    for (const follower of followers) expect(follower.geometry.getAttribute("townGrow")).toBe(grow);
    const still = scene.getObjectByName("town-still-CITY") as InstancedMesh;
    expect(still.geometry.getAttribute("townGrow")).toBeUndefined();
    overlay.dispose();
  });
});

describe("town overlay growth lifecycle", () => {
  it("routes an upgrading town through growth and plain towns through addInstance", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 4);
    overlay.addInstanceWithUpgrade(0, 0, 0, "CITY", 1, 1, { x: 1, y: 1, fromTier: "TOWN", tier: "CITY", startedAt: Date.now() });
    overlay.addInstanceWithUpgrade(1, 0, 0, "CITY", 2, 1, undefined);
    overlay.commit();
    expect((scene.getObjectByName("town-TOWN") as InstancedMesh).count).toBe(1);
    expect((scene.getObjectByName("town-CITY") as InstancedMesh).count).toBe(2);
    overlay.dispose();
  });

  it("casts the base plate's shadow with its own growth, not the buildings'", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 2);
    const body = scene.getObjectByName("town-CITY") as InstancedMesh;
    const plinth = scene.getObjectByName("town-CITY-plinth") as InstancedMesh;
    expect(plinth.customDepthMaterial).toBeInstanceOf(MeshDepthMaterial);
    expect(plinth.customDepthMaterial).not.toBe(body.customDepthMaterial);
    expect(plinth.customDepthMaterial!.customProgramCacheKey()).toContain("town-grow-plinth");
    overlay.dispose();
  });

  it("frees its growth copies on dispose without touching the shared tier geometry", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 2);
    const copy = (scene.getObjectByName("town-CITY") as InstancedMesh).geometry;
    const shared = getTownTierGeometry("CITY").body;
    const sharedAttributeNames = Object.keys(shared.attributes);
    const sharedIndex = shared.index;
    let sharedDisposed = false;
    shared.addEventListener("dispose", () => { sharedDisposed = true; });
    let copyDisposed = false;
    copy.addEventListener("dispose", () => { copyDisposed = true; });
    overlay.dispose();
    expect(copyDisposed).toBe(true);
    expect(sharedDisposed).toBe(false);
    expect(Object.keys(shared.attributes)).toEqual(sharedAttributeNames);
    expect(shared.index).toBe(sharedIndex);
    expect(Object.keys(copy.attributes)).toEqual(["townGrow"]);
  });
});
