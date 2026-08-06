import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  Points,
  Scene,
  ShaderMaterial,
  TorusGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";
import { createContouredGroundGeometry, sampleContouredGroundHeights, type TerrainCornerSampler } from "./client-map-3d-wonder-ground-contour.js";

/**
 * Deepwater Engine natural wonder: a half-submerged industrial pump facility
 * with gear-driven pumps, copper piping, a rippling water surface, and
 * rising bubbles (see docs/natural-wonders-design.md §2.2 and the
 * Storybook reference at packages/storybook/src/wonders/DeepwaterEngine.
 * stories.ts, which this overlay matches geometry/shader-for-shader).
 * Owner's dock gold income is doubled; dock-originated attacks +15%.
 */
const GEAR_SPEED = 0.8;
const BUBBLE_COUNT = 40;
// Transparent effect layers (water, bubbles) must render above both the
// ownership overlay's tint (renderOrder 6/7, opacity up to 0.85) and the
// real water surface (renderOrder 12, see client-map-3d-water-surface.ts)
// or a claimed wonder tile's own color / neighboring sea would hide the
// effect. The opaque gear/pipe/pump parts don't need this.
const TRANSPARENT_RENDER_ORDER = 13;

const uTime = { value: 0 };
const uTeal = { value: new Color(0x20c8b0) };

type ActiveWonder = {
  readonly centerX: number;
  readonly centerZ: number;
  readonly surfaceY: number;
  readonly wx: number;
  readonly wy: number;
  readonly phase: number;
};

const waterMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uTeal,
      uDeep: { value: new Color(0x061820) },
      uShallow: { value: new Color(0x103848) },
    },
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
      uniform vec3 uTeal, uDeep, uShallow;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      float wave(vec2 p, float t) {
        return sin(p.x*3.0+t*0.7)*0.03 + sin(p.y*4.0-t*0.5)*0.02 + sin((p.x+p.y)*2.0+t*0.9)*0.015;
      }
      void main() {
        vec2 p = vWorldPos.xz;
        float w = wave(p, uTime);
        float dist = length(p);
        float ripple = sin(dist*8.0 - uTime*2.0)*0.5+0.5;
        ripple *= exp(-dist*0.8)*0.4;
        vec3 base = mix(uDeep, uShallow, 0.5+w*2.0);
        base += uTeal * ripple * 0.6;
        float edge = smoothstep(0.8, 0.2, dist)*0.3;
        base += uTeal * edge * (sin(uTime*1.5)*0.2+0.8);
        float fade = smoothstep(1.5, 1.0, dist);
        gl_FragColor = vec4(base, 0.88*fade);
      }
    `,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
  });

const gearMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uCopper: { value: new Color(0x8b5e3c) },
      uHighlight: { value: new Color(0xd4a574) },
      uTeal,
    },
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
      uniform vec3 uCopper, uHighlight, uTeal;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0 - max(dot(vNormal,vd),0.0), 2.5);
        float rim = smoothstep(0.6, 1.0, f);
        float pulse = sin(uTime*2.0 + vWorldPos.y*4.0)*0.15+0.85;
        vec3 c = mix(uCopper, uHighlight, f*0.6);
        c += uTeal * rim * pulse * 0.5;
        c *= 0.7 + 0.3*max(dot(vNormal, normalize(vec3(1,2,1))),0.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

const bubbleMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uColor: uTeal },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime*0.15 + phase*0.3, 0.7) - 0.1;
        p.x += sin(uTime*0.5+phase*2.0)*0.03;
        p.z += cos(uTime*0.4+phase*1.7)*0.03;
        vAlpha = smoothstep(-0.1, 0.1, p.y)*smoothstep(0.6, 0.3, p.y);
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 5.0*(1.0/-mv.z);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord-0.5);
        float ring = smoothstep(0.35, 0.25, d) - smoothstep(0.25, 0.15, d);
        float fill = smoothstep(0.5, 0.3, d)*0.3;
        gl_FragColor = vec4(uColor*1.5, (ring+fill)*vAlpha*0.6);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

function makeBubbleGeometry(): BufferGeometry {
  const pos = new Float32Array(BUBBLE_COUNT * 3);
  const phases = new Float32Array(BUBBLE_COUNT);
  for (let i = 0; i < BUBBLE_COUNT; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 1.2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = -0.1 + Math.random() * 0.6;
    pos[i * 3 + 2] = Math.sin(a) * r;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("phase", new Float32BufferAttribute(phases, 1));
  return geo;
}

function makePipeGeometry(x1: number, z1: number, x2: number, z2: number, radius: number): BufferGeometry {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  const g = new CylinderGeometry(radius, radius, len, 8);
  g.rotateZ(Math.PI / 2);
  g.rotateY(-Math.atan2(dz, dx));
  g.translate((x1 + x2) / 2, 0.05, (z1 + z2) / 2);
  return g;
}

function buildTeethGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const g = new CylinderGeometry(0.03, 0.03, 0.12, 6);
    g.translate(Math.cos(a) * 0.55, 0.2, Math.sin(a) * 0.55);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

function buildPipesGeometry(): BufferGeometry {
  const parts = [
    makePipeGeometry(-1.5, -0.3, -0.5, 0.0, 0.05),
    makePipeGeometry(0.5, 0.2, 1.8, -0.4, 0.04),
    makePipeGeometry(-0.8, 0.8, 0.3, 1.2, 0.06),
  ];
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

function buildPumpsGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const g = new CylinderGeometry(0.06, 0.08, 0.4, 8);
    g.translate(Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

export const createDeepwaterEngineOverlay = (scene: Scene, maxTiles: number, cornerYAt: TerrainCornerSampler): WonderOverlay => {
  const group = new Group();
  group.name = "deepwater-engine-overlay";
  scene.add(group);

  // One independent contoured geometry per slot (not shared) so each active
  // instance can hug its own tile's real terrain — see
  // client-map-3d-wonder-ground-contour.ts.
  const waterGeometries = Array.from({ length: maxTiles }, () => createContouredGroundGeometry());
  const wMat = waterMaterial();

  const mainGearGeometry = new TorusGeometry(0.55, 0.08, 12, 24);
  const innerGearGeometry = new TorusGeometry(0.3, 0.06, 10, 18);
  const gMat = gearMaterial();

  const teethGeometry = buildTeethGeometry();
  const pipesGeometry = buildPipesGeometry();
  const pumpsGeometry = buildPumpsGeometry();

  const bubbleGeometry = makeBubbleGeometry();
  const bMat = bubbleMaterial();

  const makeSlots = (geometry: BufferGeometry, material: ShaderMaterial, renderOrder = 0): Mesh[] =>
    Array.from({ length: maxTiles }, () => {
      const mesh = new Mesh(geometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = renderOrder;
      group.add(mesh);
      return mesh;
    });

  const waterSlots = waterGeometries.map((geo) => {
    const mesh = new Mesh(geo, wMat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = TRANSPARENT_RENDER_ORDER;
    group.add(mesh);
    return mesh;
  });
  const mainGearSlots = makeSlots(mainGearGeometry, gMat);
  const innerGearSlots = makeSlots(innerGearGeometry, gMat);
  const teethSlots = makeSlots(teethGeometry, gMat);
  const pipeSlots = makeSlots(pipesGeometry, gMat);
  const pumpSlots = makeSlots(pumpsGeometry, gMat);

  const bubbleSlots: Points[] = Array.from({ length: maxTiles }, () => {
    const pts = new Points(bubbleGeometry, bMat);
    pts.visible = false;
    pts.frustumCulled = false;
    pts.renderOrder = TRANSPARENT_RENDER_ORDER;
    group.add(pts);
    return pts;
  });

  const wonders: ActiveWonder[] = [];

  const clear = (): void => { wonders.length = 0; };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number, wx: number, wy: number): void => {
    const hash = (((centerX * 92_821) ^ (centerZ * 68_917)) >>> 0);
    const slotIndex = wonders.length;
    wonders.push({ centerX, centerZ, surfaceY, wx, wy, phase: ((hash % 1000) / 1000) * Math.PI * 2 });
    if (slotIndex < maxTiles) sampleContouredGroundHeights(waterGeometries[slotIndex]!, wx, wy, cornerYAt);
  };

  const update = (nowMs: number): void => {
    const t = nowMs / 1000;
    uTime.value = t;
    const count = Math.min(wonders.length, maxTiles);

    for (let i = 0; i < maxTiles; i += 1) {
      const active = i < count;
      waterSlots[i]!.visible = active;
      mainGearSlots[i]!.visible = active;
      innerGearSlots[i]!.visible = active;
      teethSlots[i]!.visible = active;
      pipeSlots[i]!.visible = active;
      pumpSlots[i]!.visible = active;
      bubbleSlots[i]!.visible = active;
      if (!active) continue;

      const w = wonders[i]!;
      // Y is baked per-vertex into the contoured geometry already (real
      // terrain height, or the water surface height over sea) -- only X/Z
      // track the camera-relative recentering here.
      waterSlots[i]!.position.set(w.centerX, 0, w.centerZ);

      mainGearSlots[i]!.position.set(w.centerX, w.surfaceY + 0.2, w.centerZ);
      mainGearSlots[i]!.rotation.set(Math.PI / 2, 0, t * GEAR_SPEED + w.phase);

      innerGearSlots[i]!.position.set(w.centerX, w.surfaceY + 0.22, w.centerZ);
      innerGearSlots[i]!.rotation.set(Math.PI / 2, 0, -t * GEAR_SPEED * 1.3 - w.phase);

      teethSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);
      pipeSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);
      pumpSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);
      bubbleSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);
    }
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    for (const geo of waterGeometries) geo.dispose();
    mainGearGeometry.dispose(); innerGearGeometry.dispose();
    teethGeometry.dispose(); pipesGeometry.dispose(); pumpsGeometry.dispose();
    bubbleGeometry.dispose();
    wMat.dispose(); gMat.dispose(); bMat.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
