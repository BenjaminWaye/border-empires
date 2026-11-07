// Tier-upgrade growth for the instanced 3D towns, entirely in the vertex
// shader: each live town instance carries a `townGrow` attribute (start time
// on the town shader clock, mode). Mode 1 grows the instance's buildings up
// out of the ground, centre first and rippling outward, springing a little
// past full height; mode 2 sinks the old tier's town into the ground. The
// base plate spreads out instead of rising. Mirrors the shared timeline in
// client-town-tier-upgrade-fx.ts so the 2D map plays the same beat.
//
// The clock is the towns' wrapped shader time (town-animation-shaders.ts),
// so a transition needs no per-frame CPU work. An age past half the wrap
// period counts as long finished, so a town never replays its growth when
// the clock wraps before the next rebuild.
import type { Material, MeshBasicMaterial, MeshDepthMaterial, MeshStandardMaterial, WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import {
  TOWN_GROWTH_OVERSHOOT,
  TOWN_GROWTH_RISE_MS,
  TOWN_GROWTH_SINK_MS,
  TOWN_GROWTH_SPREAD_MS,
  TOWN_GROWTH_START_MS
} from "../client-town-tier-upgrade-fx/client-town-tier-upgrade-fx.js";
import { TOWN_TIME_PERIOD, townTime } from "./town-animation-shaders.js";

/** No growth: a town standing as usual. */
export const TOWN_GROW_NONE = 0;
/** The new tier rising out of the ground. */
export const TOWN_GROW_RISE = 1;
/** The old tier sinking away. */
export const TOWN_GROW_SINK = 2;
export type TownGrowMode = typeof TOWN_GROW_NONE | typeof TOWN_GROW_RISE | typeof TOWN_GROW_SINK;

/** Plate radius (model units) the growth ripple is normalised to: the biggest tier's plate. */
export const TOWN_GROWTH_RADIUS = 0.5;

/** Town shader-clock seconds at a performance.now() time. */
export const townClockSecondsAt = (performanceMs: number): number =>
  (((performanceMs / 1000) % TOWN_TIME_PERIOD) + TOWN_TIME_PERIOD) % TOWN_TIME_PERIOD;

const s = (ms: number): string => (ms / 1000).toFixed(4);

const DECLARATIONS = /* glsl */ `
attribute vec2 townGrow;
float townGrowBackOut(float p) {
  float q = p - 1.0;
  return 1.0 + ${(TOWN_GROWTH_OVERSHOOT + 1).toFixed(4)} * q * q * q + ${TOWN_GROWTH_OVERSHOOT.toFixed(4)} * q * q;
}
`;

const growthChunk = (plinth: boolean): string => /* glsl */ `
if (townGrow.y > 0.5) {
  float townAge = mod(uTownTime - townGrow.x + ${TOWN_TIME_PERIOD.toFixed(1)}, ${TOWN_TIME_PERIOD.toFixed(1)});
  bool townDone = townAge > ${(TOWN_TIME_PERIOD / 2).toFixed(1)};
  if (townGrow.y < 1.5) {
${plinth ? `
    float townSpread = townDone ? 1.0 : smoothstep(0.0, ${s(TOWN_GROWTH_START_MS + 300)}, townAge);
    transformed.xz *= mix(0.7, 1.0, townSpread);
` : `
    float townR = clamp(length(position.xz) / ${TOWN_GROWTH_RADIUS.toFixed(3)}, 0.0, 1.0);
    float townP = townDone ? 1.0 : clamp((townAge - ${s(TOWN_GROWTH_START_MS)} - townR * ${s(TOWN_GROWTH_SPREAD_MS)}) / ${s(TOWN_GROWTH_RISE_MS)}, 0.0, 1.0);
    if (townP <= 0.0) {
      transformed = vec3(0.0);
    } else if (townP < 1.0) {
      transformed.y *= townGrowBackOut(townP);
      transformed.xz += vec2(sin(townAge * 23.0 + townR * 9.0), cos(townAge * 19.0 + townR * 7.0)) * 0.006 * (1.0 - townP);
    }
`}
  } else {
${plinth ? `
    transformed = vec3(0.0);
` : `
    float townSinkP = townDone ? 1.0 : clamp(townAge / ${s(TOWN_GROWTH_SINK_MS)}, 0.0, 1.0);
    float townSink = 1.0 - townSinkP * townSinkP;
    if (townSink <= 0.0) {
      transformed = vec3(0.0);
    } else {
      transformed.y *= townSink;
      transformed.xz += vec2(sin(townAge * 41.0), cos(townAge * 37.0)) * 0.008 * townSinkP;
    }
`}
  }
}
`;

type GrowthMaterial = MeshStandardMaterial | MeshBasicMaterial | MeshDepthMaterial | Material;

/**
 * Adds tier-upgrade growth to a live town material, on top of whatever
 * shader hook (spin, steam, marble) it already has. `plinth`: the base plate,
 * which spreads out rather than rising, and vanishes at once when sinking.
 */
export const applyTownGrowth = (material: GrowthMaterial, plinth = false): void => {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    previous(shader, renderer);
    const needsClock = !shader.vertexShader.includes("uniform float uTownTime");
    shader.uniforms.uTownTime = townTime;
    shader.vertexShader = (needsClock ? "uniform float uTownTime;\n" : "") + DECLARATIONS + shader.vertexShader
      .replace("#include <project_vertex>", `${growthChunk(plinth)}\n#include <project_vertex>`);
  };
  material.customProgramCacheKey = () => `${previousKey()}|town-grow-${plinth ? "plinth" : "part"}`;
};
