import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Mesh,
  PlaneGeometry,
  PointLight,
  Points,
  ShaderMaterial,
  BoxGeometry,
} from "three";
import { createGrassGround, createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  smokeIntensity: number;
  towerHeight: number;
};

const uTime = { value: 0 };
const uAmber = { value: new Color(0xe8a030) };

/* ── Scorched-ground overlay — layers over grass, doesn't replace it ── */

const groundMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uAmber },
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

/* ── Building metal shader ────────────────────────────────── */

const buildingMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uIron: { value: new Color(0x3a3835) },
      uHighlight: { value: new Color(0x6a6058) },
      uAmber,
    },
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

/* ── Smoke particles ──────────────────────────────────────── */

function makeSmoke(intensity: number): Points {
  const count = 60;
  const pos = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
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
  const mat = new ShaderMaterial({
    uniforms: { uTime, uIntensity: { value: intensity } },
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
  return new Points(geo, mat);
}

/* ── Story render function ─────────────────────────────────── */

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0a0808" });
  const scene = stage.scene;

  // Ground: grass field with the wonder's scorched-earth effect layered on
  // top, spanning its tile + 8 neighbors (3x3).
  const grass = createGrassGround(6);
  scene.add(grass.group);
  const gm = groundMat();
  const ground = new Mesh(new PlaneGeometry(3, 3, 32, 32), gm);
  ground.geometry.rotateX(-Math.PI / 2);
  ground.position.y = -0.005;
  scene.add(ground);

  const bm = buildingMat();

  // Barracks (2 low boxes)
  const b1 = new Mesh(new BoxGeometry(0.7, 0.3, 0.4), bm);
  b1.position.set(-0.6, 0.15, 0.2);
  scene.add(b1);
  const b2 = new Mesh(new BoxGeometry(0.6, 0.25, 0.35), bm);
  b2.position.set(0.6, 0.125, -0.3);
  scene.add(b2);

  // Smokestacks (3 cylinders)
  const stacks = [
    { x: -0.3, z: -0.5, h: 0.6 },
    { x: 0.2, z: -0.6, h: 0.75 },
    { x: -0.1, z: -0.8, h: 0.5 },
  ];
  stacks.forEach(s => {
    const stack = new Mesh(new CylinderGeometry(0.04, 0.055, s.h, 8), bm);
    stack.position.set(s.x, s.h / 2, s.z);
    scene.add(stack);
  });

  // Command tower (tall)
  const tower = new Mesh(new BoxGeometry(0.18, args.towerHeight, 0.18), bm);
  tower.position.set(0, args.towerHeight / 2, 0);
  scene.add(tower);

  // Tower top (wider cap)
  const cap = new Mesh(new BoxGeometry(0.28, 0.08, 0.28), bm);
  cap.position.set(0, args.towerHeight + 0.04, 0);
  scene.add(cap);

  // Wall perimeter
  const wallGeo = new BoxGeometry(2.0, 0.12, 0.04);
  const wall1 = new Mesh(wallGeo, bm);
  wall1.position.set(0, 0.06, 0.9);
  scene.add(wall1);
  const wall2 = new Mesh(wallGeo, bm);
  wall2.position.set(0, 0.06, -0.9);
  scene.add(wall2);
  const sideWallGeo = new BoxGeometry(0.04, 0.12, 1.8);
  const wall3 = new Mesh(sideWallGeo, bm);
  wall3.position.set(1.0, 0.06, 0);
  scene.add(wall3);
  const wall4 = new Mesh(sideWallGeo, bm);
  wall4.position.set(-1.0, 0.06, 0);
  scene.add(wall4);

  // Light (forge glow)
  const light = new PointLight(0xe8a030, 2.0, 5, 1.5);
  light.position.set(0, 0.5, -0.5);
  scene.add(light);

  // Smoke
  const smoke = makeSmoke(args.smokeIntensity);
  smoke.position.set(-0.2, 0.5, -0.6);
  scene.add(smoke);

  // Animation
  const startTime = performance.now();
  let rafId = 0;
  const animate = (): void => {
    const t = (performance.now() - startTime) / 1000;
    uTime.value = t;
    light.intensity = 1.5 + Math.sin(t * 2.0) * 0.5;
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    grass.dispose,
    () => {
      gm.dispose(); ground.geometry.dispose();
      bm.dispose();
      [b1, b2, tower, cap, wall1, wall2, wall3, wall4, ...stacks.map(() => null)].forEach((m, i) => {
        if (i < 5) m?.geometry.dispose();
      });
      stacks.forEach((stack) => {
        const child = scene.children.find((c): c is Mesh => c instanceof Mesh && Math.abs(c.position.y - stack.h / 2) < 0.01);
        if (child) child.geometry.dispose();
      });
      (smoke.geometry as BufferGeometry).dispose();
      (smoke.material as ShaderMaterial).dispose();
    },
  ]);
};

/* ── Storybook meta ────────────────────────────────────────── */

const meta: Meta<Args> = {
  title: "Natural Wonders/Conscription Engine",
  parameters: {
    docs: {
      description: {
        component:
          "The Conscription Engine — an industrial compound with barracks, smokestacks, and a command tower. " +
          "Passive effect: +2000 flat manpower cap modifier; instant +2000 manpower to pool on first claim per season.",
      },
    },
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 10, step: 0.5 } },
    smokeIntensity: { control: { type: "range", min: 0.0, max: 1.5, step: 0.1 } },
    towerHeight: { control: { type: "range", min: 0.4, max: 1.5, step: 0.1 } },
  },
  args: {
    cameraDistance: 4,
    smokeIntensity: 1.0,
    towerHeight: 0.8,
  },
  render,
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const CloseUp: Story = {
  args: { cameraDistance: 2.5, smokeIntensity: 1.2, towerHeight: 0.8 },
};
export const WideView: Story = {
  args: { cameraDistance: 7, smokeIntensity: 0.8, towerHeight: 0.8 },
};
export const HeavySmoke: Story = {
  args: { cameraDistance: 4, smokeIntensity: 1.5, towerHeight: 1.0 },
  parameters: {
    docs: {
      description: { story: "Dense smoke rising from all smokestacks — the engine at full mobilization." },
    },
  },
};
export const TallTower: Story = {
  args: { cameraDistance: 5, smokeIntensity: 0.6, towerHeight: 1.4 },
};
