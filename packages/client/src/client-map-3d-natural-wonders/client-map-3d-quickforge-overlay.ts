import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  Points,
  Scene,
  ShaderMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";
import { createContouredGroundGeometry, sampleContouredGroundHeights, type TerrainCornerSampler } from "./client-map-3d-wonder-ground-contour.js";

/**
 * Quickforge natural wonder: a rapid-action forge with animated pneumatic
 * pistons, steam jets, and a red-hot glow (see docs/natural-wonders-
 * design.md §2.7 and the Storybook reference at packages/storybook/src/
 * wonders/Quickforge.stories.ts, which this overlay matches geometry/
 * shader-for-shader). Once per UTC day, the controller's rush-buy is 40 gold cheaper.
 */
const PISTON_SPEED = 1.0;
const STEAM_COUNT = 35;
// Transparent effect layers (ground glow, steam) must render above both the
// ownership overlay's tint (renderOrder 6/7, opacity up to 0.85) and the
// real water surface (renderOrder 12, see client-map-3d-water-surface.ts)
// or a claimed wonder tile's own color / neighboring sea would hide the
// effect. Opaque structural parts don't need this.
const TRANSPARENT_RENDER_ORDER = 13;

const uTime = { value: 0 };
const uRedHot = { value: new Color(0xff3010) };

type ActiveWonder = {
  readonly centerX: number;
  readonly centerZ: number;
  readonly surfaceY: number;
  readonly wx: number;
  readonly wy: number;
  readonly phase: number;
};

const groundMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uRedHot, uDark: { value: new Color(0x0c0604) }, uEmber: { value: new Color(0x301008) } },
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
      uniform vec3 uRedHot, uDark, uEmber;
      varying vec3 vWorldPos;
      float hash(vec2 p) { p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float noise(vec2 p) {
        vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec2 p = vWorldPos.xz;
        float dist = length(p);
        float n = noise(p*5.0)*0.6+noise(p*12.0)*0.15;
        vec3 ember = mix(uDark, uEmber, n);
        float heat = exp(-dist*1.2)*0.7;
        float pulse = sin(uTime*2.5)*0.15+0.85;
        vec3 color = ember + uRedHot * heat * pulse;
        float alpha = clamp(heat*1.4, 0.0, 1.0) * smoothstep(1.5, 1.0, dist);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

const metalMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uIron: { value: new Color(0x1e1c1a) }, uEdge: { value: new Color(0x4a4440) }, uRedHot },
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
      uniform vec3 uIron, uEdge, uRedHot;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0-max(dot(vNormal,vd),0.0),2.5);
        vec3 c = mix(uIron, uEdge, f*0.4);
        float bottom = smoothstep(0.1, 0.0, vWorldPos.y);
        c += uRedHot*bottom*0.2;
        c *= 0.5+0.5*max(dot(vNormal,normalize(vec3(1,2,1))),0.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

const steamMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime*0.25 + phase*0.2, 1.2);
        p.x += sin(uTime*0.4+phase*3.0)*0.08;
        p.z += cos(uTime*0.35+phase*2.5)*0.08;
        vAlpha = (1.0 - p.y/1.2)*0.3;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 7.0*(1.0/-mv.z);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord-0.5);
        gl_FragColor = vec4(0.7,0.65,0.6, smoothstep(0.5,0.1,d)*vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

function makeSteamGeometry(): BufferGeometry {
  const pos = new Float32Array(STEAM_COUNT * 3);
  const phases = new Float32Array(STEAM_COUNT);
  for (let i = 0; i < STEAM_COUNT; i += 1) {
    pos[i * 3] = (Math.random() - 0.5) * 0.6;
    pos[i * 3 + 1] = Math.random() * 1.2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("phase", new Float32BufferAttribute(phases, 1));
  return geo;
}

/** Forge base, opening and support frame: static parts, merged into one draw call per slot. */
function buildFrameGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  const base = new BoxGeometry(0.8, 0.2, 0.5);
  base.translate(0, 0.1, 0);
  parts.push(base);
  const opening = new BoxGeometry(0.4, 0.12, 0.3);
  opening.translate(0, 0.16, 0);
  parts.push(opening);

  const frameL = new BoxGeometry(0.04, 0.5, 0.04);
  frameL.translate(-0.45, 0.25, 0);
  parts.push(frameL);
  const frameR = new BoxGeometry(0.04, 0.5, 0.04);
  frameR.translate(0.45, 0.25, 0);
  parts.push(frameR);
  const frameTop = new BoxGeometry(0.94, 0.04, 0.04);
  frameTop.translate(0, 0.5, 0);
  parts.push(frameTop);

  for (let i = 0; i < 3; i += 1) {
    const x = (i - 1) * 0.25;
    const body = new CylinderGeometry(0.04, 0.04, 0.35, 8);
    body.translate(x, 0.375, 0);
    parts.push(body);
  }

  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

export const createQuickforgeOverlay = (scene: Scene, maxTiles: number, cornerYAt: TerrainCornerSampler): WonderOverlay => {
  const group = new Group();
  group.name = "quickforge-overlay";
  scene.add(group);

  // One independent contoured geometry per slot (not shared) so each active
  // instance can hug its own tile's real terrain — see
  // client-map-3d-wonder-ground-contour.ts.
  const groundGeometries = Array.from({ length: maxTiles }, () => createContouredGroundGeometry());
  const gMat = groundMaterial();

  const mMat = metalMaterial();
  const frameGeometry = buildFrameGeometry();
  const rodGeometry = new CylinderGeometry(0.02, 0.02, 0.15, 6);

  const steamGeometry = makeSteamGeometry();
  const stMat = steamMaterial();

  const makeSlots = <T extends Mesh | Points>(factory: () => T, renderOrder = 0): T[] =>
    Array.from({ length: maxTiles }, () => {
      const obj = factory();
      obj.visible = false;
      obj.frustumCulled = false;
      obj.renderOrder = renderOrder;
      group.add(obj);
      return obj;
    });

  const groundSlots = groundGeometries.map((geo) => {
    const mesh = new Mesh(geo, gMat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = TRANSPARENT_RENDER_ORDER;
    group.add(mesh);
    return mesh;
  });
  const frameSlots = makeSlots(() => new Mesh(frameGeometry, mMat));
  // 3 piston rods, out-of-phase for a busy mechanical feel.
  const rodSlotsByPiston = [0, 1, 2].map(() => makeSlots(() => new Mesh(rodGeometry, mMat)));
  const steamSlots = makeSlots(() => new Points(steamGeometry, stMat), TRANSPARENT_RENDER_ORDER);

  const wonders: ActiveWonder[] = [];

  const clear = (): void => { wonders.length = 0; };

  const addInstance = (centerX: number, centerZ: number, surfaceY: number, wx: number, wy: number): void => {
    const hash = (((centerX * 92_821) ^ (centerZ * 68_917)) >>> 0);
    const slotIndex = wonders.length;
    wonders.push({ centerX, centerZ, surfaceY, wx, wy, phase: ((hash % 1000) / 1000) * Math.PI * 2 });
    if (slotIndex < maxTiles) sampleContouredGroundHeights(groundGeometries[slotIndex]!, wx, wy, cornerYAt);
  };

  const update = (nowMs: number): void => {
    const t = nowMs / 1000;
    uTime.value = t;
    const count = Math.min(wonders.length, maxTiles);

    for (let i = 0; i < maxTiles; i += 1) {
      const active = i < count;
      groundSlots[i]!.visible = active;
      frameSlots[i]!.visible = active;
      for (const rodSlots of rodSlotsByPiston) rodSlots[i]!.visible = active;
      steamSlots[i]!.visible = active;
      if (!active) continue;

      const w = wonders[i]!;
      // Y is baked per-vertex into the contoured geometry already (real
      // terrain height, or the water surface height over sea) -- only X/Z
      // track the camera-relative recentering here.
      groundSlots[i]!.position.set(w.centerX, 0, w.centerZ);
      frameSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);

      for (let p = 0; p < 3; p += 1) {
        const x = (p - 1) * 0.25;
        const offset = (p / 3) * Math.PI * 2;
        const cycle = Math.sin(t * PISTON_SPEED * Math.PI * 2 + offset + w.phase);
        const rod = rodSlotsByPiston[p]![i]!;
        rod.position.set(w.centerX + x, w.surfaceY + 0.55 + cycle * 0.06, w.centerZ);
        rod.scale.set(1, 1.0 + cycle * 0.3, 1);
      }

      steamSlots[i]!.position.set(w.centerX, w.surfaceY + 0.3, w.centerZ);
    }
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    for (const geo of groundGeometries) geo.dispose();
    frameGeometry.dispose(); rodGeometry.dispose(); steamGeometry.dispose();
    gMat.dispose(); mMat.dispose(); stMat.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
