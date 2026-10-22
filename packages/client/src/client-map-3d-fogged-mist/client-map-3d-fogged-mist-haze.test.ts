import { describe, expect, it } from "vitest";
import { InstancedMesh, BoxGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, Scene, ShaderLib, type Material } from "three";
import { createTreeMaterial } from "../client-map-3d-trees/client-map-3d-tree-material.js";
import { markUnexploredStormClip } from "../client-map-3d-unexplored-storm/client-map-3d-unexplored-storm-clip.js";
import { FOGGED_MIST_Y, createFoggedMistLayer } from "./client-map-3d-fogged-mist.js";
import { applyFoggedMistHaze, applyFoggedMistHazeToScene } from "./client-map-3d-fogged-mist-haze.js";

const isHazed = (material: Material): boolean => material.customProgramCacheKey().includes("foggedMistHaze");

describe("fogged mist haze on features rising out of the mist (3D)", () => {
  it("hazes the trees, peaks and hills standing in remembered land once the mist is rebuilt", () => {
    // Regression: the mist sheet is flat, so tree crowns rose out of it unhazed and read as drawn on top of the fog.
    const scene = new Scene();
    const tree = createTreeMaterial();
    const peak = markUnexploredStormClip(new MeshLambertMaterial());
    const ground = markUnexploredStormClip(new MeshStandardMaterial(), "ground");
    const overlay = new MeshBasicMaterial();
    scene.add(new InstancedMesh(new BoxGeometry(), tree, 4), new Mesh(new BoxGeometry(), [peak, ground]), new Mesh(new BoxGeometry(), overlay));
    const mist = createFoggedMistLayer(scene, () => 0);
    expect(mist.hazeUniforms.uFogMistOn.value).toBe(0);
    mist.rebuild({ camX: 10, camY: 10, halfW: 2, halfH: 2 }, () => "fogged");
    expect([tree, peak, ground].map(isHazed)).toEqual([true, true, true]);
    expect(isHazed(overlay)).toBe(false);
    expect(mist.hazeUniforms.uFogMistOn.value).toBe(1);
    expect(mist.hazeUniforms.uFogMistPlaneY.value).toBe(FOGGED_MIST_Y);
    // Same uniforms as the sheet, so the haze drifts and edges with it.
    expect(mist.hazeUniforms.uFogMistMask).toBe(mist.material.uniforms.uMask);
    expect(mist.hazeUniforms.uFogMistTime).toBe(mist.material.uniforms.uTime);
    mist.rebuild({ camX: 10, camY: 10, halfW: 2, halfH: 2 }, () => "unexplored");
    expect(mist.hazeUniforms.uFogMistOn.value).toBe(0); // sheet hidden: no haze either
  });

  it("patches each material once across rebuilds", () => {
    const scene = new Scene();
    const tree = createTreeMaterial();
    scene.add(new Mesh(new BoxGeometry(), tree));
    const uniforms = createFoggedMistLayer(new Scene(), () => 0).hazeUniforms;
    const patched = new WeakSet<Material>();
    applyFoggedMistHazeToScene(scene, uniforms, patched);
    applyFoggedMistHazeToScene(scene, uniforms, patched);
    expect(tree.customProgramCacheKey().split("foggedMistHaze")).toHaveLength(2);
  });

  it("blends the sheet's own shade after lighting, only above the sheet, keeping the material's own shader edits", () => {
    const uniforms = createFoggedMistLayer(new Scene(), () => 0).hazeUniforms;
    const compile = (material: Material, lib: "standard" | "lambert"): { vertexShader: string; fragmentShader: string; uniforms: Record<string, unknown> } => {
      applyFoggedMistHaze(material, uniforms);
      const shader = { vertexShader: ShaderLib[lib].vertexShader, fragmentShader: ShaderLib[lib].fragmentShader, uniforms: {} as Record<string, unknown> };
      material.onBeforeCompile(shader as never, undefined as never);
      return shader;
    };
    const tree = compile(createTreeMaterial(), "standard");
    expect(tree.uniforms.uFogMistMask).toBe(uniforms.uFogMistMask);
    expect(tree.uniforms.uTreeWindTime).toBeDefined(); // the tree's wind survives
    expect(tree.vertexShader).toContain("fogMistLocal = instanceMatrix * fogMistLocal;");
    expect(tree.fragmentShader).toMatch(/#include <colorspace_fragment>\n\s*if \(uFogMistOn > 0\.5 && vFogMistScene\.y > uFogMistPlaneY\)/);
    expect(tree.fragmentShader).toContain("foggedMistShade(uFogMistMask");
    expect(tree.fragmentShader).toContain("linearToOutputTexel(vec4(fogMist.rgb, 1.0)).rgb, fogMist.a)");
    expect(compile(new MeshLambertMaterial(), "lambert").fragmentShader).toContain("foggedMistShade(");
  });
});
