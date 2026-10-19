// Carved-stone finish for the muster banner's plinth. The towns' flat,
// even grey (one vertex colour per part, one roughness) reads as moulded
// plastic on a piece this close to the camera, so this patches the matte
// material's shaders to paint the stone like a premium miniature's: a
// warm mottled wash at a few scales, dark and pale flecks, chiselled block
// joints round the walls and flagstone joints across the tops, dry-brushed
// highlights along each top edge, shade pooled in the crevices where a wall
// rises from the ledge below, and a dead-matte roughness.
//
// The pattern is in the piece's own frame, offset per instance by where it
// stands, so neighbouring banners don't share one stamped texture.
import type { MeshStandardMaterial, WebGLProgramParametersWithUniforms } from "three";

const glslFloat = (value: number): string => value.toFixed(5);

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vStonePos;
varying vec3 vStoneLocal;
varying vec3 vStoneNormal;
`;

const VERTEX_PATCH = /* glsl */ `
#include <begin_vertex>
vStonePos = position;
vStoneLocal = position;
vStoneNormal = normal;
#ifdef USE_INSTANCING
  // Wrapped, so the hash stays precise however far out on the map it stands.
  vStonePos += vec3(mod(instanceMatrix[3].x, 37.0), 0.0, mod(instanceMatrix[3].z, 41.0));
#endif
`;

const fragmentDeclarations = (ledges: readonly number[]): string => /* glsl */ `
varying vec3 vStonePos;
varying vec3 vStoneLocal;
varying vec3 vStoneNormal;
float stoneHash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
float stoneNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(stoneHash(i), stoneHash(i + vec3(1, 0, 0)), f.x),
        mix(stoneHash(i + vec3(0, 1, 0)), stoneHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(stoneHash(i + vec3(0, 0, 1)), stoneHash(i + vec3(1, 0, 1)), f.x),
        mix(stoneHash(i + vec3(0, 1, 1)), stoneHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
// 0..1 mottling over three scales.
float stoneMottle(vec3 p) {
  return stoneNoise(p * 24.0) * 0.5 + stoneNoise(p * 61.0) * 0.32 + stoneNoise(p * 150.0) * 0.18;
}
// Wall shading by height: 0.6..1 crevice shade just above a ledge, up to
// 1.25 dry-brushed highlight just below one (the wall's own top edge).
float stoneLedgeLight(float y) {
  float light = 1.0;
  const float LEDGES[${ledges.length}] = float[](${ledges.map(glslFloat).join(", ")});
  for (int i = 0; i < ${ledges.length}; i++) {
    float above = y - LEDGES[i];
    if (above >= 0.0) light = min(light, mix(0.6, 1.0, smoothstep(0.0, 0.02, above)));
    else light = max(light, mix(1.25, 1.0, smoothstep(0.0, 0.005, -above)));
  }
  return light;
}
// Antialiased 1 on a joint line of the given width, d being the distance to it.
float stoneJoint(float d, float width) {
  float aa = max(fwidth(d), 1e-4);
  return 1.0 - smoothstep(width - aa, width + aa, d);
}
// Chiselled joints: staggered ashlar courses round the walls, flagstones
// meeting along the octagon's corner lines across the tops.
float stoneJoints(vec3 p, vec3 n) {
  float radius = length(p.xz);
  float angle = atan(p.z, p.x);
  if (abs(n.y) < 0.5) {
    const float COURSE = 0.024;
    float course = floor(p.y / COURSE);
    float blocks = fract(angle / 6.2831853 * 16.0 + course * 0.5);
    float vertical = min(blocks, 1.0 - blocks) * 6.2831853 * radius / 16.0;
    float rows = fract(p.y / COURSE);
    float horizontal = min(rows, 1.0 - rows) * COURSE;
    return stoneJoint(min(vertical, horizontal), 0.0011);
  }
  if (n.y > 0.5) {
    float sector = fract((angle - 0.3926991) / 0.7853982);
    return stoneJoint(min(sector, 1.0 - sector) * 0.7853982 * radius, 0.0011) * step(0.03, radius);
  }
  return 0.0;
}
`;

const COLOR_PATCH = /* glsl */ `
#include <color_fragment>
float stoneMottleValue = stoneMottle(vStonePos);
{
  vec3 stoneNormal = normalize(vStoneNormal);
  float drift = stoneNoise(vStonePos * 7.0);
  float fleck = stoneNoise(vStonePos * 340.0);
  // Warm the towns' cool grey towards weathered granite.
  diffuseColor.rgb *= vec3(1.08, 1.0, 0.86);
  diffuseColor.rgb *= 0.66 + 0.6 * stoneMottleValue;
  diffuseColor.rgb *= mix(vec3(0.94, 0.98, 1.04), vec3(1.08, 1.0, 0.88), drift);
  diffuseColor.rgb *= 1.0 - 0.38 * smoothstep(0.8, 0.9, fleck) + 0.22 * smoothstep(0.1, 0.03, fleck);
  diffuseColor.rgb *= 1.0 - 0.5 * stoneJoints(vStoneLocal, stoneNormal);
  if (abs(stoneNormal.y) < 0.5) diffuseColor.rgb *= stoneLedgeLight(vStoneLocal.y);
}
`;

const ROUGHNESS_PATCH = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = clamp(0.92 + 0.12 * (stoneMottleValue - 0.5), 0.0, 1.0);
`;

/** Patches `material` (a vertex-coloured MeshStandardMaterial) with the
 * stone finish. `ledges` are the heights, in the piece's own frame, of the
 * ledges walls rise from: crevice shade pools just above each, and the wall
 * below each is highlighted along its top edge. */
export const applyStoneFinish = (material: MeshStandardMaterial, ledges: readonly number[]): void => {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECLARATIONS}`)
      .replace("#include <begin_vertex>", VERTEX_PATCH);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${fragmentDeclarations(ledges)}`)
      .replace("#include <color_fragment>", COLOR_PATCH)
      .replace("#include <roughnessmap_fragment>", ROUGHNESS_PATCH);
  };
  material.customProgramCacheKey = () => `muster-banner-stone:${ledges.join(",")}`;
};
