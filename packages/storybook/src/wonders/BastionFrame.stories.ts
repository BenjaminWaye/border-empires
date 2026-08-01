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
  TorusGeometry,
  RingGeometry,
} from "three";
import { createGrassGround, createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  latticeScale: number;
  pulseSpeed: number;
};

const uTime = { value: 0 };
const uCopper = { value: new Color(0xb87333) };

/* ── Mossy stone ground shader ────────────────────────────── */

const groundMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uCopper,
      uStone: { value: new Color(0x1a1e18) },
      uMoss: { value: new Color(0x1a2818) },
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

/* ── Copper pipe/lattice shader ───────────────────────────── */

const copperMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uCopper,
      uVerdigris: { value: new Color(0x4a8c6a) },
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

/* ── Aether energy particles ──────────────────────────────── */

function makeEnergy(): Points {
  const count = 30;
  const pos = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
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
  const mat = new ShaderMaterial({
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
  return new Points(geo, mat);
}

/* ── Pipe geometry ─────────────────────────────────────────── */

function makePipe(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, r: number, mat: ShaderMaterial): Mesh {
  const dx = x2-x1, dy = y2-y1, dz = z2-z1;
  const len = Math.sqrt(dx*dx+dy*dy+dz*dz);
  const geo = new CylinderGeometry(r, r, len, 8);
  const mesh = new Mesh(geo, mat);
  mesh.position.set((x1+x2)/2, (y1+y2)/2, (z1+z2)/2);
  // Align cylinder (default Y-axis) to direction
  const dir = { x: dx/len, y: dy/len, z: dz/len };
  mesh.rotation.z = Math.asin(-dir.x);
  mesh.rotation.x = Math.asin(dir.z);
  return mesh;
}

/* ── Story render function ─────────────────────────────────── */

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#0a0e0a" });
  const scene = stage.scene;
  const s = args.latticeScale;

  // Ground: grass field with the wonder's mossy stone effect layered on
  // top, spanning its tile + 8 neighbors (3x3).
  const grass = createGrassGround(6);
  scene.add(grass.group);
  const gm = groundMat();
  const ground = new Mesh(new PlaneGeometry(3, 3, 32, 32), gm);
  ground.geometry.rotateX(-Math.PI / 2);
  ground.position.y = -0.005;
  scene.add(ground);

  const cm = copperMat();
  const pr = 0.025; // pipe radius

  // Lattice — horizontal ring at ground level
  const ring = new Mesh(new TorusGeometry(0.7*s, pr, 8, 24), cm);
  ring.position.y = 0.05;
  ring.rotation.x = Math.PI/2;
  scene.add(ring);

  // Upper ring
  const ring2 = new Mesh(new TorusGeometry(0.5*s, pr, 8, 20), cm);
  ring2.position.y = 0.5*s;
  ring2.rotation.x = Math.PI/2;
  scene.add(ring2);

  // Vertical support pipes (6 around the ring)
  for (let i = 0; i < 6; i++) {
    const a = (i/6)*Math.PI*2;
    const x = Math.cos(a)*0.7*s;
    const z = Math.sin(a)*0.7*s;
    const pipe = new Mesh(new CylinderGeometry(pr, pr, 0.5*s, 8), cm);
    pipe.position.set(x, 0.25*s, z);
    scene.add(pipe);
  }

  // Diagonal cross-braces
  for (let i = 0; i < 4; i++) {
    const a1 = (i/4)*Math.PI*2;
    const a2 = ((i+1)/4)*Math.PI*2;
    const x1 = Math.cos(a1)*0.7*s, z1 = Math.sin(a1)*0.7*s;
    const x2 = Math.cos(a2)*0.7*s, z2 = Math.sin(a2)*0.7*s;
    const pipe = new Mesh(new CylinderGeometry(pr*0.7, pr*0.7, 0.8*s, 6), cm);
    pipe.position.set((x1+x2)/2, 0.25*s, (z1+z2)/2);
    pipe.rotation.z = Math.atan2(x2-x1, 0.5*s)*0.5;
    scene.add(pipe);
  }

  // Central gear (small torus)
  const gear = new Mesh(new TorusGeometry(0.15*s, pr*1.5, 8, 16), cm);
  gear.position.y = 0.5*s;
  gear.rotation.x = Math.PI/2;
  scene.add(gear);

  // Light
  const light = new PointLight(0xb87333, 2.0, 5, 1.5);
  light.position.set(0, 0.4*s, 0);
  scene.add(light);

  // Energy particles
  const energy = makeEnergy();
  scene.add(energy);

  // Animation
  const startTime = performance.now();
  let rafId = 0;
  const animate = (): void => {
    const t = (performance.now() - startTime) / 1000;
    uTime.value = t;
    gear.rotation.z = t * args.pulseSpeed;
    ring2.rotation.z = t * args.pulseSpeed * 0.3;
    light.intensity = 1.5 + Math.sin(t * 0.8) * 0.5;
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    grass.dispose,
    () => {
      gm.dispose(); ground.geometry.dispose();
      cm.dispose();
      ring.geometry.dispose(); ring2.geometry.dispose(); gear.geometry.dispose();
      (energy.geometry as BufferGeometry).dispose();
      (energy.material as ShaderMaterial).dispose();
    },
  ]);
};

/* ── Storybook meta ────────────────────────────────────────── */

const meta: Meta<Args> = {
  title: "Natural Wonders/Bastion Frame",
  parameters: {
    docs: {
      description: {
        component:
          "The Bastion Frame — a copper pipe and gearwork lattice embedded in the landscape, " +
          "with aether energy flowing through the pipes. Passive effect: all forts owned by the controller gain +0.5× defense multiplier (additive).",
      },
    },
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 10, step: 0.5 } },
    latticeScale: { control: { type: "range", min: 0.5, max: 2.0, step: 0.1 } },
    pulseSpeed: { control: { type: "range", min: 0.2, max: 3.0, step: 0.1 } },
  },
  args: {
    cameraDistance: 4,
    latticeScale: 1.0,
    pulseSpeed: 0.8,
  },
  render,
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const CloseUp: Story = {
  args: { cameraDistance: 2.5, latticeScale: 1.0, pulseSpeed: 1.2 },
};
export const WideView: Story = {
  args: { cameraDistance: 7, latticeScale: 1.0, pulseSpeed: 0.6 },
};
export const LargeLattice: Story = {
  args: { cameraDistance: 5, latticeScale: 1.8, pulseSpeed: 0.8 },
  parameters: {
    docs: {
      description: { story: "Expanded lattice — shows the full copper framework spread across the landscape." },
    },
  },
};
export const FastPulse: Story = {
  args: { cameraDistance: 4, latticeScale: 1.0, pulseSpeed: 2.5 },
};
