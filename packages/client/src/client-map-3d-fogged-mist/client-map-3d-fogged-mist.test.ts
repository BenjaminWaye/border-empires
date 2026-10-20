import { describe, expect, it } from "vitest";
import { DataTexture, MeshBasicMaterial, Scene, ShaderLib, Vector2 } from "three";
import { HEIGHTFIELD_TUNDRA_ELEVATION } from "../client-map-3d-heightfield-terrain.js";
import { createAtmosphere } from "../client-map-3d-atmosphere.js";
import { RENDER_ORDER } from "../client-map-3d-render-order.js";
import { UNEXPLORED_STORM_Y } from "../client-map-3d-unexplored-storm/client-map-3d-unexplored-storm.js";
import { FOGGED_MIST_Y, createFoggedMistLayer, encodeFoggedMistMask } from "./client-map-3d-fogged-mist.js";
import { FOGGED_MIST_FRAGMENT_SHADER } from "./client-map-3d-fogged-mist-shader.js";
import { FOGGED_EDGE_COVER_GLSL, applyFoggedEdgeClip } from "./client-map-3d-fogged-edge-clip.js";

const vec = (layer: { material: { uniforms: Record<string, { value: unknown }> } }, name: string): number[] =>
  (layer.material.uniforms[name]!.value as Vector2).toArray();

describe("fogged mist layer (3D)", () => {
  it("lies over the highest flat land and the storm's plane, under gameplay overlays in draw order", () => {
    expect(FOGGED_MIST_Y).toBeGreaterThanOrEqual(HEIGHTFIELD_TUNDRA_ELEVATION + 0.025 + 0.035); // + max jitter + rolling wave
    expect(FOGGED_MIST_Y).toBeGreaterThanOrEqual(UNEXPLORED_STORM_Y);
    // Over the water and fog overlays it hazes; under 13+ overlays (placement previews) and the storm.
    expect(RENDER_ORDER.foggedMist).toBeGreaterThan(RENDER_ORDER.shoreFoam);
    expect(RENDER_ORDER.foggedMist).toBeGreaterThan(RENDER_ORDER.fogDarkenFrontier);
    expect(RENDER_ORDER.foggedMist).toBeLessThan(13);
  });

  it("masks every tile out of sight, with the storm's blurred field to cut its edge from", () => {
    // Only world tile (100, 200) -- the window's centre -- is in sight.
    const mask = encodeFoggedMistMask({ camX: 100, camY: 200, halfW: 2, halfH: 1 }, 1000, 1000,
      (wx, wy) => (wx === 100 && wy === 200 ? "visible" : wx === 99 ? "unexplored" : "fogged"));
    expect([mask.width, mask.height]).toEqual([7, 5]);
    expect(mask.anyFogged).toBe(true);
    const texel = (i: number, j: number): number => (j * mask.width + i) * 4;
    expect(mask.data[texel(3, 2)]).toBe(0); // centre, in sight
    expect(mask.data[texel(4, 2)]).toBe(255); // remembered
    expect(mask.data[texel(2, 2)]).toBe(255); // unexplored: misted too, under the storm
    expect(Array.from(mask.data).filter((v, k) => k % 4 === 0 && v === 255)).toHaveLength(mask.width * mask.height - 1);
    // G is the storm's blurred field, so the edge is cut the same way: lowest beside the tile in sight.
    expect(mask.data[texel(4, 2) + 1]!).toBeLessThan(mask.data[texel(6, 4) + 1]!);
    expect(encodeFoggedMistMask({ camX: 0, camY: 0, halfW: 1, halfH: 1 }, 50, 40, () => "unexplored").anyFogged).toBe(false);
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
    expect(mist.mesh.visible).toBe(false); // nothing remembered yet
    mist.rebuild({ camX: 100, camY: 200, halfW: 2, halfH: 1 }, () => "fogged");
    expect(mist.mesh.visible).toBe(true);
    const texture = mist.material.uniforms.uMask!.value as DataTexture;
    expect([texture.image.width, texture.image.height]).toEqual([7, 5]);
    expect(vec(mist, "uMaskMin")).toEqual([-3, -2]);
    expect(vec(mist, "uMaskSize")).toEqual([7, 5]);
    expect(vec(mist, "uWorldOrigin")).toEqual([100, 200]);
    // The fitted fog overlays read the very same uniforms.
    expect(mist.edgeUniforms.uFogEdgeMask).toBe(mist.material.uniforms.uMask);
    expect(mist.edgeUniforms.uFogEdgeOrigin).toBe(mist.material.uniforms.uWorldOrigin);
    mist.rebuild({ camX: 100, camY: 200, halfW: 2, halfH: 1 }, () => "unexplored");
    expect(mist.mesh.visible).toBe(false); // only the storm out there: no hidden full-screen pass
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

  it("cuts its edge like the storm's coast and discards uncovered pixels before the noise", () => {
    expect(FOGGED_EDGE_COVER_GLSL).toContain("stormExploredDistance(mask, maskMin, maskSize, sceneXZ)");
    expect(FOGGED_EDGE_COVER_GLSL).toContain("stormClearanceField(soft + stormEdgeNoise(worldXZ, time) * 0.1, clearance)");
    const discardAt = FOGGED_MIST_FRAGMENT_SHADER.indexOf("discard");
    expect(FOGGED_MIST_FRAGMENT_SHADER.indexOf("discard", discardAt + 1)).toBe(-1);
    expect(FOGGED_MIST_FRAGMENT_SHADER.indexOf("foggedEdge(")).toBeLessThan(discardAt); // derivatives first
    expect(FOGGED_MIST_FRAGMENT_SHADER.indexOf("stormFbm(w * 0.22")).toBeGreaterThan(discardAt);
  });

  it("fits an overlay to the edge: alpha for the wash, eased to white for the multiply owner tint", () => {
    const uniforms = createFoggedMistLayer(new Scene(), () => 0).edgeUniforms;
    const compile = (mode: "alpha" | "multiply"): { vertexShader: string; fragmentShader: string; uniforms: Record<string, unknown> } => {
      const material = new MeshBasicMaterial();
      applyFoggedEdgeClip(material, uniforms, mode);
      const shader = { vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader, uniforms: {} as Record<string, unknown> };
      material.onBeforeCompile(shader as never, undefined as never);
      return shader;
    };
    const alpha = compile("alpha");
    expect(alpha.uniforms.uFogEdgeMask).toBe(uniforms.uFogEdgeMask);
    expect(alpha.vertexShader).toContain("vFogEdgeSceneXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    expect(alpha.fragmentShader).toMatch(/diffuseColor\.a \*= foggedEdge\([^;]*\)\.y;\n#include <opaque_fragment>/);
    expect(compile("multiply").fragmentShader).toMatch(/outgoingLight = mix\(vec3\(1\.0\), outgoingLight, foggedEdge\([^;]*\)\.y\);\n#include <opaque_fragment>/);
  });
});
