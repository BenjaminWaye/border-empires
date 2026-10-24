import { describe, expect, it, vi } from "vitest";
import { Texture, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from "three";

vi.mock("../client-lighting-tuner/client-lighting-tuner-settings.js", () => ({
  getLightingSettings: () => ({ envIntensity: 0.8 })
}));

const { createMarineMaterial } = await import("./popup-marine-trim-material.js");

const compile = (material: ReturnType<typeof createMarineMaterial>["material"]): WebGLProgramParametersWithUniforms => {
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader:
      "#include <common>\n#include <color_fragment>\n#include <metalnessmap_fragment>\n#include <roughnessmap_fragment>\n#include <lights_fragment_maps>"
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
};

describe("createMarineMaterial", () => {
  it("patches the armour-plate titanium blend into the fragment shader", () => {
    const { material } = createMarineMaterial();
    const shader = compile(material);
    // Shoulders and the front of the chest, never the backpack band below them.
    expect(shader.fragmentShader).toContain("smoothstep(0.855, 0.87, vColor.g)");
    expect(shader.fragmentShader).toContain("smoothstep(0.805, 0.82, vColor.g)");
    expect(shader.fragmentShader).toContain("smoothstep(-0.003, -0.001, vBindZ)");
    expect(shader.vertexShader).toContain("vBindZ = position.z;");
    // Reflections stay on the plates rather than lightening the whole suit.
    expect(shader.fragmentShader).toContain("radiance *= titaniumPlate;");
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
