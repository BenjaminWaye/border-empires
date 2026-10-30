import { describe, expect, it } from "vitest";
import { InstancedMesh, BoxGeometry, DataTexture, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, Scene, ShaderLib, type Material } from "three";
import { createTreeMaterial } from "../client-map-3d-trees/client-map-3d-tree-material.js";
import { markUnexploredStormClip } from "../client-map-3d-unexplored-storm/client-map-3d-unexplored-storm-clip.js";
import { FOGGED_MIST_Y, createFoggedMistLayer } from "./client-map-3d-fogged-mist.js";
import { FOGGED_MIST_HAZE_FRAGMENT_BLEND, FOGGED_MIST_HAZE_FRAGMENT_MULTIPLY, applyFoggedMistHaze, applyFoggedMistHazeToScene, takesFoggedMistHaze } from "./client-map-3d-fogged-mist-haze.js";
import { createFogOverlays } from "./client-map-3d-fog-overlays.js";
import { FOGGED_EDGE_COVER_GLSL } from "./client-map-3d-fogged-edge-clip.js";
import { FOGGED_MIST_FRAGMENT_SHADER, FOGGED_MIST_SHADE_GLSL } from "./client-map-3d-fogged-mist-shader.js";

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

  it("hazes buildings remembered under fog: every material on the building environment map", () => {
    // Regression: remembered buildings would otherwise stand crisp on top of the mist, as trees once did.
    const scene = new Scene();
    const envMap = new DataTexture();
    const building = new MeshStandardMaterial({ envMap });
    const unrelated = new MeshStandardMaterial();
    scene.add(new Mesh(new BoxGeometry(), [building, unrelated]));
    const mist = createFoggedMistLayer(scene, () => 0, envMap);
    mist.rebuild({ camX: 10, camY: 10, halfW: 2, halfH: 2 }, () => "fogged");
    expect(isHazed(building)).toBe(true);
    expect(isHazed(unrelated)).toBe(false);
    expect(takesFoggedMistHaze(building, undefined)).toBe(false);
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

  it("blends the sheet's own shade after lighting and fog, only above the sheet and off tiles in sight, keeping the material's own shader edits", () => {
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
    expect(tree.fragmentShader).toMatch(/#include <fog_fragment>\n\s*if \(uFogMistOn > 0\.5 && vFogMistScene\.y > uFogMistPlaneY && /);
    expect(tree.fragmentShader).toContain("texture2D(uFogMistMask, (floor(vFogMistScene.xz) + 0.5 - uFogMistMaskMin) / uFogMistMaskSize).r > 0.002"); // tiles in sight skipped
    expect(tree.fragmentShader).toContain("foggedMistShade(uFogMistMask");
    expect(tree.fragmentShader).toContain("linearToOutputTexel(vec4(fogMist.rgb, 1.0)).rgb, fogMist.a)");
    expect(compile(new MeshLambertMaterial(), "lambert").fragmentShader).toContain("foggedMistShade(");
  });

  it("calls the shared mist shade with exactly the parameters it declares", () => {
    // A mismatch only fails at GLSL compile time in the browser, blanking every tree, peak and ground program.
    const argCount = (args: string): number => args.split(",").filter((arg) => arg.trim().length > 0).length;
    const declared = /vec4 foggedMistShade\(([^)]*)\)/.exec(FOGGED_MIST_SHADE_GLSL)?.[1];
    expect(declared).toBeDefined();
    const calls = [FOGGED_MIST_FRAGMENT_SHADER, FOGGED_MIST_HAZE_FRAGMENT_BLEND].map((source) => /foggedMistShade\(([^;]*)\);/.exec(source)?.[1]);
    for (const call of calls) expect(argCount(call ?? "")).toBe(argCount(declared!));
  });

  it("hazes the fog overlays draped over hills, after their edge clip, so remembered hills don't break the fog", () => {
    // Regression: the slate wash draped on a hill dome drew after the dome's own haze, painting it back out, so every
    // remembered hill rose out of the mist as a dark patch cut off at the sheet's height.
    const scene = new Scene();
    const mist = createFoggedMistLayer(scene, () => 0);
    const { fogDarkenOverlay, fogOwnershipOverlay } = createFogOverlays(scene, 4, mist.edgeUniforms, mist.hazeUniforms);
    const compile = (material: Material): string => {
      const shader = { vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader, uniforms: {} as Record<string, unknown> };
      material.onBeforeCompile(shader as never, undefined as never);
      expect(shader.uniforms.uFogMistMask).toBe(mist.hazeUniforms.uFogMistMask);
      expect(shader.uniforms.uFogEdgeMask).toBe(mist.edgeUniforms.uFogEdgeMask); // edge clip kept
      // Both patches bring the storm field GLSL; unguarded, the second copy fails to compile ("function already has a body").
      expect(shader.fragmentShader.split("#ifndef FOGGED_EDGE_COVER")).toHaveLength(3);
      expect(FOGGED_EDGE_COVER_GLSL.trim().startsWith("#ifndef FOGGED_EDGE_COVER\n#define FOGGED_EDGE_COVER")).toBe(true);
      return shader.fragmentShader;
    };
    for (const mesh of [fogDarkenOverlay.settledHillMesh, fogDarkenOverlay.frontierHillMesh, fogDarkenOverlay.settledMesh]) {
      const fragment = compile(mesh.material as Material);
      expect(fragment).toContain(FOGGED_MIST_HAZE_FRAGMENT_BLEND.trim());
      // Mixes the colour only: the wash keeps its alpha, so (wash over hazed dome) hazed == mist over (wash over dome).
      expect(FOGGED_MIST_HAZE_FRAGMENT_BLEND).not.toContain("gl_FragColor.a");
    }
    for (const mesh of [fogOwnershipOverlay.settledHillMesh, fogOwnershipOverlay.frontierHillMesh]) {
      const fragment = compile(mesh.material as Material);
      expect(fragment).toContain(FOGGED_MIST_HAZE_FRAGMENT_MULTIPLY.trim()); // multiply tint fades to white, not to mist colour
      expect(fragment).not.toContain(FOGGED_MIST_HAZE_FRAGMENT_BLEND.trim());
    }
  });
});
