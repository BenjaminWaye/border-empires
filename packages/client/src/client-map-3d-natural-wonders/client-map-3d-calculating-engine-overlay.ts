import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  PlaneGeometry,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Calculating Engine natural wonder: a brass-and-glass computing machine
 * with rotating calculation rings, scrolling glass panels, and computation
 * sparks (see docs/natural-wonders-design.md §2.6 and the Storybook
 * reference at packages/storybook/src/wonders/CalculatingEngine.stories.
 * ts, which this overlay matches geometry/shader-for-shader). All tech
 * research gold costs -10%.
 */
const SCROLL_SPEED = 1.0;
const RING_COUNT = 4;
const SPARK_COUNT = 25;
// Transparent effect layers (ground glow, glass panels/orb, sparks) must
// render above the ownership overlay's tint (renderOrder 6/7, opacity up
// to 0.85 — see client-map-3d-ownership-overlay.ts) or a claimed wonder
// tile's own color would wash the effect out. Opaque structural parts
// (base, rings) don't need this.
const TRANSPARENT_RENDER_ORDER = 10;

const uTime = { value: 0 };
const uBrass = { value: new Color(0xd4a540) };

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

const groundMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uBrass },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uBrass;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vec2 p = vWorldPos.xz;
        float dist = length(p);
        float gx = smoothstep(0.02, 0.0, abs(fract(p.x*2.0)-0.5)-0.48);
        float gy = smoothstep(0.02, 0.0, abs(fract(p.y*2.0)-0.5)-0.48);
        float grid = max(gx, gy);
        float scroll = sin(p.x*4.0+uTime*1.5)*sin(p.y*4.0-uTime*0.8)*0.5+0.5;
        scroll *= grid*2.0;
        vec3 color = uBrass * (0.6 + scroll*0.4);
        float fade = smoothstep(1.5, 1.0, dist);
        float alpha = grid * (0.55 + scroll*0.3) * fade;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

const brassMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uBrass, uGlass: { value: new Color(0x40c8e8) } },
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
      uniform vec3 uBrass, uGlass;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0-max(dot(vNormal,vd),0.0),2.0);
        vec3 c = uBrass * (0.6+0.4*f);
        float glow = sin(uTime*2.0+vWorldPos.x*3.0+vWorldPos.z*2.0)*0.15+0.85;
        c += uGlass * f * glow * 0.3;
        c *= 0.5+0.5*max(dot(vNormal,normalize(vec3(1,2,1))),0.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

const glassMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uGlass: { value: new Color(0x40c8e8) } },
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
      uniform vec3 uGlass;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0-max(dot(vNormal,vd),0.0),3.0);
        float lines = sin(vWorldPos.y*20.0+uTime*3.0)*0.5+0.5;
        lines *= sin(vWorldPos.x*15.0-uTime*1.5)*0.5+0.5;
        float alpha = 0.15 + f*0.3 + lines*0.1;
        gl_FragColor = vec4(uGlass*(1.0+lines*0.5), alpha);
      }
    `,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
  });

const sparkMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uColor: uBrass },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y += sin(uTime*1.2+phase)*0.1;
        p.x += sin(uTime*0.8+phase*2.0)*0.04;
        p.z += cos(uTime*0.6+phase*1.5)*0.04;
        vAlpha = 0.3+0.2*sin(uTime*3.0+phase*5.0);
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 3.0*(1.0/-mv.z);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord-0.5);
        gl_FragColor = vec4(uColor*2.0, smoothstep(0.5,0.0,d)*vAlpha);
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
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.6;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 0.8 + 0.1;
    pos[i * 3 + 2] = Math.sin(a) * r;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("phase", new Float32BufferAttribute(phases, 1));
  return geo;
}

/** Four glass support panels: static parts, merged into one draw call per slot. */
function buildGlassPanelsGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    const panel = new CylinderGeometry(0.08, 0.08, 0.3, 4);
    panel.rotateY(a);
    panel.translate(Math.cos(a) * 0.35, 0.3, Math.sin(a) * 0.35);
    parts.push(panel);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

export const createCalculatingEngineOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "calculating-engine-overlay";
  scene.add(group);

  const groundGeometry = new PlaneGeometry(3, 3, 32, 32);
  groundGeometry.rotateX(-Math.PI / 2);
  const gMat = groundMaterial();

  const bMat = brassMaterial();
  const baseGeometry = new CylinderGeometry(0.6, 0.7, 0.08, 24);
  const ringGeometries = Array.from({ length: RING_COUNT }, (_, i) => {
    const radius = 0.2 + i * 0.12;
    return new RingGeometry(radius - 0.015, radius + 0.015, 32);
  });
  const panelsGeometry = buildGlassPanelsGeometry();

  const glMat = glassMaterial();
  const orbGeometry = new IcosahedronGeometry(0.12, 1);

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
  const baseSlots = makeSlots(() => new Mesh(baseGeometry, bMat));
  const ringSlotsByRing = ringGeometries.map((geo) => makeSlots(() => new Mesh(geo, bMat)));
  const panelSlots = makeSlots(() => new Mesh(panelsGeometry, glMat), TRANSPARENT_RENDER_ORDER);
  const orbSlots = makeSlots(() => new Mesh(orbGeometry, glMat), TRANSPARENT_RENDER_ORDER);
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
      baseSlots[i]!.visible = active;
      for (const ringSlots of ringSlotsByRing) ringSlots[i]!.visible = active;
      panelSlots[i]!.visible = active;
      orbSlots[i]!.visible = active;
      sparkSlots[i]!.visible = active;
      if (!active) continue;

      const w = wonders[i]!;
      groundSlots[i]!.position.set(w.centerX, w.surfaceY + 0.01, w.centerZ);
      baseSlots[i]!.position.set(w.centerX, w.surfaceY + 0.04, w.centerZ);

      for (let r = 0; r < RING_COUNT; r += 1) {
        const ring = ringSlotsByRing[r]![i]!;
        ring.position.set(w.centerX, w.surfaceY + 0.15 + r * 0.08, w.centerZ);
        ring.rotation.x = -Math.PI / 2 + (r % 2 === 0 ? 0.15 : -0.15);
        ring.rotation.z = t * SCROLL_SPEED * (r % 2 === 0 ? 1 : -1) * (0.5 + r * 0.2) + w.phase;
      }

      panelSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);

      orbSlots[i]!.position.set(w.centerX, w.surfaceY + 0.45, w.centerZ);
      orbSlots[i]!.rotation.set(Math.sin(t * 0.3) * 0.2, t * 0.5 + w.phase, 0);

      sparkSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);
    }
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    groundGeometry.dispose(); baseGeometry.dispose();
    for (const geo of ringGeometries) geo.dispose();
    panelsGeometry.dispose(); orbGeometry.dispose(); sparkGeometry.dispose();
    gMat.dispose(); bMat.dispose(); glMat.dispose(); spMat.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
