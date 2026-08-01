import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
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
  scrollSpeed: number;
  ringCount: number;
};

const uTime = { value: 0 };
const uBrass = { value: new Color(0xd4a540) };

/* ── Engraved brass ground shader ─────────────────────────── */

const groundMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uBrass,
      uDark: { value: new Color(0x100e08) },
      uPlate: { value: new Color(0x1e1a10) },
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
      uniform vec3 uBrass, uDark, uPlate;
      varying vec2 vUv;
      varying vec3 vWorldPos;
      float hash(vec2 p) { p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      void main() {
        vec2 p = vWorldPos.xz;
        // Grid lines (engraved circuits)
        float gx = smoothstep(0.02, 0.0, abs(fract(p.x*2.0)-0.5)-0.48);
        float gy = smoothstep(0.02, 0.0, abs(fract(p.y*2.0)-0.5)-0.48);
        float grid = max(gx, gy)*0.3;
        // Scrolling light along grid
        float scroll = sin(p.x*4.0+uTime*1.5)*sin(p.y*4.0-uTime*0.8)*0.5+0.5;
        scroll *= grid*2.0;
        vec3 base = mix(uDark, uPlate, 0.3);
        base += uBrass * grid * 0.3;
        base += uBrass * scroll * 0.15;
        gl_FragColor = vec4(base, 1.0);
      }
    `,
  });

/* ── Brass frame shader ───────────────────────────────────── */

const brassMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uBrass,
      uGlass: { value: new Color(0x40c8e8) },
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

/* ── Glass panel shader ───────────────────────────────────── */

const glassMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uGlass: { value: new Color(0x40c8e8) },
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
      uniform vec3 uGlass;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0-max(dot(vNormal,vd),0.0),3.0);
        // Scrolling text pattern
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

/* ── Light particles (calculation sparks) ─────────────────── */

function makeCalcSparks(): Points {
  const count = 25;
  const pos = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
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
  const mat = new ShaderMaterial({
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
  return new Points(geo, mat);
}

/* ── Story render function ─────────────────────────────────── */

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#080604" });
  const scene = stage.scene;

  // Ground
  const gm = groundMat();
  const ground = new Mesh(new PlaneGeometry(10, 10, 32, 32), gm);
  ground.geometry.rotateX(-Math.PI / 2);
  ground.position.y = -0.01;
  scene.add(ground);

  const bm = brassMat();
  const gl = glassMat();

  // Base platform
  const base = new Mesh(new CylinderGeometry(0.6, 0.7, 0.08, 24), bm);
  base.position.y = 0.04;
  scene.add(base);

  // Concentric calculation rings (rotating at different speeds)
  const rings: Mesh[] = [];
  for (let i = 0; i < args.ringCount; i++) {
    const radius = 0.2 + i * 0.12;
    const ring = new Mesh(new RingGeometry(radius - 0.015, radius + 0.015, 32), bm);
    ring.position.y = 0.15 + i * 0.08;
    ring.rotation.x = -Math.PI / 2 + (i % 2 === 0 ? 0.15 : -0.15);
    scene.add(ring);
    rings.push(ring);
  }

  // Glass panels (vertical rectangles between rings)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const panel = new Mesh(new CylinderGeometry(0.08, 0.08, 0.3, 4), gl);
    panel.position.set(Math.cos(a) * 0.35, 0.3, Math.sin(a) * 0.35);
    panel.rotation.y = a;
    scene.add(panel);
  }

  // Central computation orb
  const orb = new Mesh(new IcosahedronGeometry(0.12, 1), gl);
  orb.position.y = 0.45;
  scene.add(orb);

  // Light
  const light = new PointLight(0xd4a540, 2.0, 5, 1.5);
  light.position.set(0, 0.5, 0);
  scene.add(light);

  // Calculation sparks
  const sparks = makeCalcSparks();
  scene.add(sparks);

  // Animation
  const startTime = performance.now();
  let rafId = 0;
  const animate = (): void => {
    const t = (performance.now() - startTime) / 1000;
    uTime.value = t;
    rings.forEach((ring, i) => {
      ring.rotation.z = t * args.scrollSpeed * (i % 2 === 0 ? 1 : -1) * (0.5 + i * 0.2);
    });
    orb.rotation.y = t * 0.5;
    orb.rotation.x = Math.sin(t * 0.3) * 0.2;
    light.intensity = 1.5 + Math.sin(t * 1.5) * 0.5;
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    () => {
      gm.dispose(); ground.geometry.dispose();
      bm.dispose(); gl.dispose();
      base.geometry.dispose();
      rings.forEach(r => r.geometry.dispose());
      (sparks.geometry as BufferGeometry).dispose();
      (sparks.material as ShaderMaterial).dispose();
    },
  ]);
};

/* ── Storybook meta ────────────────────────────────────────── */

const meta: Meta<Args> = {
  title: "Natural Wonders/Calculating Engine",
  parameters: {
    docs: {
      description: {
        component:
          "The Calculating Engine — a brass-and-glass computing machine with rotating calculation rings, " +
          "scrolling glass panels, and computation sparks. Passive effect: tech gold costs reduced by 10%; shard costs unaffected.",
      },
    },
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 10, step: 0.5 } },
    scrollSpeed: { control: { type: "range", min: 0.2, max: 3.0, step: 0.1 } },
    ringCount: { control: { type: "range", min: 2, max: 6, step: 1 } },
  },
  args: {
    cameraDistance: 3.5,
    scrollSpeed: 1.0,
    ringCount: 4,
  },
  render,
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const CloseUp: Story = {
  args: { cameraDistance: 2.0, scrollSpeed: 1.5, ringCount: 4 },
};
export const WideView: Story = {
  args: { cameraDistance: 6, scrollSpeed: 0.8, ringCount: 4 },
};
export const ManyRings: Story = {
  args: { cameraDistance: 4, scrollSpeed: 1.0, ringCount: 6 },
  parameters: {
    docs: {
      description: { story: "Six concentric rings — the engine at maximum computational capacity." },
    },
  },
};
export const FastComputation: Story = {
  args: { cameraDistance: 3.5, scrollSpeed: 2.8, ringCount: 4 },
};
