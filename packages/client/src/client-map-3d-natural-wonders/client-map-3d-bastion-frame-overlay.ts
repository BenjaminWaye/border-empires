import {
  AdditiveBlending,
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
  TorusGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Bastion Frame natural wonder: a copper pipe and gearwork lattice embedded
 * in mossy stone, with aether energy flowing through the pipes (see docs/
 * natural-wonders-design.md §2.5 and the Storybook reference at packages/
 * storybook/src/wonders/BastionFrame.stories.ts, which this overlay
 * matches geometry/shader-for-shader). All of the controller's forts gain
 * +0.5x defense multiplier.
 */
const PULSE_SPEED = 0.8;
const ENERGY_COUNT = 30;
const PIPE_RADIUS = 0.025;

const uTime = { value: 0 };
const uCopper = { value: new Color(0xb87333) };

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

const groundMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uCopper, uStone: { value: new Color(0x1a1e18) }, uMoss: { value: new Color(0x1a2818) } },
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
      uniform vec3 uCopper, uStone, uMoss;
      varying vec3 vWorldPos;
      float hash(vec2 p) { p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float noise(vec2 p) {
        vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec2 p = vWorldPos.xz;
        float dist = length(p);
        float n = noise(p*5.0)*0.6+noise(p*11.0)*0.2;
        vec3 stoneMoss = mix(uStone, uMoss, n);
        float pipe = exp(-dist*1.0)*0.4;
        float pulse = sin(uTime*0.8)*0.15+0.85;
        vec3 color = stoneMoss + uCopper * pipe * pulse;
        float alpha = clamp(pipe*1.3 + n*0.3, 0.0, 1.0) * smoothstep(1.5, 1.0, dist);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

const copperMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uCopper, uVerdigris: { value: new Color(0x4a8c6a) } },
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
      uniform vec3 uCopper, uVerdigris;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0-max(dot(vNormal,vd),0.0),2.0);
        float edge = smoothstep(0.5,1.0,f);
        vec3 c = mix(uCopper, uVerdigris, edge*0.4);
        float pulse = sin(uTime*1.2+vWorldPos.y*5.0)*0.1+0.9;
        c += uCopper*0.3*pulse*smoothstep(0.6,1.0,f);
        c *= 0.5+0.5*max(dot(vNormal,normalize(vec3(1,2,1))),0.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

const energyMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uColor: uCopper },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float flow = mod(uTime*0.3+phase, 6.28318);
        p.y = sin(flow)*0.2+0.3;
        p.x += sin(uTime*0.5+phase*2.0)*0.05;
        p.z += cos(uTime*0.4+phase*1.5)*0.05;
        vAlpha = 0.3+0.2*sin(uTime*2.0+phase);
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
        gl_FragColor = vec4(uColor*1.5, smoothstep(0.5,0.1,d)*vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

function makeEnergyGeometry(): BufferGeometry {
  const pos = new Float32Array(ENERGY_COUNT * 3);
  const phases = new Float32Array(ENERGY_COUNT);
  for (let i = 0; i < ENERGY_COUNT; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.2 + Math.random() * 0.8;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 0.6;
    pos[i * 3 + 2] = Math.sin(a) * r;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("phase", new Float32BufferAttribute(phases, 1));
  return geo;
}

/** Vertical supports and diagonal cross-braces: static parts, merged into one draw call per slot. */
function buildLatticeStrutsGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];

  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * 0.7;
    const z = Math.sin(a) * 0.7;
    const pipe = new CylinderGeometry(PIPE_RADIUS, PIPE_RADIUS, 0.5, 8);
    pipe.translate(x, 0.25, z);
    parts.push(pipe);
  }

  for (let i = 0; i < 4; i += 1) {
    const a1 = (i / 4) * Math.PI * 2;
    const a2 = ((i + 1) / 4) * Math.PI * 2;
    const x1 = Math.cos(a1) * 0.7, z1 = Math.sin(a1) * 0.7;
    const x2 = Math.cos(a2) * 0.7, z2 = Math.sin(a2) * 0.7;
    const brace = new CylinderGeometry(PIPE_RADIUS * 0.7, PIPE_RADIUS * 0.7, 0.8, 6);
    brace.rotateZ(Math.atan2(x2 - x1, 0.5) * 0.5);
    brace.translate((x1 + x2) / 2, 0.25, (z1 + z2) / 2);
    parts.push(brace);
  }

  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}

export const createBastionFrameOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "bastion-frame-overlay";
  scene.add(group);

  const groundGeometry = new PlaneGeometry(3, 3, 32, 32);
  groundGeometry.rotateX(-Math.PI / 2);
  const gMat = groundMaterial();

  const cMat = copperMaterial();
  const ringGeometry = new TorusGeometry(0.7, PIPE_RADIUS, 8, 24);
  const upperRingGeometry = new TorusGeometry(0.5, PIPE_RADIUS, 8, 20);
  const gearGeometry = new TorusGeometry(0.15, PIPE_RADIUS * 1.5, 8, 16);
  const strutsGeometry = buildLatticeStrutsGeometry();

  const energyGeometry = makeEnergyGeometry();
  const eMat = energyMaterial();

  const makeSlots = <T extends Mesh | Points>(factory: () => T): T[] =>
    Array.from({ length: maxTiles }, () => {
      const obj = factory();
      obj.visible = false;
      obj.frustumCulled = false;
      group.add(obj);
      return obj;
    });

  const groundSlots = makeSlots(() => new Mesh(groundGeometry, gMat));
  const ringSlots = makeSlots(() => new Mesh(ringGeometry, cMat));
  const upperRingSlots = makeSlots(() => new Mesh(upperRingGeometry, cMat));
  const gearSlots = makeSlots(() => new Mesh(gearGeometry, cMat));
  const strutSlots = makeSlots(() => new Mesh(strutsGeometry, cMat));
  const energySlots = makeSlots(() => new Points(energyGeometry, eMat));

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
      ringSlots[i]!.visible = active;
      upperRingSlots[i]!.visible = active;
      gearSlots[i]!.visible = active;
      strutSlots[i]!.visible = active;
      energySlots[i]!.visible = active;
      if (!active) continue;

      const w = wonders[i]!;
      groundSlots[i]!.position.set(w.centerX, w.surfaceY - 0.005, w.centerZ);

      ringSlots[i]!.position.set(w.centerX, w.surfaceY + 0.05, w.centerZ);
      ringSlots[i]!.rotation.x = Math.PI / 2;

      upperRingSlots[i]!.position.set(w.centerX, w.surfaceY + 0.5, w.centerZ);
      upperRingSlots[i]!.rotation.set(Math.PI / 2, 0, t * PULSE_SPEED * 0.3 + w.phase);

      gearSlots[i]!.position.set(w.centerX, w.surfaceY + 0.5, w.centerZ);
      gearSlots[i]!.rotation.set(Math.PI / 2, 0, t * PULSE_SPEED + w.phase);

      strutSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);
      energySlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);
    }
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    groundGeometry.dispose(); ringGeometry.dispose(); upperRingGeometry.dispose();
    gearGeometry.dispose(); strutsGeometry.dispose(); energyGeometry.dispose();
    gMat.dispose(); cMat.dispose(); eMat.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
