import type { IUniform, Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import type { OwnershipOverlay } from "../client-map-3d-ownership-overlay.js";
import { STORM_FIELD_GLSL } from "../client-map-3d-unexplored-storm/client-map-3d-unexplored-storm-field-glsl.js";

// Fits the remembered tiles' per-tile fog overlays in client-map-3d.ts (the
// slate wash and the last-known-owner tint) to the fogged mist's edge
// (client-map-3d-fogged-mist.ts), so they end where the mist does -- a
// rounded, wobbling line just past the tiles in sight -- rather than on the
// square edge of the first remembered tile. Done in the overlays' own
// fragment shaders, on the ground: the overlays keep their place in the draw
// order (under every gameplay overlay) and never float with the mist sheet.
// "alpha" fades a normal-blend overlay out; "multiply" eases a multiply
// overlay to white (no effect) instead, since multiply blending ignores alpha.

export type FoggedEdgeUniforms = {
  readonly uFogEdgeMask: IUniform;
  readonly uFogEdgeMaskMin: IUniform;
  readonly uFogEdgeMaskSize: IUniform;
  readonly uFogEdgeOrigin: IUniform;
  readonly uFogEdgeTime: IUniform;
};

export type FoggedEdgeMode = "alpha" | "multiply";

/**
 * GLSL: the fog's contour field s and its coverage (0 in sight -> 1 in fog)
 * at a scene point, as vec2(s, cover). Reads the mist mask's storm layout
 * (client-unexplored-storm-mask.ts) with "explored" meaning "in sight", and
 * cuts it exactly like the storm's coast. Outside the mask counts as fog.
 */
export const FOGGED_EDGE_COVER_GLSL = `
${STORM_FIELD_GLSL}
vec2 foggedEdge(sampler2D mask, vec2 maskMin, vec2 maskSize, vec2 sceneXZ, vec2 worldXZ, float time) {
  vec2 uv = (sceneXZ - maskMin) / maskSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(2.0, 1.0);
  float soft = stormSoftField(mask, uv, maskSize);
  float clearance = stormExploredDistance(mask, maskMin, maskSize, sceneXZ);
  float s = stormClearanceField(soft + stormEdgeNoise(worldXZ, time) * 0.1, clearance);
  float sw = clamp(fwidth(s), 0.004, 0.04);
  return vec2(s, max(smoothstep(0.97, 0.995, soft), smoothstep(STORM_EDGE - sw, STORM_EDGE + sw * 2.0, s)));
}
`;

const injectAfter = (source: string, include: string, code: string): string => {
  if (!source.includes(include)) throw new Error(`fogged edge clip: shader has no ${include}`);
  return source.replace(include, `${include}\n${code}`);
};
const injectBefore = (source: string, include: string, code: string): string => {
  if (!source.includes(include)) throw new Error(`fogged edge clip: shader has no ${include}`);
  return source.replace(include, `${code}\n${include}`);
};

/** Patches one overlay material (keeping any onBeforeCompile it already has). */
export const applyFoggedEdgeClip = (material: Material, uniforms: FoggedEdgeUniforms, mode: FoggedEdgeMode): void => {
  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void => {
    previousOnBeforeCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectAfter(shader.vertexShader, "#include <common>", "varying vec2 vFogEdgeSceneXZ;");
    shader.vertexShader = injectAfter(shader.vertexShader, "#include <project_vertex>", "vFogEdgeSceneXZ = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = injectAfter(shader.fragmentShader, "#include <common>", `
varying vec2 vFogEdgeSceneXZ;
uniform sampler2D uFogEdgeMask;
uniform vec2 uFogEdgeMaskMin;
uniform vec2 uFogEdgeMaskSize;
uniform vec2 uFogEdgeOrigin;
uniform float uFogEdgeTime;
${FOGGED_EDGE_COVER_GLSL}`);
    const cover = "foggedEdge(uFogEdgeMask, uFogEdgeMaskMin, uFogEdgeMaskSize, vFogEdgeSceneXZ, vFogEdgeSceneXZ + uFogEdgeOrigin, uFogEdgeTime).y";
    shader.fragmentShader = injectBefore(shader.fragmentShader, "#include <opaque_fragment>",
      mode === "alpha" ? `diffuseColor.a *= ${cover};` : `outgoingLight = mix(vec3(1.0), outgoingLight, ${cover});`);
  };
  material.customProgramCacheKey = (): string => `${previousCacheKey.call(material)}|foggedEdgeClip:${mode}`;
  material.needsUpdate = true;
};

/** Fits all four of an overlay's buckets (flat + hill, settled + frontier) to the fog's edge. */
export const applyFoggedEdgeClipToOverlay = (overlay: OwnershipOverlay, uniforms: FoggedEdgeUniforms, mode: FoggedEdgeMode): void => {
  for (const mesh of [overlay.settledMesh, overlay.frontierMesh, overlay.settledHillMesh, overlay.frontierHillMesh]) {
    applyFoggedEdgeClip(mesh.material as Material, uniforms, mode);
  }
};
