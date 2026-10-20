import { describe, expect, it } from "vitest";
import { DataTexture, Scene, Vector2 } from "three";
import { HEIGHTFIELD_TUNDRA_ELEVATION } from "../client-map-3d-heightfield-terrain.js";
import { createAtmosphere } from "../client-map-3d-atmosphere.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import { UNEXPLORED_STORM_Y } from "../client-map-3d-unexplored-storm/client-map-3d-unexplored-storm.js";
import { FOGGED_MIST_Y, createFoggedMistLayer, encodeFoggedMistMask } from "./client-map-3d-fogged-mist.js";
import { FOGGED_MIST_FRAGMENT_SHADER } from "./client-map-3d-fogged-mist-shader.js";
import { foggedWashInMist } from "./client-map-3d-fogged-tile-overlay.js";

const vec = (layer: { material: { uniforms: Record<string, { value: unknown }> } }, name: string): number[] =>
  (layer.material.uniforms[name]!.value as Vector2).toArray();

describe("fogged mist layer (3D)", () => {
  it("lies over the highest flat land and the storm's plane, under the storm's draw order", () => {
    expect(FOGGED_MIST_Y).toBeGreaterThanOrEqual(HEIGHTFIELD_TUNDRA_ELEVATION + 0.025 + 0.035); // + max jitter + rolling wave
    expect(FOGGED_MIST_Y).toBeGreaterThanOrEqual(UNEXPLORED_STORM_Y);
    expect(RENDER_ORDER.foggedMist).toBeGreaterThan(RENDER_ORDER.riverMouth);
    expect(RENDER_ORDER.foggedMist).toBeLessThan(RENDER_ORDER.unexploredStorm);
  });

  it("masks every tile out of sight (R) and flags the land whose wash it draws (A)", () => {
    // Only world tile (100, 200) -- the window's centre -- is in sight; (101, 200) is washed by the mist.
    const mask = encodeFoggedMistMask({ camX: 100, camY: 200, halfW: 2, halfH: 1 }, 1000, 1000,
      (wx, wy) => (wx === 100 && wy === 200 ? "visible" : wx === 99 ? "unexplored" : "fogged"),
      (wx, wy) => wx === 101 && wy === 200);
    expect([mask.width, mask.height]).toEqual([7, 5]);
    const texel = (i: number, j: number): number => (j * mask.width + i) * 4;
    expect(mask.data[texel(3, 2)]).toBe(0); // centre, in sight
    expect(mask.data[texel(4, 2)]).toBe(255); // remembered
    expect(mask.data[texel(2, 2)]).toBe(255); // unexplored: misted too, under the storm
    expect(Array.from(mask.data).filter((v, k) => k % 4 === 0 && v === 255)).toHaveLength(mask.width * mask.height - 1);
    expect(mask.data[texel(4, 2) + 3]).toBe(255);
    expect(Array.from(mask.data).filter((v, k) => k % 4 === 3 && v === 255)).toHaveLength(1);
    // G is the storm's blurred field, so the edge is cut the same way: lowest beside the tile in sight.
    expect(mask.data[texel(4, 2) + 1]!).toBeLessThan(mask.data[texel(6, 4) + 1]!);
  });

  it("wraps mask lookups across the world seam", () => {
    const seen: Array<[number, number]> = [];
    encodeFoggedMistMask({ camX: 0, camY: 0, halfW: 1, halfH: 1 }, 50, 40, (wx, wy) => {
      seen.push([wx, wy]);
      return "fogged";
    });
    expect(seen).toContainEqual([49, 39]);
    expect(seen.every(([wx, wy]) => wx >= 0 && wx < 50 && wy >= 0 && wy < 40)).toBe(true);
  });

  it("rebuilds its mask and anchors over the terrain window", () => {
    const scene = new Scene();
    const mist = createFoggedMistLayer(scene, () => 5000);
    expect(scene.children).toContain(mist.mesh);
    mist.rebuild({ camX: 100, camY: 200, halfW: 2, halfH: 1 }, () => "fogged", () => true);
    const texture = mist.material.uniforms.uMask!.value as DataTexture;
    expect([texture.image.width, texture.image.height]).toEqual([7, 5]);
    expect(vec(mist, "uMaskMin")).toEqual([-3, -2]);
    expect(vec(mist, "uMaskSize")).toEqual([7, 5]);
    expect(vec(mist, "uWorldOrigin")).toEqual([100, 200]);
    mist.recenter(12, -7);
    expect([mist.mesh.position.x, mist.mesh.position.z]).toEqual([12, -7]);
    mist.dispose();
    expect(scene.children).not.toContain(mist.mesh);
  });

  it("is created, recentred, rebuilt and torn down by the atmosphere", () => {
    const scene = new Scene();
    const atmosphere = createAtmosphere(scene);
    expect(scene.children).toContain(atmosphere.foggedMist.mesh);
    atmosphere.onTerrainRebuilt({ camX: 101, camY: 202, halfW: 3, halfH: 3 }, () => "fogged");
    expect(vec(atmosphere.foggedMist, "uWorldOrigin")).toEqual([101, 202]);
    atmosphere.updateShadowTarget(3, 4);
    expect([atmosphere.foggedMist.mesh.position.x, atmosphere.foggedMist.mesh.position.z]).toEqual([3, 4]);
    atmosphere.dispose();
    expect(scene.children).not.toContain(atmosphere.foggedMist.mesh);
  });

  it("cuts its edge like the storm's coast, just past the tiles in sight, with one discard after every texture read", () => {
    expect(FOGGED_MIST_FRAGMENT_SHADER).toContain("stormExploredDistance(uMask, uMaskMin, uMaskSize, vSceneXZ)");
    expect(FOGGED_MIST_FRAGMENT_SHADER).toContain("stormClearanceField(soft + stormEdgeNoise(w, uTime) * 0.1, clearance)");
    expect(FOGGED_MIST_FRAGMENT_SHADER).toContain("smoothstep(STORM_EDGE - sw, STORM_EDGE + sw * 2.0, s)");
    const discardAt = FOGGED_MIST_FRAGMENT_SHADER.indexOf("discard");
    expect(FOGGED_MIST_FRAGMENT_SHADER.slice(discardAt)).not.toMatch(/fwidth|texture2D/);
    expect(FOGGED_MIST_FRAGMENT_SHADER.indexOf("discard", discardAt + 1)).toBe(-1);
  });

  it("draws the wash itself only on flat fogged land; hills and mountains rise through the sheet", () => {
    expect(foggedWashInMist("LAND", false)).toBe(true);
    expect(foggedWashInMist("LAND", true)).toBe(false);
    expect(foggedWashInMist("MOUNTAIN", false)).toBe(false);
    expect(foggedWashInMist("SEA", false)).toBe(false);
  });
});
