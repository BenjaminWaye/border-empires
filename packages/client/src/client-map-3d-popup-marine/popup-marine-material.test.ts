import { describe, expect, it, vi } from "vitest";
import { Texture, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";

vi.mock("../client-lighting-tuner/client-lighting-tuner-settings.js", () => ({
  getLightingSettings: () => ({ envIntensity: 0.8 })
}));

const { createMarineMaterial, setMarineSkin } = await import("./popup-marine-material.js");

const CHUNKS = ["common", "begin_vertex", "color_fragment", "metalnessmap_fragment", "roughnessmap_fragment", "emissivemap_fragment", "lights_fragment_maps"];

const compile = (material: ReturnType<typeof createMarineMaterial>): WebGLProgramParametersWithUniforms => {
  const source = CHUNKS.map((chunk) => `#include <${chunk}>`).join("\n");
  const shader = { uniforms: {}, vertexShader: source, fragmentShader: source } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
};

describe("createMarineMaterial", () => {
  it("leaves the standard marine's material without a surface mask and unreflective", () => {
    const envMap = new Texture();
    const material = createMarineMaterial(false, envMap);
    expect(material.envMap).toBeNull();
    const shader = compile(material);
    expect(shader.fragmentShader).not.toContain("vSurfaceMask");
  });

  it("renders a masked model's bare metal and glow, reflecting only on the metal", () => {
    const envMap = new Texture();
    const material = createMarineMaterial(true, envMap);
    expect(material.envMap).toBe(envMap);
    expect(material.envMapIntensity).toBe(0.8);
    const shader = compile(material);
    expect(shader.vertexShader).toContain("attribute vec3 _mask;");
    expect(shader.fragmentShader).toContain("metalnessFactor = mix(");
    expect(shader.fragmentShader).toContain("totalEmissiveRadiance += vColor.rgb");
    expect(shader.fragmentShader).toContain("radiance *= vSurfaceMask.x;");
  });

  it("starts every soldier on the standard paint scheme", () => {
    for (const masked of [false, true]) {
      const shader = compile(createMarineMaterial(masked));
      expect((shader.uniforms as Record<string, { value: number }>).uMarineSkin?.value).toBe(0);
    }
  });

  it("repaints one soldier without touching another", () => {
    const skinned = createMarineMaterial(false);
    const standard = createMarineMaterial(false);
    const skinnedShader = compile(skinned);
    const standardShader = compile(standard);
    setMarineSkin(skinned, "ancillary-ivory");
    expect((skinnedShader.uniforms as Record<string, { value: number }>).uMarineSkin?.value).toBe(1);
    expect((standardShader.uniforms as Record<string, { value: number }>).uMarineSkin?.value).toBe(0);
    setMarineSkin(skinned, undefined);
    expect((skinnedShader.uniforms as Record<string, { value: number }>).uMarineSkin?.value).toBe(0);
  });

  it("a skin is weighted by the skin uniform alone, so the standard scheme is unchanged, and it never repaints metal or glow", () => {
    const plain = compile(createMarineMaterial(false)).fragmentShader;
    expect(plain).toContain("* uMarineSkin;");
    const masked = compile(createMarineMaterial(true)).fragmentShader;
    expect(masked).toContain("* uMarineSkin * (1.0 - vSurfaceMask.x) * (1.0 - vSurfaceMask.y);");
  });

  it("gives skinned-capable materials their own program keys per model", () => {
    expect(createMarineMaterial(false).customProgramCacheKey()).not.toBe(createMarineMaterial(true).customProgramCacheKey());
  });
});
