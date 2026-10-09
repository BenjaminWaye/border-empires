import { describe, expect, it } from "vitest";
import { DataTexture, Scene, Vector2 } from "three";
import { HEIGHTFIELD_GRASS_ELEVATION, HEIGHTFIELD_TUNDRA_ELEVATION } from "../client-map-3d-heightfield-terrain.js";
import { createAtmosphere } from "../client-map-3d-atmosphere.js";
import { UNEXPLORED_STORM_Y, createUnexploredStormLayer } from "./client-map-3d-unexplored-storm.js";

const vec = (storm: { material: { uniforms: Record<string, { value: unknown }> } }, name: string): number[] =>
  (storm.material.uniforms[name]!.value as Vector2).toArray();

describe("unexplored storm layer (3D)", () => {
  it("lies level with (just above) ordinary land, not sunk below the terrain", () => {
    expect(UNEXPLORED_STORM_Y).toBeGreaterThanOrEqual(HEIGHTFIELD_GRASS_ELEVATION);
    expect(UNEXPLORED_STORM_Y).toBeGreaterThanOrEqual(HEIGHTFIELD_TUNDRA_ELEVATION);
    expect(UNEXPLORED_STORM_Y).toBeLessThan(0.5);
  });

  it("masks out explored tiles over the window plus a one-tile ring", () => {
    const scene = new Scene();
    const storm = createUnexploredStormLayer(scene, () => 5000);
    expect(scene.children).toContain(storm.mesh);
    // Only world tile (100, 200) -- the window's centre -- is explored.
    storm.rebuild({ camX: 100, camY: 200, halfW: 2, halfH: 1 }, (wx, wy) => wx === 100 && wy === 200);
    const mask = storm.material.uniforms.uMask!.value as DataTexture;
    const { width, height, data } = mask.image as { width: number; height: number; data: Uint8Array };
    expect([width, height]).toEqual([7, 5]);
    // Centre texel (i = halfW + 1, j = halfH + 1) is explored, everything else fog.
    expect(data[2 * width + 3]).toBe(0);
    expect(Array.from(data).filter((v) => v === 255)).toHaveLength(width * height - 1);
    expect(vec(storm, "uMaskMin")).toEqual([-3, -2]);
    expect(vec(storm, "uMaskSize")).toEqual([7, 5]);
    expect(vec(storm, "uWorldOrigin")).toEqual([100, 200]);
    storm.recenter(12, -7);
    expect([storm.mesh.position.x, storm.mesh.position.z]).toEqual([12, -7]);
    storm.dispose();
    expect(scene.children).not.toContain(storm.mesh);
  });

  it("wraps mask lookups across the world seam", () => {
    const scene = new Scene();
    const storm = createUnexploredStormLayer(scene, () => 0);
    const seen: Array<[number, number]> = [];
    storm.rebuild({ camX: 0, camY: 0, halfW: 0, halfH: 0 }, (wx, wy) => {
      seen.push([wx, wy]);
      return true;
    });
    expect(seen.every(([wx, wy]) => wx >= 0 && wy >= 0)).toBe(true);
    storm.dispose();
  });

  it("is created and torn down by the atmosphere, which rebuilds it with the terrain", () => {
    const scene = new Scene();
    const atmosphere = createAtmosphere(scene);
    expect(scene.children).toContain(atmosphere.unexploredStorm.mesh);
    atmosphere.onTerrainRebuilt({ camX: 101, camY: 202, halfW: 3, halfH: 3 }, () => false);
    expect(vec(atmosphere.unexploredStorm, "uWorldOrigin")).toEqual([101, 202]);
    atmosphere.updateShadowTarget(3, 4);
    expect(atmosphere.unexploredStorm.mesh.position.x).toBe(3);
    atmosphere.dispose();
    expect(scene.children).not.toContain(atmosphere.unexploredStorm.mesh);
  });
});
