// The muster banner's cloth: a lit, sheened fabric whose every vertex is
// placed by the vertex shader, so it billows in the wind with no per-frame
// CPU work beyond one time uniform.
//
// The cloth hangs from its crossbar. The wind is three travelling waves
// rolling down and across it, their reach growing from nothing at the bar
// (where the cloth is tied) to full at the tail, which also swings out to
// the side on a slow, irregular gust. Normals come from finite differences
// of the same function, so the folds catch the sun and shade properly on
// both faces. The fragment pass paints the gonfalon's livery over the
// owner's colour (per-instance instanceColor): pale side bands, a brass
// hem and a cog device in the middle.
//
// Per instance, `aBannerWind` = (phase 0..1, speed multiplier): banners
// across the map don't billow in lockstep, and ADVANCE-mode banners whip faster.
import {
  Color,
  DoubleSide,
  MeshDepthMaterial,
  MeshPhysicalMaterial,
  RGBADepthPacking,
  type WebGLProgramParametersWithUniforms
} from "three";
import { BANNER_CLOTH } from "./muster-banner-geometry.js";

/** The shader clock wraps every this many seconds, so float precision never degrades. */
const TIME_PERIOD = 3600;

const glslFloat = (value: number): string => value.toFixed(5);

const SHAPE_CONSTANTS = /* glsl */ `
const float BANNER_TOP_Y = ${glslFloat(BANNER_CLOTH.topY)};
const float BANNER_Z = ${glslFloat(BANNER_CLOTH.z)};
const float BANNER_WIDTH = ${glslFloat(BANNER_CLOTH.width)};
const float BANNER_HEIGHT = ${glslFloat(BANNER_CLOTH.height)};
const float BANNER_TAIL = ${glslFloat(BANNER_CLOTH.tail)};
float bannerColumnLength(float u) {
  return BANNER_HEIGHT * (1.0 - BANNER_TAIL * abs(2.0 * u - 1.0));
}
`;

const POINT_DECLARATIONS = /* glsl */ `
attribute vec2 aBannerUv;
attribute vec2 aBannerWind;
uniform float uBannerTime;
${SHAPE_CONSTANTS}
float bannerClock() {
  return uBannerTime * aBannerWind.y + aBannerWind.x * 6.2831853;
}
// 0.56..1: a slow, irregular gust.
float bannerGust(float t) {
  return 0.78 + 0.22 * sin(t * 0.61) * sin(t * 0.23 + 1.3);
}
vec3 bannerPoint(vec2 uv, float t, float gust) {
  float u = uv.x;
  float drop = 1.0 - uv.y; // 0 at the crossbar, 1 at the hem
  float x = (u - 0.5) * BANNER_WIDTH;
  float y = BANNER_TOP_Y - drop * bannerColumnLength(u);
  // Tied along the bar, freest at the tail.
  float reach = drop * (0.25 + 0.75 * drop);
  float w1 = sin(drop * 6.5 - t * 3.4 + u * 2.2);
  float w2 = sin(u * 8.0 + drop * 4.5 - t * 5.3 + 1.3);
  float w3 = sin(u * 15.0 - drop * 11.0 - t * 8.7);
  // Billows forward, away from the pole behind it: the bias outweighs the
  // waves' deepest trough, so a fold never swings back through the pole.
  float z = ((w1 * 0.045 + w2 * 0.016 + w3 * 0.005) * gust + 0.07) * reach;
  // The gust lifts the tail out to the side; the cloth spent swinging
  // pulls the hem up a little.
  float swing = reach * (0.028 * gust + 0.014 * sin(t * 1.3 + 0.7));
  x += swing;
  y += abs(swing) * 0.35 + w2 * 0.004 * reach;
  return vec3(x, y, BANNER_Z + z);
}
`;

const NORMAL_DECLARATIONS = /* glsl */ `
vec3 bannerNormal(vec2 uv, float t, float gust) {
  vec2 e = vec2(0.008, 0.0);
  vec3 du = bannerPoint(uv + e.xy, t, gust) - bannerPoint(uv - e.xy, t, gust);
  vec3 dv = bannerPoint(uv + e.yx, t, gust) - bannerPoint(uv - e.yx, t, gust);
  return normalize(cross(du, dv));
}
varying vec2 vBannerUv;
varying float vBannerFold;
`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
varying vec2 vBannerUv;
varying float vBannerFold;
uniform vec3 uBannerTrim;
uniform vec3 uBannerBand;
${SHAPE_CONSTANTS}
// Antialiased 1 inside / 0 outside for a signed distance d (negative inside).
float bannerFill(float d) {
  float aa = max(fwidth(d), 1e-4);
  return 1.0 - smoothstep(-aa, aa, d);
}
// Embroidered cog: a toothed ring round a hub. p is in half-widths.
float bannerCog(vec2 p) {
  float r = length(p);
  float teeth = smoothstep(-0.25, 0.25, sin(atan(p.y, p.x) * 8.0));
  float outer = bannerFill(r - (0.46 + 0.1 * teeth));
  float hole = bannerFill(r - 0.27);
  float hub = bannerFill(r - 0.12);
  return clamp(outer - hole + hub, 0.0, 1.0);
}
`;

const COLOR_PATCH = /* glsl */ `
#include <color_fragment>
{
  float u = vBannerUv.x;
  float drop = 1.0 - vBannerUv.y;
  float column = bannerColumnLength(u);
  // Distances in tile units from the side edges and from the hem.
  float side = min(u, 1.0 - u) * BANNER_WIDTH;
  float hem = (1.0 - drop) * column;
  float band = bannerFill(side - BANNER_WIDTH * 0.15);
  float trim = max(bannerFill(hem - 0.014), bannerFill(side - 0.008));
  vec2 cogP = vec2((u - 0.5) * BANNER_WIDTH, (0.42 - drop) * column) / (BANNER_WIDTH * 0.5);
  float device = bannerCog(cogP / 0.8);
  // Folds turned away from the camera sit in their own shade.
  float shade = 0.84 + 0.16 * (vBannerFold * 0.5 + 0.5);
  // On light (yellow, gold) banners the brass thread would vanish: darken it to bronze.
  float clothLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 thread = uBannerTrim * mix(1.0, 0.4, smoothstep(0.3, 0.45, clothLuma));
  diffuseColor.rgb = mix(diffuseColor.rgb, uBannerBand, band);
  diffuseColor.rgb = mix(diffuseColor.rgb, thread, max(trim, device));
  diffuseColor.rgb *= shade;
}
`;

const VERTEX_POINT = /* glsl */ `
float bannerT = bannerClock();
float bannerG = bannerGust(bannerT);
vec3 transformed = bannerPoint(aBannerUv, bannerT, bannerG);
`;

export type MusterBannerClothMaterials = {
  readonly cloth: MeshPhysicalMaterial;
  /** Shadow pass, billowing exactly like the visible cloth. */
  readonly depth: MeshDepthMaterial;
  /** Sets the shared wind clock; call once per frame. */
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

export const createMusterBannerClothMaterials = (): MusterBannerClothMaterials => {
  const time = { value: 0 };
  const trim = { value: new Color("#d8b066") };
  const band = { value: new Color("#ece3cc") };

  const cloth = new MeshPhysicalMaterial({
    color: "#ffffff",
    roughness: 0.8,
    metalness: 0,
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: new Color("#8a8a8a"),
    side: DoubleSide
  });
  cloth.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uBannerTime = time;
    shader.uniforms.uBannerTrim = trim;
    shader.uniforms.uBannerBand = band;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${POINT_DECLARATIONS}${NORMAL_DECLARATIONS}`)
      .replace(
        "#include <beginnormal_vertex>",
        `float bannerNT = bannerClock();\nvec3 objectNormal = bannerNormal(aBannerUv, bannerNT, bannerGust(bannerNT));`
      )
      .replace(
        "#include <begin_vertex>",
        `${VERTEX_POINT}\nvBannerUv = aBannerUv;\nfloat bannerDrop = 1.0 - aBannerUv.y;\nvBannerFold = clamp((transformed.z - BANNER_Z - 0.07 * bannerDrop * (0.25 + 0.75 * bannerDrop)) / 0.045, -1.0, 1.0);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_DECLARATIONS}`)
      .replace("#include <color_fragment>", COLOR_PATCH);
  };
  cloth.customProgramCacheKey = () => "muster-banner-cloth";

  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide });
  depth.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uBannerTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${POINT_DECLARATIONS}`)
      .replace("#include <begin_vertex>", VERTEX_POINT);
  };
  depth.customProgramCacheKey = () => "muster-banner-cloth-depth";

  return {
    cloth,
    depth,
    tick: (nowMs) => {
      time.value = (nowMs / 1000) % TIME_PERIOD;
    },
    dispose: () => {
      cloth.dispose();
      depth.dispose();
    }
  };
};
