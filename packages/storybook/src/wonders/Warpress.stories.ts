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
import { createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  hammerSpeed: number;
  sparkCount: number;
};

const uTime = { value: 0 };
const uOrange = { value: new Color(0xff6020) };

/* ── Heat-glow ground shader ──────────────────────────────── */

const groundMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uOrange,
      uDark: { value: new Color(0x100a06) },
      uCrack: { value: new Color(0x401808) },
    },
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
      uniform vec3 uOrange, uDark, uCrack;
      varying vec3 vWorldPos;
      float hash(vec2 p) { p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float noise(vec2 p) {
        vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec2 p = vWorldPos.xz;
        float n = noise(p*4.0)*0.6+noise(p*9.0)*0.2;
        vec3 base = mix(uDark, uCrack, n);
        float impact = exp(-length(p)*2.0)*0.6;
        float pulse = sin(uTime*3.0)*0.15+0.85;
        base += uOrange * impact * pulse;
        float crack = smoothstep(0.7,0.75,n)*0.3;
        base += uOrange*0.4*crack*pulse;
        gl_FragColor = vec4(base, 1.0);
      }
    `,
  });

/* ── Iron material shader ─────────────────────────────────── */

const ironMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uIron: { value: new Color(0x2a2825) },
      uGlow: { value: new Color(0x553020) },
      uOrange,
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
      uniform vec3 uIron, uGlow, uOrange;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0-max(dot(vNormal,vd),0.0),2.5);
        vec3 c = mix(uIron, uGlow, f*0.4);
        float heat = exp(-abs(vWorldPos.y)*2.0)*0.2;
        c += uOrange*heat;
        c *= 0.5+0.5*max(dot(vNormal,normalize(vec3(1,2,1))),0.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

/* ── Spark particles ──────────────────────────────────────── */

function makeSparks(count: number): Points {
  const pos = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 0.4;
    pos[i * 3 + 1] = Math.random() * 0.8;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("phase", new Float32BufferAttribute(phases, 1));
  const mat = new ShaderMaterial({
    uniforms: { uTime },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        float cycle = mod(uTime*2.0+phase, 3.14159);
        p.y = cycle*0.3;
        p.x += sin(phase*5.0)*cycle*0.2;
        p.z += cos(phase*7.0)*cycle*0.15;
        vAlpha = (1.0-cycle/3.14159)*0.8;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 3.0*(1.0/-mv.z);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord-0.5);
        vec3 c = mix(vec3(1.0,0.8,0.2), vec3(1.0,0.3,0.05), d*2.0);
        gl_FragColor = vec4(c, smoothstep(0.5,0.0,d)*vAlpha);
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
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#080504" });
  const scene = stage.scene;

  // Ground
  const gm = groundMat();
  const ground = new Mesh(new PlaneGeometry(10, 10, 32, 32), gm);
  ground.geometry.rotateX(-Math.PI / 2);
  ground.position.y = -0.01;
  scene.add(ground);

  const im = ironMat();

  // Anvil base (wide box)
  const anvil = new Mesh(new BoxGeometry(0.8, 0.15, 0.5), im);
  anvil.position.set(0, 0.075, 0);
  scene.add(anvil);

  // Anvil top (narrower, taller)
  const anvilTop = new Mesh(new BoxGeometry(0.5, 0.1, 0.3), im);
  anvilTop.position.set(0, 0.2, 0);
  scene.add(anvilTop);

  // Hammer arm (pivot point at top)
  const hammerPivot = new Mesh(new CylinderGeometry(0.03, 0.03, 0.06, 8), im);
  hammerPivot.position.set(0, 0.7, 0);
  scene.add(hammerPivot);

  // Hammer handle
  const handle = new Mesh(new BoxGeometry(0.03, 0.5, 0.03), im);
  handle.position.set(0, 0.45, 0);
  scene.add(handle);

  // Hammer head
  const head = new Mesh(new BoxGeometry(0.25, 0.12, 0.15), im);
  head.position.set(0, 0.18, 0);
  scene.add(head);

  // Support pillars
  for (let side = -1; side <= 1; side += 2) {
    const pillar = new Mesh(new BoxGeometry(0.06, 0.8, 0.06), im);
    pillar.position.set(side * 0.45, 0.4, 0);
    scene.add(pillar);
    // Cross beam
    const beam = new Mesh(new BoxGeometry(0.96, 0.05, 0.05), im);
    beam.position.set(0, 0.8, 0);
    scene.add(beam);
  }

  // Light (forge fire)
  const light = new PointLight(0xff4010, 3.0, 5, 1.5);
  light.position.set(0, 0.3, 0);
  scene.add(light);

  // Sparks
  const sparks = makeSparks(args.sparkCount);
  sparks.position.set(0, 0.2, 0);
  scene.add(sparks);

  // Animation — hammer strikes
  const startTime = performance.now();
  let rafId = 0;
  const animate = (): void => {
    const t = (performance.now() - startTime) / 1000;
    uTime.value = t;
    // Hammer bounces up and down
    const cycle = t * args.hammerSpeed;
    const strike = Math.abs(Math.sin(cycle * Math.PI));
    head.position.y = 0.18 + (1 - strike) * 0.35;
    handle.position.y = 0.45 + (1 - strike) * 0.175;
    handle.scale.y = 0.7 + strike * 0.3;
    // Flash on impact
    const impact = Math.pow(Math.max(0, Math.sin(cycle * Math.PI)), 8);
    light.intensity = 2.0 + impact * 4.0;
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    () => {
      gm.dispose(); ground.geometry.dispose();
      im.dispose();
      anvil.geometry.dispose(); anvilTop.geometry.dispose();
      hammerPivot.geometry.dispose(); handle.geometry.dispose(); head.geometry.dispose();
      (sparks.geometry as BufferGeometry).dispose();
      (sparks.material as ShaderMaterial).dispose();
    },
  ]);
};

/* ── Storybook meta ────────────────────────────────────────── */

const meta: Meta<Args> = {
  title: "Natural Wonders/Warpress",
  parameters: {
    docs: {
      description: {
        component:
          "The Warpress — a massive stamping forge with a hammer mechanism, anvil, and flying sparks. " +
          "Passive effect: mustering flags fill at 2× rate; +1 flag beyond cap (max 6 instead of 5).",
      },
    },
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 10, step: 0.5 } },
    hammerSpeed: { control: { type: "range", min: 0.3, max: 3.0, step: 0.1 } },
    sparkCount: { control: { type: "range", min: 10, max: 80, step: 5 } },
  },
  args: {
    cameraDistance: 4,
    hammerSpeed: 1.0,
    sparkCount: 40,
  },
  render,
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const CloseUp: Story = {
  args: { cameraDistance: 2.5, hammerSpeed: 1.5, sparkCount: 50 },
};
export const WideView: Story = {
  args: { cameraDistance: 7, hammerSpeed: 0.8, sparkCount: 30 },
};
export const RapidStrike: Story = {
  args: { cameraDistance: 3.5, hammerSpeed: 2.8, sparkCount: 70 },
  parameters: {
    docs: {
      description: { story: "Hammer striking rapidly — the Warpress at maximum output." },
    },
  },
};
export const HeavySparks: Story = {
  args: { cameraDistance: 4, hammerSpeed: 1.0, sparkCount: 80 },
};
