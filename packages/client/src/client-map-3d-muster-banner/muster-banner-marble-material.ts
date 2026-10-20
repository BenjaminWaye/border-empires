// Polished-marble finish for the muster banner's plinth. The towns' flat,
// even grey (one vertex colour per part, one roughness) reads as moulded
// plastic on a piece this close to the camera, so this patches the matte
// material's shaders to carve the plinth from marble like a premium
// board-game piece: the lighter stone parts become charcoal marble with pale
// veining, the darkest (the muster plinth, and the towns' streets) black
// marble shot with gold, both
// polished to a low roughness, with a little shade pooled where each wall
// rises from the ledge below and a bright polished edge along each wall top.
//
// The veining is in the piece's own frame, offset per instance by where it
// stands, so neighbouring banners aren't cut from the same slab.
import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from "three";

const glslFloat = (value: number): string => value.toFixed(5);

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vMarblePos;
varying vec3 vMarbleLocal;
varying vec3 vMarbleNormal;
`;

const VERTEX_PATCH = /* glsl */ `
#include <begin_vertex>
vMarblePos = position;
vMarbleLocal = position;
vMarbleNormal = normal;
#ifdef USE_INSTANCING
  // Wrapped, so the hash stays precise however far out on the map it stands.
  vMarblePos += vec3(mod(instanceMatrix[3].x, 37.0), 0.0, mod(instanceMatrix[3].z, 41.0));
#endif
`;

const fragmentDeclarations = (ledges: readonly number[]): string => /* glsl */ `
varying vec3 vMarblePos;
varying vec3 vMarbleLocal;
varying vec3 vMarbleNormal;
float marbleHash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float marbleNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(marbleHash(i), marbleHash(i + vec3(1, 0, 0)), f.x),
        mix(marbleHash(i + vec3(0, 1, 0)), marbleHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(marbleHash(i + vec3(0, 0, 1)), marbleHash(i + vec3(1, 0, 1)), f.x),
        mix(marbleHash(i + vec3(0, 1, 1)), marbleHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float marbleFbm(vec3 p) {
  return marbleNoise(p) * 0.5 + marbleNoise(p * 2.1) * 0.27 + marbleNoise(p * 4.3) * 0.15 + marbleNoise(p * 8.7) * 0.08;
}
// 0..1 veining: thin, turbulent lines where a slanted sine field crosses zero.
float marbleVein(vec3 p, float scale, float sharpness) {
  float field = sin((p.x * 0.8 + p.y * 1.7 + p.z * 0.6) * scale + marbleFbm(p * 9.0) * 7.0);
  return pow(1.0 - abs(field), sharpness);
}
// Wall shading by height: 0.78..1 shade just above a ledge, up to 1.12
// polished highlight just below one (the wall's own top edge).
float marbleLedgeLight(float y) {
  float light = 1.0;
  const float LEDGES[${ledges.length}] = float[](${ledges.map(glslFloat).join(", ")});
  for (int i = 0; i < ${ledges.length}; i++) {
    float above = y - LEDGES[i];
    if (above >= 0.0) light = min(light, mix(0.78, 1.0, smoothstep(0.0, 0.016, above)));
    else light = max(light, mix(1.12, 1.0, smoothstep(0.0, 0.004, -above)));
  }
  return light;
}
`;

const COLOR_PATCH = /* glsl */ `
#include <color_fragment>
float marbleCloud = marbleFbm(vMarblePos * 14.0);
{
  // The towns' darkest stone becomes black marble; the rest, charcoal.
  float darkStone = 1.0 - smoothstep(0.13, 0.16, dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
  float vein = marbleVein(vMarblePos, 38.0, 10.0);
  float hairline = marbleVein(vMarblePos * 1.9 + 3.1, 52.0, 26.0);
  vec3 slate = vec3(0.13, 0.135, 0.145) * (0.85 + 0.3 * marbleCloud);
  slate = mix(slate, vec3(0.55, 0.54, 0.5), vein * 0.6 + hairline * 0.3);
  vec3 black = vec3(0.03, 0.032, 0.036) * (0.8 + 0.5 * marbleCloud);
  black = mix(black, vec3(0.62, 0.45, 0.2), vein * 0.75 + hairline * 0.4);
  diffuseColor.rgb = mix(slate, black, darkStone);
  vec3 marbleNormal = normalize(vMarbleNormal);
  if (abs(marbleNormal.y) < 0.5) diffuseColor.rgb *= marbleLedgeLight(vMarbleLocal.y);
}
`;

const ROUGHNESS_PATCH = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = clamp(0.22 + 0.1 * (marbleCloud - 0.5), 0.0, 1.0);
`;

/** Patches `material` (a vertex-coloured MeshStandardMaterial or one of its
 * subclasses) with the marble finish. `ledges` are the heights, in the
 * piece's own frame, of the ledges walls rise from: shade pools just above
 * each, and the wall below each is polished bright along its top edge. */
export const applyMarbleFinish = (material: MeshStandardMaterial, ledges: readonly number[]): void => {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECLARATIONS}`)
      .replace("#include <begin_vertex>", VERTEX_PATCH);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${fragmentDeclarations(ledges)}`)
      .replace("#include <color_fragment>", COLOR_PATCH)
      .replace("#include <roughnessmap_fragment>", ROUGHNESS_PATCH);
  };
  material.customProgramCacheKey = () => `muster-banner-marble:${ledges.join(",")}`;
};
