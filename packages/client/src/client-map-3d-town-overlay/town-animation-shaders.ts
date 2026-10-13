// GPU-side town animation, driven by the per-vertex animA/animB attributes
// the town-mesh-builder bakes in (see TownAnim there) and one shared time
// uniform. Nothing moves on the CPU: spinning parts (cogs, orrery hoops,
// halos, crystals, circling airships) rotate in the vertex shader, lamplight
// flickers in the glow fragment shader, and steam puffs rise, swell and fade
// in their own shader -- so a screen full of towns costs no per-frame work
// beyond setting the time.
import type { Material, MeshBasicMaterial, MeshDepthMaterial, MeshStandardMaterial } from "three";

/** The shader clock wraps every this many seconds, so float precision never
 * degrades however long the page stays open. Every spin speed, steam rate and
 * flicker frequency is a whole number of cycles per period (loopSpeed /
 * loopRate), so the wrap returns every part exactly where it started. */
export const TOWN_TIME_PERIOD = 3600;

/** Nearest angular speed (rad/s) that turns a whole number of times per period. */
export const loopSpeed = (speed: number): number => {
  const turn = (2 * Math.PI) / TOWN_TIME_PERIOD;
  return Math.round(speed / turn) * turn;
};

/** Nearest rate (cycles/s) that loops a whole number of times per period. */
export const loopRate = (rate: number): number => Math.round(rate * TOWN_TIME_PERIOD) / TOWN_TIME_PERIOD;

/** Seconds, wrapped at TOWN_TIME_PERIOD. */
const townTime = { value: 0 };

export const tickTownTime = (): void => {
  townTime.value = (performance.now() / 1000) % TOWN_TIME_PERIOD;
};

const DECLARATIONS = /* glsl */ `
attribute vec4 animA;
attribute vec4 animB;
uniform float uTownTime;
varying float vTownPhase;
vec3 townRotate(vec3 v, vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}
`;

const SPIN_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
if (animA.w != 0.0) objectNormal = townRotate(objectNormal, normalize(animB.xyz), uTownTime * animA.w);
`;

const SPIN_POSITION = /* glsl */ `
#include <begin_vertex>
vTownPhase = animB.w;
if (animA.w != 0.0) {
  transformed = animA.xyz + townRotate(transformed - animA.xyz, normalize(animB.xyz), uTownTime * animA.w);
}
`;

const FLICKER = /* glsl */ `
#include <color_fragment>
diffuseColor.rgb *= 0.86 + 0.14 * sin(uTownTime * ${loopSpeed(2.1).toFixed(8)} + vTownPhase * 6.2832)
  * sin(uTownTime * ${loopSpeed(0.67).toFixed(8)} + vTownPhase * 17.0);
`;

type ShaderHookMaterial = MeshStandardMaterial | MeshBasicMaterial | MeshDepthMaterial;

/** Spinning parts for a solid, glow or shadow-depth material; `flicker` also
 * makes it breathe like lamplight. */
export const applyTownSpin = (material: ShaderHookMaterial, flicker = false): void => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTownTime = townTime;
    shader.vertexShader = DECLARATIONS + shader.vertexShader
      .replace("#include <beginnormal_vertex>", SPIN_NORMAL)
      .replace("#include <begin_vertex>", SPIN_POSITION);
    if (flicker) {
      shader.fragmentShader = "uniform float uTownTime;\nvarying float vTownPhase;\n" +
        shader.fragmentShader.replace("#include <color_fragment>", FLICKER);
    }
  };
  material.customProgramCacheKey = () => `town-spin-${flicker ? "flicker" : "steady"}`;
};

const STEAM_POSITION = /* glsl */ `
#include <begin_vertex>
float townCycle = fract(uTownTime * animA.w + animB.w);
transformed = animA.xyz + (transformed - animA.xyz) * mix(0.6, 2.4, townCycle)
  + vec3(animB.x, animB.z, animB.y) * townCycle;
vTownFade = smoothstep(0.0, 0.12, townCycle) * (1.0 - smoothstep(0.5, 1.0, townCycle));
`;

/** Steam puffs: each rises from its vent, swells, drifts and fades, on a loop. */
export const applyTownSteam = (material: Material): void => {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTownTime = townTime;
    shader.vertexShader = "attribute vec4 animA;\nattribute vec4 animB;\nuniform float uTownTime;\nvarying float vTownFade;\n" +
      shader.vertexShader.replace("#include <begin_vertex>", STEAM_POSITION);
    shader.fragmentShader = "varying float vTownFade;\n" +
      shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vTownFade;");
  };
  material.customProgramCacheKey = () => "town-steam";
};
