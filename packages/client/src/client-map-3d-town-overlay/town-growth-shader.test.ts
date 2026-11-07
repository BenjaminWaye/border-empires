import { MeshStandardMaterial, Scene, type InstancedMesh, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";
import { createTownOverlay } from "../client-map-3d-town-overlay.js";
import { applyTownGrowth, TOWN_GROW_RISE, townClockSecondsAt } from "./town-growth-shader.js";
import { TOWN_TIME_PERIOD } from "./town-animation-shaders.js";

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
