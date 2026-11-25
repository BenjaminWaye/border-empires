// Materials of the High-noble standard's regalia (muster-banner-regalia.ts).
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  ShaderMaterial,
  type Texture,
  type WebGLProgramParametersWithUniforms
} from "three";
import { applyBuildingEnvMap } from "../client-map-3d-building-envmap/client-map-3d-building-envmap.js";
import { STREAMER_LENGTH } from "./muster-banner-regalia-geometry.js";

/** The shader clock wraps every this many seconds, so float precision never degrades. */
const TIME_PERIOD = 3600;

export type RegaliaMaterials = {
  /** Polished gold: reflects the building environment map, with a warm floor so it never reads brown in shade. */
  readonly gold: MeshPhysicalMaterial;
  /** Cut gems in the owner's colour (instanceColor), lit from within. */
  readonly gem: MeshPhysicalMaterial;
  /** Silk streamers in the owner's colour, rippling, edged and banded in gold. */
  readonly streamer: MeshPhysicalMaterial;
  /** Camera-facing glints on the gilding. */
  readonly sparkle: ShaderMaterial;
  /** The shared shader clock, in seconds; the glow and dust (muster-banner-regalia-fx.ts) read it too. */
  readonly time: { value: number };
  readonly tick: (nowMs: number) => void;
  readonly dispose: () => void;
};

const STREAMER_VERTEX = /* glsl */ `
#include <begin_vertex>
{
  float along = uv.y;
  // Tied at the crossbar, freest at the tail; each side a little out of step.
  float reach = along * (0.3 + 0.7 * along);
  float t = uStreamerTime * 2.6 + aStreamerSide * 0.9 + aStreamerPhase * 6.2831853;
  transformed.z += (sin(along * 9.0 - t) * 0.03 + sin(along * 17.0 - t * 1.7) * 0.012 + 0.03) * reach;
  transformed.x += aStreamerSide * (0.07 * along + sin(along * 6.0 - t * 0.8) * 0.018 * reach);
  transformed.y += 0.02 * reach * abs(sin(along * 9.0 - t));
  vStreamerUv = uv;
}
`;

const STREAMER_FRAGMENT = /* glsl */ `
#include <color_fragment>
{
  float across = abs(vStreamerUv.x - 0.5) * 2.0;
  float along = vStreamerUv.y;
  // Swallow tail: a notch cut up the middle of the last sixth.
  if (along > 0.84 && across < (along - 0.84) / 0.16) discard;
  float edge = smoothstep(0.7, 0.78, across);
  float bands = max(1.0 - smoothstep(0.0, 0.012, abs(along - 0.3)), 1.0 - smoothstep(0.0, 0.012, abs(along - 0.58)));
  float tip = smoothstep(0.84, 0.86, along) * smoothstep(0.02, 0.0, abs(across - (along - 0.84) / 0.16) - 0.12);
  gStreamerGold = clamp(max(max(edge, bands), tip), 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.8, 0.33), gStreamerGold);
}
`;

export const createRegaliaMaterials = (envMap?: Texture): RegaliaMaterials => {
  const time = { value: 0 };

  const gold = new MeshPhysicalMaterial({
    color: "#ffcf55", roughness: 0.24, metalness: 0.8, clearcoat: 0.6, clearcoatRoughness: 0.15,
    emissive: new Color("#3d2a06"), flatShading: true
  });
  gold.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    // A sheen that sweeps up the gilding every few seconds, as if the light were moving.
    shader.uniforms.uGoldTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vGoldSweep;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGoldSweep = transformed.y * 3.0 + transformed.x * 1.5;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vGoldSweep;\nuniform float uGoldTime;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.82, 0.42) * 0.55 * pow(max(0.0, sin(vGoldSweep - uGoldTime * 1.3)), 24.0);"
      );
  };
  gold.customProgramCacheKey = () => "muster-banner-regalia-gold";

  const gem = new MeshPhysicalMaterial({
    color: "#ffffff", roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, flatShading: true
  });
  gem.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    // Lit from within in its own colour, so the owner's colour carries at a distance.
    shader.uniforms.uGemTime = time;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uGemTime;")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance += vColor.rgb * (0.42 + 0.16 * sin(uGemTime * 1.6));\n#endif"
      );
  };
  gem.customProgramCacheKey = () => "muster-banner-regalia-gem";

  const streamer = new MeshPhysicalMaterial({
    color: "#ffffff", roughness: 0.6, metalness: 0, sheen: 1, sheenRoughness: 0.4, sheenColor: new Color("#9a9a9a"), side: DoubleSide
  });
  streamer.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uStreamerTime = time;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aStreamerSide;\nattribute float aStreamerPhase;\nuniform float uStreamerTime;\nvarying vec2 vStreamerUv;")
      .replace("#include <begin_vertex>", STREAMER_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vStreamerUv;\nfloat gStreamerGold = 0.0;")
      .replace("#include <color_fragment>", STREAMER_FRAGMENT)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, gStreamerGold);")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.8, gStreamerGold);");
  };
  streamer.customProgramCacheKey = () => "muster-banner-regalia-streamer";

  for (const material of [gold, gem, streamer]) applyBuildingEnvMap(material, envMap);

  const sparkle = new ShaderMaterial({
    uniforms: { uSparkleTime: time },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSparklePhase;
      uniform float uSparkleTime;
      varying vec2 vSparkleUv;
      varying float vSparkle;
      void main() {
        vSparkleUv = uv - 0.5;
        // A brief glint every few seconds, each on its own beat.
        vSparkle = pow(max(0.0, sin(uSparkleTime * (1.3 + aSparklePhase) + aSparklePhase * 40.0)), 14.0);
        vec4 mvCentre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mvCentre.xy += position.xy * (0.06 + 0.1 * vSparkle);
        gl_Position = projectionMatrix * mvCentre;
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vSparkleUv;
      varying float vSparkle;
      void main() {
        vec2 p = abs(vSparkleUv);
        float core = pow(max(0.0, 1.0 - length(vSparkleUv) * 2.0), 3.0);
        // Four-pointed star: two thin, tapering arms.
        float arms = max(0.0, 1.0 - p.y * 36.0) * max(0.0, 1.0 - p.x * 2.0) + max(0.0, 1.0 - p.x * 36.0) * max(0.0, 1.0 - p.y * 2.0);
        float alpha = (core + arms * 0.8) * vSparkle;
        gl_FragColor = vec4(vec3(1.0, 0.94, 0.72) * alpha, alpha);
      }`
  });

  return {
    gold, gem, streamer, sparkle, time,
    tick: (nowMs) => { time.value = (nowMs / 1000) % TIME_PERIOD; },
    dispose: () => { for (const material of [gold, gem, streamer, sparkle]) material.dispose(); }
  };
};

/** Length of a streamer; re-exported for the material's tests. */
export const REGALIA_STREAMER_LENGTH = STREAMER_LENGTH;
