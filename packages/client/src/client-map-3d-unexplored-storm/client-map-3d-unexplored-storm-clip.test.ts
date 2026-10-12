import { describe, expect, it, vi } from "vitest";
import { Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Scene, ShaderLib, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";
import { createForest } from "../client-map-3d-forest.js";
import { createTropicalForest } from "../client-map-3d-tropical-forest.js";
import { createMountainMassifs } from "../client-map-3d-mountain-massif.js";
import { createHillTerrain } from "../client-map-3d-hills.js";
import { createHeightfieldSkirt } from "../client-map-3d-heightfield/client-map-3d-heightfield-skirt.js";
import { createUnexploredStormLayer } from "./client-map-3d-unexplored-storm.js";
import { applyUnexploredStormClip, applyUnexploredStormClipToScene, markUnexploredStormClip, type StormClipUniforms } from "./client-map-3d-unexplored-storm-clip.js";

const uniforms = (): StormClipUniforms => ({
  uStormClipMask: { value: null },
  uStormClipMaskMin: { value: null },
  uStormClipMaskSize: { value: null },
  uStormClipOrigin: { value: null },
  uStormClipTime: { value: 0 },
  uStormClipPlaneY: { value: 0.27 }
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
  it("keeps or hides each feature instance whole by where it stands, keeping any earlier patch", () => {
    const material = new MeshStandardMaterial();
    const earlier = vi.fn();
    material.onBeforeCompile = earlier;
    const clip = uniforms();
    applyUnexploredStormClip(material, clip);
    const shader = compile(material);
    expect(earlier).toHaveBeenCalledOnce();
    expect(shader.uniforms.uStormClipMask).toBe(clip.uStormClipMask);
    // Same contour as the storm itself (soft field, wobble, clearance).
    expect(shader.vertexShader).toMatch(/stormSoftField\(uStormClipMask/);
    expect(shader.vertexShader).toMatch(/stormClearanceField\(/);
    // The instance's own base point decides; under the cloud the whole tree or
    // mountain collapses -- never sliced open at the brass line.
    expect(shader.vertexShader).toContain("vec2 stormOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;");
    expect(shader.vertexShader).toContain("if (stormClipField(stormOrigin) > STORM_EDGE - 0.12) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);");
    expect(shader.fragmentShader).not.toContain("discard");
    expect(shader.vertexShader).not.toContain("transformed.y -= stormPress");
    expect(isPatched(material)).toBe(true);
  });

  it("presses ground under the sheet near the contour instead of cutting holes in it", () => {
    const material = new MeshStandardMaterial();
    applyUnexploredStormClip(material, uniforms(), "ground");
    const shader = compile(material);
    // Hills slope down to just under the sheet as they reach the brass line;
    // the explored side of a tile edge never moves.
    expect(shader.vertexShader).toContain("smoothstep(STORM_EDGE - 0.12, STORM_EDGE - 0.05, stormGroundS) * stormClipRing(stormGroundWorld.xz)");
    expect(shader.vertexShader).toContain("transformed.y -= stormPress * max(0.0, stormGroundWorld.y - (uStormClipPlaneY - 0.04));");
    // Never cut: through the clear strip inside the brass line you see the
    // ground a little further out, so a cut there showed the void as a dark seam.
    expect(shader.fragmentShader).not.toContain("discard");
    expect(shader.fragmentShader).not.toContain("stormClip");
    expect(material.customProgramCacheKey()).toContain("unexploredStormClip:ground");
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
    // The ground mesh's skirt wall at the ring's outer edge.
    scene.add(createHeightfieldSkirt(4).skirtMesh);
    const storm = createUnexploredStormLayer(scene);
    storm.rebuild({ camX: 10, camY: 10, halfW: 2, halfH: 2 }, () => "unexplored");
    const featureMaterials = new Set<MeshStandardMaterial>();
    scene.traverse((object) => {
      const material = (object as Mesh).material;
      if (material instanceof MeshStandardMaterial) featureMaterials.add(material);
    });
    expect(featureMaterials.size).toBeGreaterThan(5);
    for (const material of featureMaterials) expect(isPatched(material)).toBe(true);
    // Shadows match: the default depth material would still cast unpressed
    // hills and hidden trees (a hill's old top shadowed the pressed ground).
    let casters = 0;
    scene.traverse((object) => {
      const material = (object as Mesh).material;
      if (!(material instanceof MeshStandardMaterial) || !object.castShadow) return;
      casters += 1;
      expect(object.customDepthMaterial && isPatched(object.customDepthMaterial)).toBe(true);
    });
    expect(casters).toBeGreaterThan(3);
    expect(groundMaterial.customProgramCacheKey()).toContain("unexploredStormClip:ground");
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
