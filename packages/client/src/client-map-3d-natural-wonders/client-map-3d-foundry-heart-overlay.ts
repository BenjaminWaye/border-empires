import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
} from "three";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Foundry Heart natural wonder: a pulsing crystal geode with a glowing
 * aether core, embedded in cracked, fissured ground (see docs/natural-
 * wonders-design.md §2.1 and the Storybook reference at packages/
 * storybook/src/wonders/FoundryHeart.stories.ts, which this overlay
 * matches geometry/shader-for-shader). Owner gains +1 slot of every
 * resource type.
 */
const SHARD_COUNT = 24;
const FISSURE_COUNT = 6;
// Transparent effect layers (ground glow, shell, particles) must render
// above the ownership overlay's tint (renderOrder 6/7, opacity up to 0.85 —
// see client-map-3d-ownership-overlay.ts) or a claimed wonder tile's own
// color would wash the effect out. Opaque structural parts (the core) don't
// need this: normal depth testing already sorts them correctly.
const TRANSPARENT_RENDER_ORDER = 10;

const uTime = { value: 0 };
const uCyan = { value: new Color(0x40d8ff) };

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

const groundMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uFissureCount: { value: FISSURE_COUNT }, uCyan },
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
      uniform float uFissureCount;
      uniform vec3 uCyan;
      varying vec3 vWorldPos;

      float fissure(vec2 p, float angle, float w) {
        float c = cos(angle), s = sin(angle);
        float along = dot(p, vec2(c,s));
        float across = dot(p, vec2(-s,c));
        float wid = w * (0.3 + 0.7 * smoothstep(0.0, 3.0, abs(along)));
        return smoothstep(wid, 0.0, abs(across)) * smoothstep(0.2, 0.6, abs(along));
      }
      void main() {
        vec2 p = vWorldPos.xz;
        float dist = length(p);
        float fg = 0.0;
        for (float i = 0.0; i < 12.0; i++) {
          if (i >= uFissureCount) break;
          float a = i * 6.28318 / uFissureCount + 0.3;
          fg += fissure(p, a + sin(a*3.0+dist*2.0)*0.15, 0.04+0.02*sin(i*2.1));
        }
        fg = clamp(fg, 0.0, 1.0);
        float pulse = sin(uTime*1.2)*0.15+0.85;
        float cg = exp(-dist*1.8)*0.7;
        float glow = exp(-dist*2.5)*0.2*pulse;
        float alpha = clamp(fg*0.9*pulse + cg*0.5 + glow, 0.0, 1.0);
        gl_FragColor = vec4(uCyan*1.6*pulse, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

const shellMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uOpacity: { value: 0.92 }, uCyan, uDeep: { value: new Color(0x1a4060) } },
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
      uniform float uTime, uOpacity;
      uniform vec3 uCyan, uDeep;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0 - max(dot(vNormal,vd),0.0), 3.0);
        float p = sin(uTime*1.2)*0.15+0.85;
        vec3 c = uDeep + uCyan*2.0*f*p;
        c *= 0.5 + 0.5*smoothstep(-0.3, 0.4, vWorldPos.y);
        gl_FragColor = vec4(c, uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

const coreMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uCyan, uWhite: { value: new Color(0xffffff) } },
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
      uniform vec3 uCyan, uWhite;
      varying vec3 vNormal, vViewPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0 - max(dot(vNormal,vd),0.0), 2.0);
        float p = sin(uTime*1.2)*0.2+0.8;
        gl_FragColor = vec4(mix(uWhite, uCyan, f) * (1.5+p*0.5), 1.0);
      }
    `,
  });

const shardMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uColor: uCyan },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y += sin(uTime*0.8+phase)*0.08;
        float a = uTime*0.15+phase;
        p.x += sin(a)*0.04; p.z += cos(a)*0.04;
        vAlpha = 0.4+0.3*sin(uTime*1.5+phase);
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 4.0*(1.0/-mv.z);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord-0.5);
        gl_FragColor = vec4(uColor, smoothstep(0.5,0.1,d)*vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

function makeShardGeometry(): BufferGeometry {
  const pos = new Float32Array(SHARD_COUNT * 3);
  const phases = new Float32Array(SHARD_COUNT);
  for (let i = 0; i < SHARD_COUNT; i += 1) {
    const a = (i / SHARD_COUNT) * Math.PI * 2;
    const r = 0.5 + Math.random() * 0.6;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.3 + Math.random() * 0.7;
    pos[i * 3 + 2] = Math.sin(a) * r;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("phase", new Float32BufferAttribute(phases, 1));
  return geo;
}

function makeShellGeometry(): IcosahedronGeometry {
  const geo = new IcosahedronGeometry(0.7, 1);
  const p = geo.attributes.position!;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z);
    const irr = 1.0 + 0.15 * Math.sin(x * 5 + z * 3) + 0.1 * Math.cos(y * 7 + x * 2);
    p.setXYZ(i, (x / len) * 0.7 * irr, (y / len) * 0.7 * irr, (z / len) * 0.7 * irr);
  }
  geo.computeVertexNormals();
  return geo;
}

export const createFoundryHeartOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "foundry-heart-overlay";
  scene.add(group);

  const groundGeometry = new PlaneGeometry(3, 3, 48, 48);
  groundGeometry.rotateX(-Math.PI / 2);
  const gMat = groundMaterial();

  const shellGeometry = makeShellGeometry();
  const sMat = shellMaterial();

  const coreGeometry = new IcosahedronGeometry(0.28, 2);
  const cMat = coreMaterial();

  const shardGeometry = makeShardGeometry();
  const shMat = shardMaterial();

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
  const shellSlots = makeSlots(() => new Mesh(shellGeometry, sMat), TRANSPARENT_RENDER_ORDER);
  const coreSlots = makeSlots(() => new Mesh(coreGeometry, cMat));
  const shardSlots = makeSlots(() => new Points(shardGeometry, shMat), TRANSPARENT_RENDER_ORDER);

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
      shellSlots[i]!.visible = active;
      coreSlots[i]!.visible = active;
      shardSlots[i]!.visible = active;
      if (!active) continue;

      const w = wonders[i]!;
      groundSlots[i]!.position.set(w.centerX, w.surfaceY + 0.01, w.centerZ);

      shellSlots[i]!.position.set(w.centerX, w.surfaceY + 0.55, w.centerZ);
      shellSlots[i]!.rotation.y = -t * 0.08 + w.phase;

      coreSlots[i]!.position.set(w.centerX, w.surfaceY + 0.55, w.centerZ);
      coreSlots[i]!.rotation.set(Math.sin(t * 0.2) * 0.1, t * 0.3 + w.phase, 0);

      shardSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);
    }
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    groundGeometry.dispose(); shellGeometry.dispose(); coreGeometry.dispose(); shardGeometry.dispose();
    gMat.dispose(); sMat.dispose(); cMat.dispose(); shMat.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
