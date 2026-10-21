import { describe, expect, it } from "vitest";
import { FrontSide, MeshStandardMaterial, Scene, type InstancedMesh } from "three";
import { createTownOverlay } from "../client-map-3d-town-overlay.js";

const meshNamed = (scene: Scene, name: string): InstancedMesh =>
  scene.children.find((child) => child.name === name) as InstancedMesh;

describe("town overlay meshes", () => {
  it("stands every town on a polished marble plinth, sharing the body's transforms", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, "CITY", 3, 4);
    overlay.commit();
    const plinth = meshNamed(scene, "town-CITY-plinth");
    expect(plinth.count).toBe(1);
    expect(plinth.material).toBeInstanceOf(MeshStandardMaterial);
    // Its own shader program: the marble finish, not the matte body's town shading.
    const bodyMaterial = meshNamed(scene, "town-CITY").material as MeshStandardMaterial;
    expect((plinth.material as MeshStandardMaterial).customProgramCacheKey()).not.toBe(bodyMaterial.customProgramCacheKey());
    expect((plinth.material as MeshStandardMaterial).customProgramCacheKey()).toContain("marble");
    expect(plinth.instanceMatrix).toBe(meshNamed(scene, "town-CITY").instanceMatrix);
    expect(plinth.castShadow).toBe(true);
    overlay.dispose();
  });

  it("cast shadows from front faces, since the tier geometry has no undersides", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 4);
    for (const name of ["town-CITY", "town-CITY-metal", "town-CITY-glass", "town-CITY-plinth"]) {
      expect((meshNamed(scene, name).material as MeshStandardMaterial).shadowSide, name).toBe(FrontSide);
    }
    overlay.dispose();
  });

  it("hide a tier with no town on screen, so it costs no draw calls", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 4);
    overlay.addInstance(0, 0, 0, "CITY");
    overlay.commit();
    expect(meshNamed(scene, "town-CITY").visible).toBe(true);
    expect(meshNamed(scene, "town-CITY-plinth").visible).toBe(true);
    expect(meshNamed(scene, "town-METROPOLIS").visible).toBe(false);
    expect(meshNamed(scene, "town-METROPOLIS-glow").visible).toBe(false);
    overlay.clear();
    overlay.commit();
    expect(meshNamed(scene, "town-CITY").visible).toBe(false);
    overlay.dispose();
  });

  it("fly no banners", () => {
    const scene = new Scene();
    const overlay = createTownOverlay(scene, 4);
    expect(scene.children.some((child) => child.name.endsWith("-banner"))).toBe(false);
    overlay.dispose();
  });
});
