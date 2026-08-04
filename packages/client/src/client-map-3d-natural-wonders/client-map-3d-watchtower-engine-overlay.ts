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
  Scene,
  ShaderMaterial,
  TorusGeometry,
} from "three";
import type { WonderOverlay } from "./client-map-3d-wonder-overlay-types.js";

/**
 * Watchtower Engine natural wonder: a tall brass telescope tower with a
 * sweeping aether beam and star-like particles (see docs/natural-wonders-
 * design.md §2.8 and the Storybook reference at packages/storybook/src/
 * wonders/WatchtowerEngine.stories.ts, which this overlay matches
 * geometry/shader-for-shader). Distinct from the world-generated scouting
 * Watchtower sites (client-map-3d-watchtower-overlay.ts) — this is a
 * rarer, single-per-map prize. Acts as a free Observatory (no CRYSTAL
 * upkeep) with a flat +10 cast-radius bonus.
 */
const TELESCOPE_HEIGHT = 0.8;
const BEAM_WIDTH = 0.15;
const STAR_COUNT = 50;
const TUBE_TILT = 0.3;
// Transparent effect layers (ground glow, beam, stars) must render above
// the ownership overlay's tint (renderOrder 6/7, opacity up to 0.85 — see
// client-map-3d-ownership-overlay.ts) or a claimed wonder tile's own color
// would wash the effect out. Opaque structural parts don't need this.
const TRANSPARENT_RENDER_ORDER = 10;

const uTime = { value: 0 };
const uCyan = { value: new Color(0x40d8ff) };

type ActiveWonder = { readonly centerX: number; readonly centerZ: number; readonly surfaceY: number; readonly phase: number };

const groundMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uCyan },
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
      uniform vec3 uCyan;
      varying vec3 vWorldPos;
      void main() {
        vec2 p = vWorldPos.xz;
        float dist = length(p);
        float pulse = sin(uTime*1.0)*0.15+0.85;
        float glow = exp(-dist*1.2)*0.7*pulse;
        float alpha = clamp(glow*1.4, 0.0, 1.0) * smoothstep(1.5, 1.0, dist);
        gl_FragColor = vec4(uCyan*1.4, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

const brassMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uBrass: { value: new Color(0xc89830) }, uHighlight: { value: new Color(0xf0d060) } },
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
      uniform vec3 uBrass, uHighlight;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0-max(dot(vNormal,vd),0.0),2.0);
        vec3 c = mix(uBrass, uHighlight, f*0.5);
        c *= 0.6+0.4*max(dot(vNormal,normalize(vec3(1,2,1))),0.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

const beamMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uCyan, uWidth: { value: BEAM_WIDTH } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime, uWidth;
      uniform vec3 uCyan;
      varying vec2 vUv;
      void main() {
        float dist = abs(vUv.x - 0.5)*2.0;
        float core = exp(-dist*dist/(uWidth*uWidth));
        float sweep = sin(vUv.y*10.0-uTime*5.0)*0.2+0.8;
        float fade = smoothstep(0.0,0.1,vUv.y)*smoothstep(1.0,0.8,vUv.y);
        float alpha = core*sweep*fade*0.6;
        gl_FragColor = vec4(uCyan*1.8, alpha);
      }
    `,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
  });

const starMaterial = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uColor: uCyan },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        vAlpha = 0.3+0.3*sin(uTime*2.0+phase*3.0);
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
        gl_FragColor = vec4(uColor, smoothstep(0.5,0.05,d)*vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

function makeStarGeometry(): BufferGeometry {
  const pos = new Float32Array(STAR_COUNT * 3);
  const phases = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.5 + Math.random() * 2.0;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.3 + Math.random() * 1.5;
    pos[i * 3 + 2] = Math.sin(a) * r;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("phase", new Float32BufferAttribute(phases, 1));
  return geo;
}

export const createWatchtowerEngineOverlay = (scene: Scene, maxTiles: number): WonderOverlay => {
  const group = new Group();
  group.name = "watchtower-engine-overlay";
  scene.add(group);

  const groundGeometry = new PlaneGeometry(3, 3, 32, 32);
  groundGeometry.rotateX(-Math.PI / 2);
  const gMat = groundMaterial();

  const bMat = brassMaterial();
  const baseGeometry = new CylinderGeometry(0.3, 0.4, 0.1, 16);
  const tubeGeometry = new CylinderGeometry(0.08, 0.12, TELESCOPE_HEIGHT, 12);
  const dishGeometry = new CylinderGeometry(0.18, 0.08, 0.08, 16);
  const gearGeometry = new TorusGeometry(0.14, 0.025, 8, 16);

  const beamGeometry = new PlaneGeometry(0.3, 3.0, 1, 32);
  const bmMat = beamMaterial();

  const starGeometry = makeStarGeometry();
  const stMat = starMaterial();

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
  const tubeSlots = makeSlots(() => new Mesh(tubeGeometry, bMat));
  const dishSlots = makeSlots(() => new Mesh(dishGeometry, bMat));
  const gearSlots = makeSlots(() => new Mesh(gearGeometry, bMat));
  const beamSlots = makeSlots(() => new Mesh(beamGeometry, bmMat), TRANSPARENT_RENDER_ORDER);
  const starSlots = makeSlots(() => new Points(starGeometry, stMat), TRANSPARENT_RENDER_ORDER);

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
    const th = TELESCOPE_HEIGHT;

    for (let i = 0; i < maxTiles; i += 1) {
      const active = i < count;
      groundSlots[i]!.visible = active;
      baseSlots[i]!.visible = active;
      tubeSlots[i]!.visible = active;
      dishSlots[i]!.visible = active;
      gearSlots[i]!.visible = active;
      beamSlots[i]!.visible = active;
      starSlots[i]!.visible = active;
      if (!active) continue;

      const w = wonders[i]!;
      groundSlots[i]!.position.set(w.centerX, w.surfaceY + 0.01, w.centerZ);
      baseSlots[i]!.position.set(w.centerX, w.surfaceY + 0.05, w.centerZ);

      // Whole telescope slowly sweeps left/right; dish and beam track it.
      const yaw = Math.sin(t * 0.15 + w.phase) * 0.3;

      tubeSlots[i]!.position.set(w.centerX, w.surfaceY + th / 2 + 0.1, w.centerZ);
      tubeSlots[i]!.rotation.set(0, yaw, TUBE_TILT);

      const dishX = Math.sin(TUBE_TILT) * th * 0.5;
      const dishY = th + 0.1 + Math.cos(TUBE_TILT) * th * 0.3;
      dishSlots[i]!.position.set(w.centerX + dishX, w.surfaceY + dishY, w.centerZ);
      dishSlots[i]!.rotation.set(0, yaw, TUBE_TILT);

      gearSlots[i]!.position.set(w.centerX, w.surfaceY + 0.3, w.centerZ);
      gearSlots[i]!.rotation.set(Math.PI / 2, 0, t * 0.5 + w.phase);

      const beamX = Math.sin(TUBE_TILT) * 1.2;
      beamSlots[i]!.position.set(w.centerX + beamX, w.surfaceY + th + 0.5, w.centerZ);
      beamSlots[i]!.rotation.set(0, yaw, TUBE_TILT + Math.PI / 2);

      starSlots[i]!.position.set(w.centerX, w.surfaceY, w.centerZ);
    }
  };

  const commit = (): void => { update(0); };

  const dispose = (): void => {
    scene.remove(group);
    groundGeometry.dispose(); baseGeometry.dispose(); tubeGeometry.dispose();
    dishGeometry.dispose(); gearGeometry.dispose(); beamGeometry.dispose(); starGeometry.dispose();
    gMat.dispose(); bMat.dispose(); bmMat.dispose(); stMat.dispose();
  };

  return { group, clear, addInstance, commit, update, dispose };
};
