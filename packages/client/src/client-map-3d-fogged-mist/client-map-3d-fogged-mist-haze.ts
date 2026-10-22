import type { IUniform, Material, Object3D, WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { unexploredStormClipKindOf } from "../client-map-3d-unexplored-storm/client-map-3d-unexplored-storm-clip.js";
import { FOGGED_MIST_SHADE_GLSL } from "./client-map-3d-fogged-mist-shader.js";

// The fogged mist (client-map-3d-fogged-mist.ts) is a flat sheet level with
// the land, so on its own it only hazes what lies under it: trees, palms,
// peaks and hill tops rise out of it untouched and read as drawn on top of
// the fog. So every natural-terrain material (the ones flagged for the
// unexplored storm's clip, markUnexploredStormClip) gets the same mist
// blended into its fragments above the sheet -- the colour and opacity the
// sheet itself draws at that spot (foggedMistShade), mixed in after lighting
// and scene fog just as the sheet's normal blend would. Below the sheet the sheet already
// covers them, so nothing is hazed twice. Tiles in sight are never touched.

export type FoggedMistHazeUniforms = {
  readonly uFogMistMask: IUniform;
  readonly uFogMistMaskMin: IUniform;
  readonly uFogMistMaskSize: IUniform;
  readonly uFogMistOrigin: IUniform;
  readonly uFogMistTime: IUniform;
  readonly uFogMistHaze: IUniform;
  readonly uFogMistLight: IUniform;
  readonly uFogMistMinOpacity: IUniform;
  readonly uFogMistMaxOpacity: IUniform;
  /** World y of the mist sheet (FOGGED_MIST_Y). */
  readonly uFogMistPlaneY: IUniform;
  /** 1 while the sheet is drawn, 0 while it's hidden (nothing remembered in the window). */
  readonly uFogMistOn: IUniform;
};

const VERTEX_DECL = "varying vec3 vFogMistScene;";

// Scene position, instance transform included (trees, peaks are instanced).
const VERTEX_POSITION = `
{
  vec4 fogMistLocal = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  fogMistLocal = instanceMatrix * fogMistLocal;
  #endif
  vFogMistScene = (modelMatrix * fogMistLocal).xyz;
}
`;

const FRAGMENT_DECL = `
varying vec3 vFogMistScene;
uniform sampler2D uFogMistMask;
uniform vec2 uFogMistMaskMin;
uniform vec2 uFogMistMaskSize;
uniform vec2 uFogMistOrigin;
uniform float uFogMistTime;
uniform vec3 uFogMistHaze;
uniform vec3 uFogMistLight;
uniform float uFogMistMinOpacity;
uniform float uFogMistMaxOpacity;
uniform float uFogMistPlaneY;
uniform float uFogMistOn;
${FOGGED_MIST_SHADE_GLSL}`;

// After fog_fragment: the ground under the sheet is lit, converted and
// scene-fogged before the (unfogged) sheet blends over it, so features get
// the same order. Tiles in sight are skipped on one texel read (the mist
// never covers them), so the edge maths only runs on remembered and
// unexplored land. Gated per fragment, so the edge's fwidth is only
// unreliable on quads straddling a gate, where it is clamped anyway.
export const FOGGED_MIST_HAZE_FRAGMENT_BLEND = `
if (uFogMistOn > 0.5 && vFogMistScene.y > uFogMistPlaneY && texture2D(uFogMistMask, (floor(vFogMistScene.xz) + 0.5 - uFogMistMaskMin) / uFogMistMaskSize).r > 0.002) {
  vec4 fogMist = foggedMistShade(uFogMistMask, uFogMistMaskMin, uFogMistMaskSize, vFogMistScene.xz, vFogMistScene.xz + uFogMistOrigin, uFogMistTime, uFogMistHaze, uFogMistLight, uFogMistMinOpacity, uFogMistMaxOpacity);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(fogMist.rgb, 1.0)).rgb, fogMist.a);
}
`;

const injectAfter = (source: string, include: string, code: string): string => {
  if (!source.includes(include)) throw new Error(`fogged mist haze: shader has no ${include}`);
  return source.replace(include, `${include}\n${code}`);
};

/** Patches one material (keeping any onBeforeCompile it already has). */
export const applyFoggedMistHaze = (material: Material, uniforms: FoggedMistHazeUniforms): void => {
  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer): void => {
    previousOnBeforeCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectAfter(shader.vertexShader, "#include <common>", VERTEX_DECL);
    shader.vertexShader = injectAfter(shader.vertexShader, "#include <project_vertex>", VERTEX_POSITION);
    shader.fragmentShader = injectAfter(shader.fragmentShader, "#include <common>", FRAGMENT_DECL);
    shader.fragmentShader = injectAfter(shader.fragmentShader, "#include <fog_fragment>", FOGGED_MIST_HAZE_FRAGMENT_BLEND);
  };
  material.customProgramCacheKey = (): string => `${previousCacheKey.call(material)}|foggedMistHaze`;
  material.needsUpdate = true;
};

/**
 * Patches every storm-clip-flagged material in the scene not patched yet.
 * Cheap to call on each terrain rebuild: layers create their materials once,
 * so after the first pass this is just a scene walk.
 */
export const applyFoggedMistHazeToScene = (root: Object3D, uniforms: FoggedMistHazeUniforms, patched: WeakSet<Material>): void => {
  root.traverse((object) => {
    const material = (object as Object3D & { material?: Material | Material[] }).material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      if (!unexploredStormClipKindOf(entry) || patched.has(entry)) continue;
      patched.add(entry);
      applyFoggedMistHaze(entry, uniforms);
    }
  });
};
