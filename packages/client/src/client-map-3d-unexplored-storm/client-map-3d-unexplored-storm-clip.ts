import type { IUniform, Material, Object3D, WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { STORM_FIELD_GLSL } from "./client-map-3d-unexplored-storm-field-glsl.js";

// The storm is a flat sheet just above flat ground (UNEXPLORED_STORM_Y), so
// anything taller standing on the fog's first ring -- trees, palms,
// mountain massifs, hill domes -- would rise straight through the cloud
// past the brass edge. Materials flagged with markUnexploredStormClip get a
// fragment clip instead: every fragment whose own world column lies under
// the storm's cover is discarded, so the cloud bank cuts them like a wall
// at the same rounded contour the storm draws. Tiles in sight and
// remembered tiles are never clipped.

const STORM_CLIP_FLAG = "unexploredStormClip";

export type StormClipUniforms = {
  readonly uStormClipMask: IUniform;
  readonly uStormClipMaskMin: IUniform;
  readonly uStormClipMaskSize: IUniform;
  readonly uStormClipOrigin: IUniform;
  readonly uStormClipTime: IUniform;
};

/** Flags a feature material to be clipped under the unexplored storm. */
export const markUnexploredStormClip = <T extends Material>(material: T): T => {
  material.userData[STORM_CLIP_FLAG] = true;
  return material;
};

const CLIP_VERTEX_DECL = `
varying vec2 vStormClipXZ;
`;

const CLIP_VERTEX = `
vec4 stormClipWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
stormClipWorld = instanceMatrix * stormClipWorld;
#endif
vStormClipXZ = (modelMatrix * stormClipWorld).xz;
`;

// Margin past the contour, so the clip only bites where the storm has gone
// fully opaque (its anti-aliased edge is at most 0.04 wide).
const CLIP_FRAGMENT_DECL = `
varying vec2 vStormClipXZ;
uniform sampler2D uStormClipMask;
uniform vec2 uStormClipMaskMin;
uniform vec2 uStormClipMaskSize;
uniform vec2 uStormClipOrigin;
uniform float uStormClipTime;
${STORM_FIELD_GLSL}
bool stormClipCovered(vec2 sceneXZ) {
  vec2 uvTile = (floor(sceneXZ) + 0.5 - uStormClipMaskMin) / uStormClipMaskSize;
  if (uvTile.x < 0.0 || uvTile.y < 0.0 || uvTile.x > 1.0 || uvTile.y > 1.0) return false;
  vec4 m = texture2D(uStormClipMask, uvTile);
  if (m.r < 0.5) return false;
  if (m.g > 0.99) return true;
  vec2 uv = (sceneXZ - uStormClipMaskMin) / uStormClipMaskSize;
  float s = stormSoftField(uStormClipMask, uv, uStormClipMaskSize) + stormEdgeNoise(sceneXZ + uStormClipOrigin, uStormClipTime) * 0.1;
  return s > STORM_EDGE + 0.04;
}
`;

const CLIP_FRAGMENT = `
if (stormClipCovered(vStormClipXZ)) discard;
`;

const injectAfter = (source: string, include: string, code: string): string => {
  if (!source.includes(include)) throw new Error(`unexplored storm clip: shader has no ${include}`);
  return source.replace(include, `${include}\n${code}`);
};

/** Patches one material (keeping any onBeforeCompile it already has). */
export const applyUnexploredStormClip = (material: Material, uniforms: StormClipUniforms): void => {
  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void => {
    previousOnBeforeCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectAfter(shader.vertexShader, "#include <common>", CLIP_VERTEX_DECL);
    shader.vertexShader = injectAfter(shader.vertexShader, "#include <project_vertex>", CLIP_VERTEX);
    shader.fragmentShader = injectAfter(shader.fragmentShader, "#include <common>", CLIP_FRAGMENT_DECL);
    shader.fragmentShader = injectAfter(shader.fragmentShader, "#include <clipping_planes_fragment>", CLIP_FRAGMENT);
  };
  material.customProgramCacheKey = (): string => `${previousCacheKey.call(material)}|unexploredStormClip`;
  material.needsUpdate = true;
};

/**
 * Patches every flagged material in the scene not patched yet. Cheap to call
 * on each terrain rebuild: layers create their materials once, so after the
 * first pass this is just a scene walk.
 */
export const applyUnexploredStormClipToScene = (root: Object3D, uniforms: StormClipUniforms, patched: WeakSet<Material>): void => {
  root.traverse((object) => {
    const material = (object as Object3D & { material?: Material | Material[] }).material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      if (entry.userData[STORM_CLIP_FLAG] !== true || patched.has(entry)) continue;
      patched.add(entry);
      applyUnexploredStormClip(entry, uniforms);
    }
  });
};
