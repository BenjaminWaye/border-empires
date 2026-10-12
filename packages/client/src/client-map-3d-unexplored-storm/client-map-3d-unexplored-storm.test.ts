import { describe, expect, it } from "vitest";
import { DataTexture, Scene, Vector2 } from "three";
import { HEIGHTFIELD_GRASS_ELEVATION, HEIGHTFIELD_TUNDRA_ELEVATION } from "../client-map-3d-heightfield-terrain.js";
import { createAtmosphere } from "../client-map-3d-atmosphere.js";
import { UNEXPLORED_REVEAL_MS, UNEXPLORED_STORM_Y, createUnexploredStormLayer } from "./client-map-3d-unexplored-storm.js";
import { STORM_FRAGMENT_SHADER } from "./client-map-3d-unexplored-storm-shader.js";

const vec = (storm: { material: { uniforms: Record<string, { value: unknown }> } }, name: string): number[] =>
  (storm.material.uniforms[name]!.value as Vector2).toArray();

describe("unexplored storm layer (3D)", () => {
  it("lies just above the highest flat land, so bumpy ground never buries the coast band", () => {
    expect(UNEXPLORED_STORM_Y).toBeGreaterThanOrEqual(HEIGHTFIELD_GRASS_ELEVATION);
    expect(UNEXPLORED_STORM_Y).toBeGreaterThanOrEqual(HEIGHTFIELD_TUNDRA_ELEVATION + 0.025 + 0.035); // + max jitter + rolling wave
    expect(UNEXPLORED_STORM_Y).toBeLessThan(0.5);
  });

  it("masks out explored tiles over the window plus a one-tile ring", () => {
    const scene = new Scene();
    const storm = createUnexploredStormLayer(scene, () => 5000);
    expect(scene.children).toContain(storm.mesh);
    // Only world tile (100, 200) -- the window's centre -- is explored (and remembered).
    storm.rebuild({ camX: 100, camY: 200, halfW: 2, halfH: 1 }, (wx, wy) => (wx === 100 && wy === 200 ? "fogged" : "unexplored"));
    const mask = storm.material.uniforms.uMask!.value as DataTexture;
    const { width, height, data } = mask.image as { width: number; height: number; data: Uint8Array };
    expect([width, height]).toEqual([7, 5]);
    // Centre texel (i = halfW + 1, j = halfH + 1) is the only explored (R = 0) one.
    const centre = (2 * width + 3) * 4;
    expect(data[centre]).toBe(0);
    expect(Array.from(data).filter((v, k) => k % 4 === 0 && v === 255)).toHaveLength(width * height - 1);
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
      return "visible";
    });
    expect(seen.every(([wx, wy]) => wx >= 0 && wy >= 0)).toBe(true);
    storm.dispose();
  });

  it("is created and torn down by the atmosphere, which rebuilds it with the terrain", () => {
    const scene = new Scene();
    const atmosphere = createAtmosphere(scene);
    expect(scene.children).toContain(atmosphere.unexploredStorm.mesh);
    atmosphere.onTerrainRebuilt({ camX: 101, camY: 202, halfW: 3, halfH: 3 }, () => "unexplored");
    expect(vec(atmosphere.unexploredStorm, "uWorldOrigin")).toEqual([101, 202]);
    atmosphere.updateShadowTarget(3, 4);
    expect(atmosphere.unexploredStorm.mesh.position.x).toBe(3);
    atmosphere.dispose();
    expect(scene.children).not.toContain(atmosphere.unexploredStorm.mesh);
  });

  it("only ever draws on unexplored tiles, and leaves the ring's ground clear up to the storm", () => {
    // Alpha is the hard per-tile mask (explored tiles are never drawn on)
    // times inward edge AA times cover: the storm and brass edge are drawn,
    // the ring's ground before them is left untouched -- no wash.
    expect(STORM_FRAGMENT_SHADER).toMatch(/float alpha = hard \* edgeAa \* coverAlpha;/);
    expect(STORM_FRAGMENT_SHADER).toContain("float coverAlpha = stormCover;");
    const discardAt = STORM_FRAGMENT_SHADER.indexOf("discard");
    const afterDiscard = STORM_FRAGMENT_SHADER.slice(discardAt);
    expect(afterDiscard).not.toMatch(/fwidth|lines\(|texture2D|maskR\(/);
    expect(STORM_FRAGMENT_SHADER.indexOf("discard", discardAt + 1)).toBe(-1);
  });

  it("has no parchment wash or hatching over the ring", () => {
    expect(STORM_FRAGMENT_SHADER).not.toMatch(/uParchment|parchHatch|parchAlpha/);
  });

  it("cuts the coastline from the deep-fog field and keeps deep fog solid storm", () => {
    expect(STORM_FRAGMENT_SHADER).toMatch(/float stormCover = max\(deep, /);
    // The brass edge never draws inside deep fog; the
    // derivative-based width is clamped so tile-to-tile jumps can't balloon
    // it into stray lines.
    expect(STORM_FRAGMENT_SHADER).toMatch(/float brass = \(1\.0 - deep\)/);
    // No rivets: their per-tile ticks read as glowing lines along the border.
    expect(STORM_FRAGMENT_SHADER).not.toMatch(/rivet|uRivet|onGrid/);
    expect(STORM_FRAGMENT_SHADER).toMatch(/float sw = clamp\(fwidth\(s\), 0\.004, 0\.04\);/);
  });

  it("keeps backticks out of the GLSL template (they would end the string)", () => {
    expect(STORM_FRAGMENT_SHADER).not.toContain("\u0060");
  });

  it("rolls the clouds back over UNEXPLORED_REVEAL_MS when tiles become explored, but not on a pan", () => {
    const scene = new Scene();
    let now = 1000;
    const storm = createUnexploredStormLayer(scene, () => now);
    const tick = (): number => {
      storm.mesh.onBeforeRender(undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never);
      return storm.material.uniforms.uRevealT!.value as number;
    };
    const window = { camX: 10, camY: 10, halfW: 2, halfH: 2 };
    storm.rebuild(window, (wx) => (wx < 10 ? "visible" : "unexplored"));
    expect(tick()).toBe(1); // first build: nothing to animate

    storm.rebuild(window, (wx) => (wx <= 10 ? "visible" : "unexplored")); // a column gets explored
    expect(tick()).toBe(0);
    expect(storm.material.uniforms.uPrevMask!.value).not.toBe(storm.material.uniforms.uMask!.value);
    now += UNEXPLORED_REVEAL_MS / 2;
    expect(tick()).toBeCloseTo(0.5, 5);
    now += UNEXPLORED_REVEAL_MS;
    expect(tick()).toBe(1);

    storm.rebuild({ ...window, camX: 11 }, (wx) => (wx <= 10 ? "visible" : "unexplored")); // pan only
    expect(tick()).toBe(1);
    expect(storm.material.uniforms.uPrevMask!.value).toBe(storm.material.uniforms.uMask!.value);
    storm.dispose();
  });

  it("dissolves the cover and soft field from the previous mask and lights the dissolving front", () => {
    for (const line of ["hard = mix(prev.x, hard, smoothstep(0.9, 1.0, revealLocal));", "soft = mix(prev.y, soft, revealLocal);"]) {
      expect(STORM_FRAGMENT_SHADER).toContain(line);
    }
    // deep's per-tile steps cut square holes when blended; it isn't.
    expect(STORM_FRAGMENT_SHADER).not.toMatch(/deep = mix\(/);
    // Sweeps outward from the old land (old soft field), broken up by noise.
    expect(STORM_FRAGMENT_SHADER).toContain("float order = clamp(prev.y * 0.7 + fbm(w * 1.3) * 0.5 - 0.1, 0.0, 1.0);");
    expect(STORM_FRAGMENT_SHADER).toContain("col += uLantern * revealFront * 0.5;");
  });
});
