import { describe, expect, it } from "vitest";
import { DataTexture, Scene, Vector2 } from "three";
import { HEIGHTFIELD_GRASS_ELEVATION, HEIGHTFIELD_TUNDRA_ELEVATION } from "../client-map-3d-heightfield-terrain.js";
import { createAtmosphere } from "../client-map-3d-atmosphere.js";
import { UNEXPLORED_REVEAL_MS, UNEXPLORED_STORM_Y, createUnexploredStormLayer } from "./client-map-3d-unexplored-storm.js";
import { STORM_FIELD_GLSL } from "./client-map-3d-unexplored-storm-field-glsl.js";
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
    // Alpha comes from the continuous contour: the storm and brass edge are drawn,
    // the ring's ground before them is left untouched -- no wash.
    expect(STORM_FRAGMENT_SHADER).toContain("float alpha = coverAlpha;");
    expect(STORM_FRAGMENT_SHADER).toContain("float coverAlpha = stormCover;");
    const discardAt = STORM_FRAGMENT_SHADER.indexOf("discard");
    const afterDiscard = STORM_FRAGMENT_SHADER.slice(discardAt);
    expect(afterDiscard).not.toMatch(/fwidth|lines\(|texture2D|maskR\(/);
    expect(STORM_FRAGMENT_SHADER.indexOf("discard", discardAt + 1)).toBe(-1);
  });

  it("keeps reveal opacity continuous across tile seams", () => {
    // A fractional neighbour used to multiply opacity at this tile's edge
    // (edgeAa), but not just inside the neighbour. A moving brass contour
    // crossing that seam was cut by a transparent tile-shaped notch.
    // Clearance already makes the contour vanish on fully explored land.
    expect(STORM_FRAGMENT_SHADER).not.toMatch(/maskR|edgeAa|float hard|uvTile/);
    expect(STORM_FRAGMENT_SHADER).toContain("float alpha = coverAlpha;");
    // Deep fog must also come from the continuous field: a texel-centre
    // override can switch cloud coverage and brass off at a tile boundary.
    expect(STORM_FRAGMENT_SHADER).toContain("smoothstep(0.97, 0.995, soft)");
  });

  it("has no parchment wash or hatching over the ring", () => {
    expect(STORM_FRAGMENT_SHADER).not.toMatch(/uParchment|parchHatch|parchAlpha/);
  });

  it("keeps the rain streaks thin and faint, not diagonal hatching stripes", () => {
    expect(STORM_FRAGMENT_SHADER).toContain("float hatch = lines(hatchCoord, 0.04);");
    expect(STORM_FRAGMENT_SHADER).toContain("storm = mix(storm, uInk, hatch * (0.03 + smoothstep(0.25, 0.85, density) * 0.12));");
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

  it("pulls the storm forward in depth so the brass line never depth-fights the ground pressed under it", () => {
    const storm = createUnexploredStormLayer(new Scene());
    expect(storm.material.polygonOffset).toBe(true);
    expect(storm.material.polygonOffsetFactor).toBeLessThan(0);
    expect(storm.material.polygonOffsetUnits).toBeLessThan(0);
    storm.dispose();
  });

  it("keeps the contour clear of explored land, so a tile's square corner never pokes past the brass edge", () => {
    expect(STORM_FIELD_GLSL).toContain("const float STORM_CLEARANCE = 0.2;");
    expect(STORM_FIELD_GLSL).toContain("return min(s, STORM_EDGE * exploredDistance / STORM_CLEARANCE);");
    expect(STORM_FRAGMENT_SHADER).toContain("float s = stormClearanceField(soft + edgeNoise * 0.1, clearance);");
  });

  it("keeps backticks out of the GLSL template (they would end the string)", () => {
    expect(STORM_FRAGMENT_SHADER).not.toContain("\u0060");
  });

  it("rolls the clouds back per tile by re-encoding its mask each frame, until done", () => {
    const scene = new Scene();
    let now = 1000;
    const storm = createUnexploredStormLayer(scene, () => now);
    const frame = (): Uint8Array => {
      storm.mesh.onBeforeRender(undefined as never, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never);
      return Uint8Array.from((storm.material.uniforms.uMask!.value as DataTexture).image.data as Uint8Array);
    };
    const window = { camX: 10, camY: 10, halfW: 2, halfH: 2 };
    storm.rebuild(window, (wx) => (wx < 10 ? "visible" : "unexplored"));
    storm.rebuild(window, (wx) => (wx <= 10 ? "visible" : "unexplored")); // a column gets explored
    const start = frame();
    now += UNEXPLORED_REVEAL_MS / 2 + 200;
    const mid = frame();
    expect(mid).not.toEqual(start);
    now += UNEXPLORED_REVEAL_MS * 2;
    const end = frame();
    now += 100;
    expect(frame()).toEqual(end); // settled: no more uploads change it
    storm.dispose();
  });

  it("has no two-mask cross-fade left: a partly explored tile keeps its cloud while the contour pulls back", () => {
    expect(STORM_FRAGMENT_SHADER).not.toMatch(/uPrevMask|uRevealT|prevMaskAt/);
    expect(STORM_FRAGMENT_SHADER).toContain("float alpha = coverAlpha;");
    expect(STORM_FIELD_GLSL).toContain("best = min(best, length(q) + unexplored);");
    expect(STORM_FRAGMENT_SHADER).toContain("col += uLantern * revealFront * 0.5;");
  });
});
