import { describe, expect, it } from "vitest";
import { Scene, Vector2 } from "three";
import { SKIRT_BOTTOM_Y } from "../client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createAtmosphere } from "../client-map-3d-atmosphere.js";
import { UNEXPLORED_STORM_Y, createUnexploredStormLayer } from "./client-map-3d-unexplored-storm.js";

describe("unexplored storm layer (3D)", () => {
  it("sits below the land/sea skirts so drawn tiles always occlude it", () => {
    expect(UNEXPLORED_STORM_Y).toBeLessThan(SKIRT_BOTTOM_Y);
  });

  it("recenters under the camera and anchors the clouds to world coords", () => {
    const scene = new Scene();
    const storm = createUnexploredStormLayer(scene, () => 5000);
    expect(scene.children).toContain(storm.mesh);
    storm.recenter(12, -7);
    expect(storm.mesh.position.x).toBe(12);
    expect(storm.mesh.position.z).toBe(-7);
    storm.setWorldOrigin(300, 410);
    expect((storm.material.uniforms.uWorldOrigin!.value as Vector2).toArray()).toEqual([300, 410]);
    storm.dispose();
    expect(scene.children).not.toContain(storm.mesh);
  });

  it("is created and torn down by the atmosphere, which re-anchors it on terrain rebuilds", () => {
    const scene = new Scene();
    const atmosphere = createAtmosphere(scene);
    expect(scene.children).toContain(atmosphere.unexploredStorm.mesh);
    atmosphere.onTerrainRebuilt(20, 101, 202);
    expect((atmosphere.unexploredStorm.material.uniforms.uWorldOrigin!.value as Vector2).toArray()).toEqual([101, 202]);
    atmosphere.updateShadowTarget(3, 4);
    expect(atmosphere.unexploredStorm.mesh.position.x).toBe(3);
    atmosphere.dispose();
    expect(scene.children).not.toContain(atmosphere.unexploredStorm.mesh);
  });
});
