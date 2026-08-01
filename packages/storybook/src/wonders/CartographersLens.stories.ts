import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  PlaneGeometry,
  PointLight,
  Points,
  RingGeometry,
  ShaderMaterial,
} from "three";
import { createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  ringSpeed: number;
  prismIntensity: number;
};

const uTime = { value: 0 };

/* ── Map-grid ground shader ───────────────────────────────── */

const groundMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uDark: { value: new Color(0x080a10) },
      uGrid: { value: new Color(0x182030) },
    },
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
      uniform vec3 uDark, uGrid;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vec2 p = vWorldPos.xz;
        // Map-like grid lines
        float gx = smoothstep(0.015, 0.0, abs(fract(p.x*3.0)-0.5)-0.485);
        float gy = smoothstep(0.015, 0.0, abs(fract(p.y*3.0)-0.5)-0.485);
        float grid = max(gx, gy);
        vec3 base = mix(uDark, uGrid, grid*0.4);
        // Faint compass rose at center
        float dist = length(p);
        float rose = smoothstep(0.4, 0.38, dist) - smoothstep(0.38, 0.35, dist);
        rose *= step(0.35, dist);
        float angle = atan(p.y, p.x);
        rose *= max(sin(angle*4.0), 0.0);
        base += vec3(0.15, 0.12, 0.08) * rose * 0.3;
        gl_FragColor = vec4(base, 1.0);
      }
    `,
  });

/* ── Brass ring shader ────────────────────────────────────── */

const brassMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uBrass: { value: new Color(0xc89830) },
      uGold: { value: new Color(0xf0d060) },
    },
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

/* ── Prismatic beam shader ────────────────────────────────── */

const prismMat = (intensity: number): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uIntensity: { value: intensity },
    },
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
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx+K.xyz)*6.0-K.www);
        return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
      }
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

/* ── Prismatic light particles ────────────────────────────── */

function makePrismParticles(): Points {
  const count = 40;
  const pos = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const hues = new Float32Array(count);
  for (let i = 0; i < count; i++) {
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
  const mat = new ShaderMaterial({
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
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx+K.xyz)*6.0-K.www);
        return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
      }
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
  return new Points(geo, mat);
}

/* ── Story render function ─────────────────────────────────── */

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#040608" });
  const scene = stage.scene;

  // Ground
  const gm = groundMat();
  const ground = new Mesh(new PlaneGeometry(12, 12, 32, 32), gm);
  ground.geometry.rotateX(-Math.PI / 2);
  ground.position.y = -0.01;
  scene.add(ground);

  const bm = brassMat();

  // Base
  const base = new Mesh(new CylinderGeometry(0.35, 0.4, 0.06, 24), bm);
  base.position.y = 0.03;
  scene.add(base);

  // Concentric astrolabe rings (3, different tilts)
  const rings: Mesh[] = [];
  const ringRadii = [0.3, 0.42, 0.55];
  const ringTilts = [0.1, -0.2, 0.15];
  for (let i = 0; i < 3; i++) {
    const ring = new Mesh(
      new RingGeometry(ringRadii[i]! - 0.012, ringRadii[i]! + 0.012, 48),
      bm
    );
    ring.position.y = 0.12 + i * 0.07;
    ring.rotation.x = -Math.PI / 2 + ringTilts[i]!;
    scene.add(ring);
    rings.push(ring);
  }

  // Central lens (small transparent disc)
  const lensMat = new ShaderMaterial({
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
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
        vec3 p = abs(fract(c.xxx+K.xyz)*6.0-K.www);
        return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);
      }
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
  const lens = new Mesh(new CylinderGeometry(0.12, 0.12, 0.01, 24), lensMat);
  lens.position.y = 0.35;
  scene.add(lens);

  // Prismatic beams (4 planes radiating outward)
  const pm = prismMat(args.prismIntensity);
  const beams: Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const beam = new Mesh(new PlaneGeometry(0.4, 2.5, 1, 32), pm);
    beam.position.set(Math.cos(a) * 1.2, 0.3, Math.sin(a) * 1.2);
    beam.rotation.y = -a;
    beam.rotation.x = -0.2;
    scene.add(beam);
    beams.push(beam);
  }

  // Light
  const light = new PointLight(0xf0d060, 2.0, 5, 1.5);
  light.position.set(0, 0.5, 0);
  scene.add(light);

  // Prismatic particles
  const particles = makePrismParticles();
  scene.add(particles);

  // Animation
  const startTime = performance.now();
  let rafId = 0;
  const animate = (): void => {
    const t = (performance.now() - startTime) / 1000;
    uTime.value = t;
    rings.forEach((ring, i) => {
      ring.rotation.z = t * args.ringSpeed * (i % 2 === 0 ? 1 : -1) * (1 + i * 0.3);
    });
    lens.rotation.y = t * 0.3;
    light.intensity = 1.5 + Math.sin(t * 1.2) * 0.5;
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    () => {
      gm.dispose(); ground.geometry.dispose();
      bm.dispose(); pm.dispose(); lensMat.dispose();
      base.geometry.dispose();
      rings.forEach(r => r.geometry.dispose());
      lens.geometry.dispose();
      beams.forEach(b => b.geometry.dispose());
      (particles.geometry as BufferGeometry).dispose();
      (particles.material as ShaderMaterial).dispose();
    },
  ]);
};

/* ── Storybook meta ────────────────────────────────────────── */

const meta: Meta<Args> = {
  title: "Natural Wonders/Cartographers Lens",
  parameters: {
    docs: {
      description: {
        component:
          "The Cartographer's Lens — a brass astrolabe with concentric rotating rings, a prismatic lens, " +
          "rainbow light beams, and rainbow particles. Passive effect: +1 vision range to all owned tiles.",
      },
    },
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 10, step: 0.5 } },
    ringSpeed: { control: { type: "range", min: 0.2, max: 3.0, step: 0.1 } },
    prismIntensity: { control: { type: "range", min: 0.3, max: 2.0, step: 0.1 } },
  },
  args: {
    cameraDistance: 4,
    ringSpeed: 0.8,
    prismIntensity: 1.0,
  },
  render,
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const CloseUp: Story = {
  args: { cameraDistance: 2.5, ringSpeed: 1.2, prismIntensity: 1.2 },
};
export const WideView: Story = {
  args: { cameraDistance: 7, ringSpeed: 0.6, prismIntensity: 0.8 },
};
export const MaxPrism: Story = {
  args: { cameraDistance: 4, ringSpeed: 1.0, prismIntensity: 2.0 },
  parameters: {
    docs: {
      description: { story: "Full prismatic dispersion — rainbow beams and particles at maximum intensity." },
    },
  },
};
export const SlowRings: Story = {
  args: { cameraDistance: 3.5, ringSpeed: 0.3, prismIntensity: 1.0 },
};
