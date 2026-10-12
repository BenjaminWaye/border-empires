import { describe, expect, it, vi } from "vitest";
import { Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Scene, ShaderLib, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { createForest } from "../client-map-3d-forest.js";
import { createTropicalForest } from "../client-map-3d-tropical-forest.js";
import { createMountainMassifs } from "../client-map-3d-mountain-massif.js";
import { createHillTerrain } from "../client-map-3d-hills.js";
import { createUnexploredStormLayer } from "./client-map-3d-unexplored-storm.js";
import { applyUnexploredStormClip, applyUnexploredStormClipToScene, markUnexploredStormClip, type StormClipUniforms } from "./client-map-3d-unexplored-storm-clip.js";

const uniforms = (): StormClipUniforms => ({
  uStormClipMask: { value: null },
  uStormClipMaskMin: { value: null },
  uStormClipMaskSize: { value: null },
  uStormClipOrigin: { value: null },
  uStormClipTime: { value: 0 }
});

const compile = (material: MeshStandardMaterial): WebGLProgramParametersWithUniforms => {
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, undefined as unknown as WebGLRenderer);
  return shader;
};

const isPatched = (material: { customProgramCacheKey: () => string }): boolean => material.customProgramCacheKey().includes("unexploredStormClip");

describe("unexplored storm clip", () => {
  it("discards a feature's fragments by its own world column under the storm, keeping any earlier patch", () => {
    const material = new MeshStandardMaterial();
    const earlier = vi.fn();
    material.onBeforeCompile = earlier;
    const clip = uniforms();
    applyUnexploredStormClip(material, clip);
    const shader = compile(material);
    expect(earlier).toHaveBeenCalledOnce();
    expect(shader.uniforms.uStormClipMask).toBe(clip.uStormClipMask);
    expect(shader.vertexShader).toMatch(/stormClipWorld = instanceMatrix \* stormClipWorld;/);
    expect(shader.vertexShader).toMatch(/vStormClipXZ = \(modelMatrix \* stormClipWorld\)\.xz;/);
    expect(shader.fragmentShader).toMatch(/if \(stormClipCovered\(vStormClipXZ\)\) discard;/);
    // Same contour as the storm itself.
    expect(shader.fragmentShader).toMatch(/stormSoftField\(uStormClipMask/);
    expect(shader.fragmentShader).toMatch(/STORM_EDGE \+ 0\.04/);
    expect(isPatched(material)).toBe(true);
  });

  it("patches only flagged materials, once each", () => {
    const scene = new Scene();
    const flagged = markUnexploredStormClip(new MeshStandardMaterial());
    const plain = new MeshBasicMaterial();
    scene.add(new Mesh(new PlaneGeometry(), flagged), new Mesh(new PlaneGeometry(), plain), new Mesh(new PlaneGeometry(), [flagged]));
    const patched = new WeakSet<MeshStandardMaterial | MeshBasicMaterial>();
    applyUnexploredStormClipToScene(scene, uniforms(), patched);
    applyUnexploredStormClipToScene(scene, uniforms(), patched);
    expect(flagged.customProgramCacheKey().match(/unexploredStormClip/g)).toHaveLength(1);
    expect(isPatched(plain)).toBe(false);
  });

  it("clips the natural features the fog's first ring draws (trees, palms, mountains, hills) once the storm builds", () => {
    const scene = new Scene();
    const forest = createForest(scene, 4);
    const tropical = createTropicalForest(scene, 4);
    const mountains = createMountainMassifs(scene, 4);
    const groundMaterial = new MeshStandardMaterial();
    createHillTerrain(scene, 4, groundMaterial);
    const storm = createUnexploredStormLayer(scene);
    storm.rebuild({ camX: 10, camY: 10, halfW: 2, halfH: 2 }, () => "unexplored");
    const featureMaterials = new Set<MeshStandardMaterial>();
    scene.traverse((object) => {
      const material = (object as Mesh).material;
      if (material instanceof MeshStandardMaterial) featureMaterials.add(material);
    });
    expect(featureMaterials.size).toBeGreaterThan(5);
    for (const material of featureMaterials) expect(isPatched(material)).toBe(true);
    expect(isPatched(groundMaterial)).toBe(true);
    for (const mesh of [mountains.rockBaseMesh, mountains.peakMesh, mountains.snowCapMesh]) expect(isPatched(mesh.material as MeshStandardMaterial)).toBe(true);
    // The clip reads the storm's own uniform objects, so it follows each mask rebuild.
    const shader = compile(groundMaterial);
    expect(shader.uniforms.uStormClipMask).toBe(storm.material.uniforms.uMask);
    expect(shader.uniforms.uStormClipTime).toBe(storm.material.uniforms.uTime);
    storm.dispose();
    forest.dispose();
    tropical.dispose();
    mountains.dispose();
  });
});
