import type { Color, MeshStandardMaterial } from "three";

// A faint cool rim light for the scout drone's shell and battery (client-map-3d-scout-drone-materials.ts):
// a fresnel term added to the emissive output, strongest on edges seen side-on and on surfaces
// facing up the screen, so the drone's upper silhouette separates from a dark background without
// any extra light in the scene. Low intensity, so it reads as a sky bounce, never as chrome.
// Compiled once; nothing changes per frame.

export const applyScoutRimLight = (material: MeshStandardMaterial, color: Color, intensity: number): void => {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms["scoutRimColor"] = { value: color.clone().multiplyScalar(intensity) };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 scoutRimColor;")
      .replace(
        "#include <emissivemap_fragment>",
        [
          "#include <emissivemap_fragment>",
          "{",
          "  float scoutFacing = 1.0 - saturate(dot(normal, normalize(vViewPosition)));",
          "  float scoutUpper = smoothstep(-0.2, 0.7, normal.y);",
          "  totalEmissiveRadiance += scoutRimColor * pow(scoutFacing, 3.0) * scoutUpper;",
          "}"
        ].join("\n")
      );
  };
  material.customProgramCacheKey = () => `scout-rim-${intensity}`;
};
