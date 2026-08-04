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
 * Conscription Engine natural wonder: an industrial compound with barracks
 * wings, smokestacks, a command tower, and a wall perimeter, sitting on
 * scorched ground (see docs/natural-wonders-design.md §2.3 and the
 * Storybook reference at packages/storybook/src/wonders/
 * ConscriptionEngine.stories.ts, which this overlay matches geometry/
 * shader-for-shader). +2000 flat manpower cap; instant +2000 manpower on
 * first claim.
 */
const TOWER_HEIGHT = 0.8;
const SMOKE_COUNT = 60;
// Transparent effect layers (ground glow, smoke) must render above the
// ownership overlay's tint (renderOrder 6/7, opacity up to 0.85 — see
// client-map-3d-ownership-overlay.ts) or a claimed wonder tile's own color
// would wash the effect out. Opaque structural parts don't need this.
const TRANSPARENT_RENDER_ORDER = 10;

const uTime = { value: 0 };
const uAmber = { value: new Color(0xe8a030) };

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

const groundMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uAmber },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = mat3(modelMatrix) * position;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uAmber;
      varying vec3 vWorldPos;
      float hash(vec2 p) { p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float noise(vec2 p) {
        vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec2 p = vWorldPos.xz;
        float dist = length(p);
        float n = noise(p*3.0)*0.5+noise(p*7.0)*0.25;
        float heat = exp(-dist*1.2)*0.6;
        float pulse = sin(uTime*0.8)*0.1+0.9;
        float scorch = smoothstep(1.6, 0.0, dist) * (0.25 + n*0.35);
        float alpha = clamp(heat*pulse + scorch, 0.0, 1.0);
        gl_FragColor = vec4(uAmber*(0.7+heat*pulse), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

const buildingMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uIron: { value: new Color(0x3a3835) }, uHighlight: { value: new Color(0x6a6058) }, uAmber },
    vertexShader: `
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vViewPos = mv.xyz;
        vWorldPos = mat3(modelMatrix) * position;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uIron, uHighlight, uAmber;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0-max(dot(vNormal,vd),0.0),2.0);
        vec3 c = mix(uIron, uHighlight, f*0.5);
        float glow = exp(-abs(vWorldPos.y-0.8)*3.0)*0.3;
        c += uAmber*glow*(sin(uTime*1.5+vWorldPos.x*3.0)*0.1+0.9);
        c *= 0.6+0.4*max(dot(vNormal,normalize(vec3(1,2,1))),0.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

const smokeMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uIntensity: { value: 1.0 } },
    vertexShader: `
      attribute float phase;
      uniform float uTime, uIntensity;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float speed = 0.2 + phase*0.1;
        p.y = mod(p.y + uTime*speed, 2.0);
        p.x += sin(uTime*0.3+phase*3.0)*0.15;
        p.z += cos(uTime*0.25+phase*2.5)*0.15;
        vAlpha = (1.0 - p.y/2.0)*0.35*uIntensity;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 8.0*(1.0/-mv.z);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord-0.5);
        float c = smoothstep(0.5,0.1,d);
        gl_FragColor = vec4(0.5,0.45,0.4, c*vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

function makeSmokeGeometry(): BufferGeometry {
  const pos = new Float32Array(SMOKE_COUNT * 3);
  const phases = new Float32Array(SMOKE_COUNT);
  for (let i = 0; i < SMOKE_COUNT; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.3;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 2.0;
    pos[i * 3 + 2] = Math.sin(a) * r;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("phase", new Float32BufferAttribute(phases, 1));
  return geo;
}

/** Barracks, stacks, tower cap and walls: static parts, merged into one draw call per slot. */
function buildBuildingGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  const barrack1 = new BoxGeometry(0.7, 0.3, 0.4);
  barrack1.translate(-0.6, 0.15, 0.2);
  parts.push(barrack1);
  const barrack2 = new BoxGeometry(0.6, 0.25, 0.35);
  barrack2.translate(0.6, 0.125, -0.3);
  parts.push(barrack2);

  const stacks = [
    { x: -0.3, z: -0.5, h: 0.6 },
    { x: 0.2, z: -0.6, h: 0.75 },
    { x: -0.1, z: -0.8, h: 0.5 },
  ];
  for (const s of stacks) {
    const stack = new CylinderGeometry(0.04, 0.055, s.h, 8);
    stack.translate(s.x, s.h / 2, s.z);
    parts.push(stack);
  }

  const tower = new BoxGeometry(0.18, TOWER_HEIGHT, 0.18);
  tower.translate(0, TOWER_HEIGHT / 2, 0);
  parts.push(tower);
  const cap = new BoxGeometry(0.28, 0.08, 0.28);
  cap.translate(0, TOWER_HEIGHT + 0.04, 0);
  parts.push(cap);

  const wall1 = new BoxGeometry(2.0, 0.12, 0.04);
  wall1.translate(0, 0.06, 0.9);
  parts.push(wall1);
  const wall2 = new BoxGeometry(2.0, 0.12, 0.04);
  wall2.translate(0, 0.06, -0.9);
  parts.push(wall2);
  const wall3 = new BoxGeometry(0.04, 0.12, 1.8);
  wall3.translate(1.0, 0.06, 0);
  parts.push(wall3);
  const wall4 = new BoxGeometry(0.04, 0.12, 1.8);
  wall4.translate(-1.0, 0.06, 0);
  parts.push(wall4);

  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

export const createConscriptionEngineOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "conscription-engine-overlay";
  scene.add(group);

  const groundGeometry = new PlaneGeometry(3, 3, 32, 32);
  groundGeometry.rotateX(-Math.PI / 2);
  const gMat = groundMaterial();

  const buildingGeometry = buildBuildingGeometry();
  const bMat = buildingMaterial();

  const smokeGeometry = makeSmokeGeometry();
  const sMat = smokeMaterial();

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
  const buildingSlots = makeSlots(() => new Mesh(buildingGeometry, bMat));
  const smokeSlots = makeSlots(() => new Points(smokeGeometry, sMat), TRANSPARENT_RENDER_ORDER);

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
      buildingSlots[i]!.visible = active;
      smokeSlots[i]!.visible = active;
      if (!active) continue;

      const w = wonders[i]!;
      groundSlots[i]!.position.set(w.centerX, w.surfaceY + 0.01, w.centerZ);
      buildingSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);
      smokeSlots[i]!.position.set(w.centerX - 0.2, w.surfaceY + 0.5, w.centerZ - 0.6);
    }
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    groundGeometry.dispose(); buildingGeometry.dispose(); smokeGeometry.dispose();
    gMat.dispose(); bMat.dispose(); sMat.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
