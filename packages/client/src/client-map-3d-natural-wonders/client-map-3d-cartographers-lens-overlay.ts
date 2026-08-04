import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  PlaneGeometry,
  Points,
  RingGeometry,
  Scene,
  ShaderMaterial,
} from "three";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Cartographer's Lens natural wonder: a brass astrolabe with concentric
 * rotating rings, a prismatic lens, and rainbow light beams/particles (see
 * docs/natural-wonders-design.md §2.9 and the Storybook reference at
 * packages/storybook/src/wonders/CartographersLens.stories.ts, which this
 * overlay matches geometry/shader-for-shader). All of the controller's
 * tiles gain +1 vision range.
 */
const RING_SPEED = 0.8;
const PRISM_INTENSITY = 1.0;
const PARTICLE_COUNT = 40;
const RING_RADII = [0.3, 0.42, 0.55] as const;
const RING_TILTS = [0.1, -0.2, 0.15] as const;
// Transparent effect layers (ground glow, lens, prism beams, particles)
// must render above the ownership overlay's tint (renderOrder 6/7, opacity
// up to 0.85 — see client-map-3d-ownership-overlay.ts) or a claimed wonder
// tile's own color would wash the effect out. Opaque structural parts
// (base, rings) don't need this.
const TRANSPARENT_RENDER_ORDER = 10;

const uTime = { value: 0 };

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

const HSV_TO_RGB_GLSL = `
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx+K.xyz)*6.0-K.www);
    return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
  }
`;

const groundMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uGrid: { value: new Color(0xc89830) } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = mat3(modelMatrix) * position;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uGrid;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vec2 p = vWorldPos.xz;
        float dist = length(p);
        float gx = smoothstep(0.015, 0.0, abs(fract(p.x*3.0)-0.5)-0.485);
        float gy = smoothstep(0.015, 0.0, abs(fract(p.y*3.0)-0.5)-0.485);
        float grid = max(gx, gy);
        float ring = smoothstep(0.4, 0.38, dist) - smoothstep(0.38, 0.35, dist);
        float fade = smoothstep(1.5, 1.0, dist);
        float alpha = clamp(grid*0.5 + ring*0.8, 0.0, 1.0) * fade;
        gl_FragColor = vec4(uGrid, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

const brassMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uBrass: { value: new Color(0xc89830) }, uGold: { value: new Color(0xf0d060) } },
    vertexShader: `
      varying vec3 vNormal, vViewPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uBrass, uGold;
      varying vec3 vNormal, vViewPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0-max(dot(vNormal,vd),0.0),2.0);
        vec3 c = mix(uBrass, uGold, f*0.5);
        c *= 0.6+0.4*max(dot(vNormal,normalize(vec3(1,2,1))),0.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

const prismMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uIntensity: { value: PRISM_INTENSITY } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime, uIntensity;
      varying vec2 vUv;
      ${HSV_TO_RGB_GLSL}
      void main() {
        float hue = vUv.x + uTime*0.1;
        float sweep = sin(vUv.y*6.0-uTime*3.0)*0.15+0.85;
        float fade = smoothstep(0.0,0.15,vUv.y)*smoothstep(1.0,0.85,vUv.y);
        vec3 color = hsv2rgb(vec3(hue, 0.7, 1.0));
        float alpha = sweep*fade*0.25*uIntensity;
        gl_FragColor = vec4(color*1.5, alpha);
      }
    `,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
  });

const lensMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      ${HSV_TO_RGB_GLSL}
      void main() {
        float d = length(vUv-0.5)*2.0;
        float hue = d*0.5+uTime*0.2;
        vec3 c = hsv2rgb(vec3(hue, 0.6, 1.0));
        float alpha = smoothstep(1.0, 0.3, d)*0.4;
        gl_FragColor = vec4(c, alpha);
      }
    `,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
  });

const particleMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime },
    vertexShader: `
      attribute float phase, hue;
      uniform float uTime;
      varying float vAlpha, vHue;
      void main() {
        vec3 p = position;
        p.y += sin(uTime*0.8+phase)*0.1;
        p.x += sin(uTime*0.3+phase*2.0)*0.06;
        p.z += cos(uTime*0.25+phase*1.5)*0.06;
        vAlpha = 0.3+0.2*sin(uTime*2.0+phase*4.0);
        vHue = hue;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 4.0*(1.0/-mv.z);
      }
    `,
    fragmentShader: `
      varying float vAlpha, vHue;
      ${HSV_TO_RGB_GLSL}
      void main() {
        float d = length(gl_PointCoord-0.5);
        vec3 color = hsv2rgb(vec3(vHue, 0.8, 1.0));
        gl_FragColor = vec4(color, smoothstep(0.5,0.05,d)*vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

function makeParticleGeometry(): BufferGeometry {
  const pos = new Float32Array(PARTICLE_COUNT * 3);
  const phases = new Float32Array(PARTICLE_COUNT);
  const hues = new Float32Array(PARTICLE_COUNT);
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.3 + Math.random() * 1.5;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 0.8 + 0.2;
    pos[i * 3 + 2] = Math.sin(a) * r;
    phases[i] = Math.random() * Math.PI * 2;
    hues[i] = Math.random();
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("phase", new Float32BufferAttribute(phases, 1));
  geo.setAttribute("hue", new Float32BufferAttribute(hues, 1));
  return geo;
}

export const createCartographersLensOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "cartographers-lens-overlay";
  scene.add(group);

  const groundGeometry = new PlaneGeometry(3, 3, 32, 32);
  groundGeometry.rotateX(-Math.PI / 2);
  const gMat = groundMaterial();

  const bMat = brassMaterial();
  const baseGeometry = new CylinderGeometry(0.35, 0.4, 0.06, 24);
  const ringGeometries = RING_RADII.map((r) => new RingGeometry(r - 0.012, r + 0.012, 48));

  const lensGeometry = new CylinderGeometry(0.12, 0.12, 0.01, 24);
  const lMat = lensMaterial();

  const beamGeometry = new PlaneGeometry(0.4, 2.5, 1, 32);
  const pMat = prismMaterial();

  const particleGeometry = makeParticleGeometry();
  const ptMat = particleMaterial();

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
  const lensSlots = makeSlots(() => new Mesh(lensGeometry, lMat), TRANSPARENT_RENDER_ORDER);
  // 4 prismatic beams radiating outward from the astrolabe.
  const beamSlotsByBeam = [0, 1, 2, 3].map(() => makeSlots(() => new Mesh(beamGeometry, pMat), TRANSPARENT_RENDER_ORDER));
  const particleSlots = makeSlots(() => new Points(particleGeometry, ptMat), TRANSPARENT_RENDER_ORDER);

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
      lensSlots[i]!.visible = active;
      for (const beamSlots of beamSlotsByBeam) beamSlots[i]!.visible = active;
      particleSlots[i]!.visible = active;
      if (!active) continue;

      const w = wonders[i]!;
      groundSlots[i]!.position.set(w.centerX, w.surfaceY + 0.01, w.centerZ);
      baseSlots[i]!.position.set(w.centerX, w.surfaceY + 0.03, w.centerZ);

      for (let r = 0; r < RING_RADII.length; r += 1) {
        const ring = ringSlotsByRing[r]![i]!;
        ring.position.set(w.centerX, w.surfaceY + 0.12 + r * 0.07, w.centerZ);
        ring.rotation.x = -Math.PI / 2 + RING_TILTS[r]!;
        ring.rotation.z = t * RING_SPEED * (r % 2 === 0 ? 1 : -1) * (1 + r * 0.3) + w.phase;
      }

      lensSlots[i]!.position.set(w.centerX, w.surfaceY + 0.35, w.centerZ);
      lensSlots[i]!.rotation.y = t * 0.3 + w.phase;

      for (let b = 0; b < 4; b += 1) {
        const a = (b / 4) * Math.PI * 2;
        const beam = beamSlotsByBeam[b]![i]!;
        beam.position.set(w.centerX + Math.cos(a) * 1.2, w.surfaceY + 0.3, w.centerZ + Math.sin(a) * 1.2);
        beam.rotation.set(-0.2, -a, 0);
      }

      particleSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);
    }
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    groundGeometry.dispose(); baseGeometry.dispose();
    for (const geo of ringGeometries) geo.dispose();
    lensGeometry.dispose(); beamGeometry.dispose(); particleGeometry.dispose();
    gMat.dispose(); bMat.dispose(); lMat.dispose(); pMat.dispose(); ptMat.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
