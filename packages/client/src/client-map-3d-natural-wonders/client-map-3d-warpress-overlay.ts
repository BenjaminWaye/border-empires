import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Warpress natural wonder: a massive stamping forge with an animated
 * hammer striking an anvil, on scorched/heat-glow ground (see docs/
 * natural-wonders-design.md §2.4 and the Storybook reference at packages/
 * storybook/src/wonders/Warpress.stories.ts, which this overlay matches
 * geometry/shader-for-shader). Mustering flags fill 2x faster; +1 flag
 * slot (max 6).
 */
const HAMMER_SPEED = 1.0;
const SPARK_COUNT = 40;
// Transparent effect layers (ground glow, sparks) must render above the
// ownership overlay's tint (renderOrder 6/7, opacity up to 0.85 — see
// client-map-3d-ownership-overlay.ts) or a claimed wonder tile's own color
// would wash the effect out. Opaque structural parts don't need this.
const TRANSPARENT_RENDER_ORDER = 10;

const uTime = { value: 0 };
const uOrange = { value: new Color(0xff6020) };

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

const groundMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uOrange, uDark: { value: new Color(0x100a06) }, uCrack: { value: new Color(0x401808) } },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uOrange, uDark, uCrack;
      varying vec3 vWorldPos;
      float hash(vec2 p) { p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float noise(vec2 p) {
        vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec2 p = vWorldPos.xz;
        float dist = length(p);
        float n = noise(p*4.0)*0.6+noise(p*9.0)*0.2;
        vec3 scorch = mix(uDark, uCrack, n);
        float impact = exp(-dist*1.4)*0.7;
        float pulse = sin(uTime*3.0)*0.15+0.85;
        vec3 color = scorch + uOrange * impact * pulse;
        float crack = smoothstep(0.7,0.75,n)*0.3;
        color += uOrange*0.4*crack*pulse;
        float alpha = clamp(impact*1.4 + crack*1.2, 0.0, 1.0) * smoothstep(1.5, 1.0, dist);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

const ironMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uIron: { value: new Color(0x2a2825) }, uGlow: { value: new Color(0x553020) }, uOrange },
    vertexShader: `
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vViewPos = mv.xyz;
        vWorldPos = (modelMatrix * vec4(position,1.0)).xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uIron, uGlow, uOrange;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0-max(dot(vNormal,vd),0.0),2.5);
        vec3 c = mix(uIron, uGlow, f*0.4);
        float heat = exp(-abs(vWorldPos.y)*2.0)*0.2;
        c += uOrange*heat;
        c *= 0.5+0.5*max(dot(vNormal,normalize(vec3(1,2,1))),0.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

const sparkMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float cycle = mod(uTime*2.0+phase, 3.14159);
        p.y = cycle*0.3;
        p.x += sin(phase*5.0)*cycle*0.2;
        p.z += cos(phase*7.0)*cycle*0.15;
        vAlpha = (1.0-cycle/3.14159)*0.8;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 3.0*(1.0/-mv.z);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord-0.5);
        vec3 c = mix(vec3(1.0,0.8,0.2), vec3(1.0,0.3,0.05), d*2.0);
        gl_FragColor = vec4(c, smoothstep(0.5,0.0,d)*vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

function makeSparkGeometry(): BufferGeometry {
  const pos = new Float32Array(SPARK_COUNT * 3);
  const phases = new Float32Array(SPARK_COUNT);
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    pos[i * 3] = (Math.random() - 0.5) * 0.4;
    pos[i * 3 + 1] = Math.random() * 0.8;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("phase", new Float32BufferAttribute(phases, 1));
  return geo;
}

/** Anvil, support pillars and cross beams: static parts, merged into one draw call per slot. */
function buildAnvilRigGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  const anvil = new BoxGeometry(0.8, 0.15, 0.5);
  anvil.translate(0, 0.075, 0);
  parts.push(anvil);
  const anvilTop = new BoxGeometry(0.5, 0.1, 0.3);
  anvilTop.translate(0, 0.2, 0);
  parts.push(anvilTop);

  const pivot = new CylinderGeometry(0.03, 0.03, 0.06, 8);
  pivot.translate(0, 0.7, 0);
  parts.push(pivot);

  for (let side = -1; side <= 1; side += 2) {
    const pillar = new BoxGeometry(0.06, 0.8, 0.06);
    pillar.translate(side * 0.45, 0.4, 0);
    parts.push(pillar);
  }
  const beam = new BoxGeometry(0.96, 0.05, 0.05);
  beam.translate(0, 0.8, 0);
  parts.push(beam);

  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

export const createWarpressOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "warpress-overlay";
  scene.add(group);

  const groundGeometry = new PlaneGeometry(3, 3, 32, 32);
  groundGeometry.rotateX(-Math.PI / 2);
  const gMat = groundMaterial();

  const iMat = ironMaterial();
  const rigGeometry = buildAnvilRigGeometry();

  const handleGeometry = new BoxGeometry(0.03, 0.5, 0.03);
  const headGeometry = new BoxGeometry(0.25, 0.12, 0.15);

  const sparkGeometry = makeSparkGeometry();
  const spMat = sparkMaterial();

  const makeSlots = <T extends Mesh | Points>(factory: () => T, renderOrder = 0): T[] =>
    Array.from({ length: maxTiles }, () => {
      const obj = factory();
      obj.visible = false;
      obj.frustumCulled = false;
      obj.renderOrder = renderOrder;
      group.add(obj);
      return obj;
    });

  const groundSlots = makeSlots(() => new Mesh(groundGeometry, gMat), TRANSPARENT_RENDER_ORDER);
  const rigSlots = makeSlots(() => new Mesh(rigGeometry, iMat));
  const handleSlots = makeSlots(() => new Mesh(handleGeometry, iMat));
  const headSlots = makeSlots(() => new Mesh(headGeometry, iMat));
  const sparkSlots = makeSlots(() => new Points(sparkGeometry, spMat), TRANSPARENT_RENDER_ORDER);

  const wonders: ActiveWonder[] = [];

  const clear = (): void => { wonders.length = 0; };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number): void => {
    const hash = (((centerX * 92_821) ^ (centerZ * 68_917)) >>> 0);
    wonders.push({ centerX, centerZ, surfaceY, phase: ((hash % 1000) / 1000) * Math.PI * 2 });
  };

  const update = (nowMs: number): void => {
    const t = nowMs / 1000;
    uTime.value = t;
    const count = Math.min(wonders.length, maxTiles);

    for (let i = 0; i < maxTiles; i += 1) {
      const active = i < count;
      groundSlots[i]!.visible = active;
      rigSlots[i]!.visible = active;
      handleSlots[i]!.visible = active;
      headSlots[i]!.visible = active;
      sparkSlots[i]!.visible = active;
      if (!active) continue;

      const w = wonders[i]!;
      groundSlots[i]!.position.set(w.centerX, w.surfaceY + 0.01, w.centerZ);
      rigSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);

      // Hammer bounces up and down, striking the anvil once per cycle.
      const cycle = t * HAMMER_SPEED + w.phase;
      const strike = Math.abs(Math.sin(cycle * Math.PI));
      const headY = 0.18 + (1 - strike) * 0.35;
      const handleY = 0.45 + (1 - strike) * 0.175;
      headSlots[i]!.position.set(w.centerX, w.surfaceY + headY, w.centerZ);
      handleSlots[i]!.position.set(w.centerX, w.surfaceY + handleY, w.centerZ);
      handleSlots[i]!.scale.set(1, 0.7 + strike * 0.3, 1);

      sparkSlots[i]!.position.set(w.centerX, w.surfaceY + 0.2, w.centerZ);
    }
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    groundGeometry.dispose(); rigGeometry.dispose(); handleGeometry.dispose(); headGeometry.dispose(); sparkGeometry.dispose();
    gMat.dispose(); iMat.dispose(); spMat.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
