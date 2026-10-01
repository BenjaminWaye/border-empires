import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Mesh, MeshStandardMaterial, Scene, BoxGeometry, Texture } from "three";
import { resetLightingSettings, setLightingSetting } from "../client-lighting-tuner/client-lighting-tuner-settings.js";
import { applyBuildingEnvMap, setBuildingEnvIntensity } from "./client-map-3d-building-envmap.js";

describe("building env map intensity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
    resetLightingSettings();
  });

  it("scales only materials wired to the building env map", () => {
    const env = new Texture();
    const scene = new Scene();
    const building = new MeshStandardMaterial();
    const other = new MeshStandardMaterial({ envMap: new Texture() });
    applyBuildingEnvMap(building, env);
    scene.add(new Mesh(new BoxGeometry(), building), new Mesh(new BoxGeometry(), [other]));
    setBuildingEnvIntensity(scene, env, 0.25);
    expect(building.envMapIntensity).toBe(0.25);
    expect(other.envMapIntensity).toBe(1);
  });

  it("starts a newly built material at the currently tuned strength", () => {
    setLightingSetting("envIntensity", 0.5);
    const mat = new MeshStandardMaterial();
    applyBuildingEnvMap(mat, new Texture());
    expect(mat.envMapIntensity).toBe(0.5);
  });
});
