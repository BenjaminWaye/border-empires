import { describe, expect, it, vi } from "vitest";
import { Texture, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";

vi.mock("../client-lighting-tuner/client-lighting-tuner-settings.js", () => ({
  getLightingSettings: () => ({ envIntensity: 0.8 })
}));

const { createMarineMaterial } = await import("./popup-marine-material.js");

const CHUNKS = ["common", "begin_vertex", "color_fragment", "metalnessmap_fragment", "roughnessmap_fragment", "emissivemap_fragment", "lights_fragment_maps"];

const compile = (material: ReturnType<typeof createMarineMaterial>): WebGLProgramParametersWithUniforms => {
  const source = CHUNKS.map((chunk) => `#include <${chunk}>`).join("\n");
  const shader = { uniforms: {}, vertexShader: source, fragmentShader: source } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
};

describe("createMarineMaterial", () => {
  it("leaves the standard marine's material unpatched and unreflective", () => {
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
});
