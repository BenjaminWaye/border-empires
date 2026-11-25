// Light and atmosphere round the High-noble standard (muster-banner-regalia.ts):
// a soft glow behind the aureole and round each gem, and motes of gold dust
// drifting up past the cloth. Both are camera-facing quads drawn additively,
// animated entirely in their shaders. The map has no bloom pass, so the glow
// quads stand in for one.
import {
  AdditiveBlending,
  type Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  type Scene,
  ShaderMaterial
} from "three";
import { AUREOLE_Y, AUREOLE_Z, REGALIA_GEM_POINTS, REGALIA_TOP_Y } from "./muster-banner-regalia-geometry.js";

export type RegaliaFxFlag = { x: number; y: number; z: number; tint: Color; seed: number };

/** Motes of gold dust per flag. */
export const REGALIA_MOTES = 14;
/** Glow quads per flag: one behind the aureole, one round each gem. */
export const REGALIA_GLOWS = 1 + REGALIA_GEM_POINTS.length;
const GOLD_GLOW: readonly [number, number, number] = [1.0, 0.76, 0.32];
/** Widest the dust drifts from the pole: inside the plinth. */
export const REGALIA_MOTE_RADIUS = 0.24;

const BILLBOARD = /* glsl */ `
  vec4 mvCentre = modelViewMatrix * instanceMatrix * vec4(centre, 1.0);
  mvCentre.xy += position.xy * size;
  gl_Position = projectionMatrix * mvCentre;
`;

export const createRegaliaFx = (scene: Scene, max: number, time: { value: number }) => {
  const glowGeometry = new PlaneGeometry(1, 1);
  const glowParams = new InstancedBufferAttribute(new Float32Array(max * REGALIA_GLOWS * 2), 2); // size, phase
  const glowColor = new InstancedBufferAttribute(new Float32Array(max * REGALIA_GLOWS * 3), 3);
  glowGeometry.setAttribute("aGlow", glowParams);
  glowGeometry.setAttribute("aGlowColor", glowColor);
  const glowMaterial = new ShaderMaterial({
    uniforms: { uFxTime: time },
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec2 aGlow;
      attribute vec3 aGlowColor;
      uniform float uFxTime;
      varying vec2 vFxUv;
      varying vec3 vFxColor;
      void main() {
        vFxUv = uv - 0.5;
        // Breathes slowly; never goes dark.
        float pulse = 0.82 + 0.18 * sin(uFxTime * 1.6 + aGlow.y * 6.2831853);
        vFxColor = aGlowColor * pulse;
        vec3 centre = vec3(0.0);
        float size = aGlow.x * (0.94 + 0.06 * pulse);
        ${BILLBOARD}
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vFxUv;
      varying vec3 vFxColor;
      void main() {
        float falloff = pow(max(0.0, 1.0 - length(vFxUv) * 2.0), 2.2);
        gl_FragColor = vec4(vFxColor * falloff, falloff);
      }`
  });
  const glows = new InstancedMesh(glowGeometry, glowMaterial, max * REGALIA_GLOWS);
  glows.name = "muster-banner-regalia-glow";
  glows.renderOrder = 35; // behind the sparkles, over the terrain

  const moteGeometry = new PlaneGeometry(1, 1);
  const moteParams = new InstancedBufferAttribute(new Float32Array(max * REGALIA_MOTES * 3), 3); // angle, radius, phase
  moteGeometry.setAttribute("aMote", moteParams);
  const moteMaterial = new ShaderMaterial({
    uniforms: { uFxTime: time },
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aMote;
      uniform float uFxTime;
      varying vec2 vFxUv;
      varying float vFxAlpha;
      void main() {
        vFxUv = uv - 0.5;
        // Rises from the plinth to the head of the standard over about 14 seconds, circling as it goes.
        float rise = fract(uFxTime * (0.06 + 0.03 * aMote.z) + aMote.z);
        float angle = aMote.x + rise * 2.4 + sin(uFxTime * 0.7 + aMote.z * 20.0) * 0.3;
        float radius = aMote.y * (1.0 - 0.35 * rise);
        vec3 centre = vec3(cos(angle) * radius, 0.08 + rise * ${(REGALIA_TOP_Y - 0.12).toFixed(4)}, sin(angle) * radius);
        vFxAlpha = smoothstep(0.0, 0.12, rise) * (1.0 - smoothstep(0.75, 1.0, rise)) * (0.55 + 0.45 * sin(uFxTime * 5.0 + aMote.z * 40.0));
        float size = 0.03 + 0.02 * aMote.z;
        ${BILLBOARD}
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vFxUv;
      varying float vFxAlpha;
      void main() {
        float falloff = pow(max(0.0, 1.0 - length(vFxUv) * 2.0), 1.6) * vFxAlpha;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.5) * falloff, falloff);
      }`
  });
  const motes = new InstancedMesh(moteGeometry, moteMaterial, max * REGALIA_MOTES);
  motes.name = "muster-banner-regalia-motes";
  motes.renderOrder = 36;

  const meshes = [glows, motes];
  for (const mesh of meshes) {
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  scene.add(...meshes);
  const matrix = new Matrix4();

  const commit = (flags: readonly RegaliaFxFlag[]): void => {
    glows.count = flags.length * REGALIA_GLOWS;
    motes.count = flags.length * REGALIA_MOTES;
    if (flags.length === 0) return;
    for (const [i, flag] of flags.entries()) {
      const g = i * REGALIA_GLOWS;
      // Behind the aureole: wide, gold, a little of the owner's colour in it.
      glows.setMatrixAt(g, matrix.makeTranslation(flag.x, flag.y + AUREOLE_Y, flag.z + AUREOLE_Z - 0.03));
      glowParams.setXY(g, 0.7, flag.seed);
      glowColor.setXYZ(g, GOLD_GLOW[0] * 0.8 + flag.tint.r * 0.1, GOLD_GLOW[1] * 0.8 + flag.tint.g * 0.1, GOLD_GLOW[2] * 0.8 + flag.tint.b * 0.1);
      for (const [k, point] of REGALIA_GEM_POINTS.entries()) {
        glows.setMatrixAt(g + 1 + k, matrix.makeTranslation(flag.x + point[0], flag.y + point[1], flag.z + point[2]));
        glowParams.setXY(g + 1 + k, k === 0 ? 0.24 : 0.18, (flag.seed + k * 0.23) % 1);
        glowColor.setXYZ(g + 1 + k, flag.tint.r * 0.9, flag.tint.g * 0.9, flag.tint.b * 0.9);
      }
      for (let m = 0; m < REGALIA_MOTES; m += 1) {
        const n = i * REGALIA_MOTES + m;
        motes.setMatrixAt(n, matrix.makeTranslation(flag.x, flag.y, flag.z));
        const phase = (flag.seed * 3.7 + m / REGALIA_MOTES + m * 0.137) % 1;
        moteParams.setXYZ(n, m * 2.399963, REGALIA_MOTE_RADIUS * (0.55 + 0.45 * ((m * 0.618) % 1)), phase);
      }
    }
    for (const attribute of [glows.instanceMatrix, motes.instanceMatrix, glowParams, glowColor, moteParams]) attribute.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(...meshes);
    for (const mesh of meshes) mesh.dispose();
    for (const item of [glowGeometry, moteGeometry, glowMaterial, moteMaterial]) item.dispose();
  };

  return { commit, dispose };
};
