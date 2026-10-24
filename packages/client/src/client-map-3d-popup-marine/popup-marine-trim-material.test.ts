import { describe, expect, it, vi } from "vitest";
import { Texture, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";

vi.mock("../client-lighting-tuner/client-lighting-tuner-settings.js", () => ({
  getLightingSettings: () => ({ envIntensity: 0.8 })
}));

const { createMarineMaterial } = await import("./popup-marine-trim-material.js");

const compile = (material: ReturnType<typeof createMarineMaterial>["material"]): WebGLProgramParametersWithUniforms => {
  const shader = {
    uniforms: {},
    vertexShader: "",
    fragmentShader: "#include <common>\n#include <color_fragment>\n#include <metalnessmap_fragment>\n#include <roughnessmap_fragment>"
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
};

describe("createMarineMaterial", () => {
  it("patches the armour-plate titanium blend into the fragment shader", () => {
    const { material } = createMarineMaterial();
    const shader = compile(material);
    expect(shader.fragmentShader).toContain("smoothstep(0.66, 0.74, vColor.g)");
    expect(shader.fragmentShader).toContain("metalnessFactor = mix(");
    expect(shader.fragmentShader).toContain("roughnessFactor = mix(");
  });

  it("toggles the trim uniform per marine", () => {
    const { material, setTitaniumTrim } = createMarineMaterial();
    const uniform = compile(material).uniforms.uTitaniumTrim as { value: number };
    expect(uniform.value).toBe(0);
    setTitaniumTrim(true);
    expect(uniform.value).toBe(1);
    setTitaniumTrim(false);
    expect(uniform.value).toBe(0);
  });

  it("reflects the environment only while trimmed, so plain marines look as before", () => {
    const envMap = new Texture();
    const { material, setTitaniumTrim } = createMarineMaterial(envMap);
    expect(material.envMap).toBe(envMap);
    expect(material.envMapIntensity).toBe(0);
    setTitaniumTrim(true);
    expect(material.envMapIntensity).toBe(0.8);
    setTitaniumTrim(false);
    expect(material.envMapIntensity).toBe(0);
  });
});
