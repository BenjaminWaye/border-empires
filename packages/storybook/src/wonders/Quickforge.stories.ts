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
  pistonSpeed: number;
  glowIntensity: number;
};

const uTime = { value: 0 };
const uRedHot = { value: new Color(0xff3010) };

/* ── Hot metal ground shader ──────────────────────────────── */

const groundMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uRedHot,
      uDark: { value: new Color(0x0c0604) },
      uEmber: { value: new Color(0x301008) },
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

/* ── Dark metal shader ────────────────────────────────────── */

const metalMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uIron: { value: new Color(0x1e1c1a) },
      uEdge: { value: new Color(0x4a4440) },
      uRedHot,
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

/* ── Steam particles ──────────────────────────────────────── */

function makeSteam(): Points {
  const count = 35;
  const pos = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 0.6;
    pos[i * 3 + 1] = Math.random() * 1.2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
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
  return new Points(geo, mat);
}

/* ── Story render function ─────────────────────────────────── */

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#060404" });
  const scene = stage.scene;

  // Ground: grass field with the wonder's hot-metal glow layered on top,
  // spanning its tile + 8 neighbors (3x3).
  const grass = createGrassGround(6);
  scene.add(grass.group);
  const gm = groundMat();
  const ground = new Mesh(new PlaneGeometry(3, 3, 32, 32), gm);
  ground.geometry.rotateX(-Math.PI / 2);
  ground.position.y = -0.005;
  scene.add(ground);

  const mm = metalMat();

  // Forge base (wide box)
  const base = new Mesh(new BoxGeometry(0.8, 0.2, 0.5), mm);
  base.position.set(0, 0.1, 0);
  scene.add(base);

  // Forge opening (darker inset)
  const opening = new Mesh(new BoxGeometry(0.4, 0.12, 0.3), mm);
  opening.position.set(0, 0.16, 0);
  scene.add(opening);

  // Piston cylinders (3)
  const pistons: { body: Mesh; rod: Mesh }[] = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.25;
    const body = new Mesh(new CylinderGeometry(0.04, 0.04, 0.35, 8), mm);
    body.position.set(x, 0.375, 0);
    scene.add(body);
    const rod = new Mesh(new CylinderGeometry(0.02, 0.02, 0.15, 6), mm);
    rod.position.set(x, 0.55, 0);
    scene.add(rod);
    pistons.push({ body, rod });
  }

  // Support frame
  const frameL = new Mesh(new BoxGeometry(0.04, 0.5, 0.04), mm);
  frameL.position.set(-0.45, 0.25, 0);
  scene.add(frameL);
  const frameR = new Mesh(new BoxGeometry(0.04, 0.5, 0.04), mm);
  frameR.position.set(0.45, 0.25, 0);
  scene.add(frameR);
  const frameTop = new Mesh(new BoxGeometry(0.94, 0.04, 0.04), mm);
  frameTop.position.set(0, 0.5, 0);
  scene.add(frameTop);

  // Light (forge fire)
  const light = new PointLight(0xff3010, 3.0, 5, 1.5);
  light.position.set(0, 0.2, 0);
  scene.add(light);

  // Steam
  const steam = makeSteam();
  steam.position.set(0, 0.3, 0);
  scene.add(steam);

  // Animation — pistons pump up and down
  const startTime = performance.now();
  let rafId = 0;
  const animate = (): void => {
    const t = (performance.now() - startTime) / 1000;
    uTime.value = t;
    pistons.forEach((p, i) => {
      const offset = (i / 3) * Math.PI * 2;
      const cycle = Math.sin(t * args.pistonSpeed * Math.PI * 2 + offset);
      p.rod.position.y = 0.55 + cycle * 0.06;
      p.rod.scale.y = 1.0 + cycle * 0.3;
    });
    light.intensity = args.glowIntensity * (2.0 + Math.sin(t * 3.0) * 0.8);
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    grass.dispose,
    () => {
      gm.dispose(); ground.geometry.dispose();
      mm.dispose();
      base.geometry.dispose(); opening.geometry.dispose();
      pistons.forEach(p => { p.body.geometry.dispose(); p.rod.geometry.dispose(); });
      frameL.geometry.dispose(); frameR.geometry.dispose(); frameTop.geometry.dispose();
      (steam.geometry as BufferGeometry).dispose();
      (steam.material as ShaderMaterial).dispose();
    },
  ]);
};

/* ── Storybook meta ────────────────────────────────────────── */

const meta: Meta<Args> = {
  title: "Natural Wonders/Quickforge",
  parameters: {
    docs: {
      description: {
        component:
          "The Quickforge — a rapid-action forge with animated pistons, steam jets, and a red-hot glow. " +
          "Passive effect: once per 24h (UTC midnight), one rush-buy using the standard rush-buy mechanic costs 40 gold less.",
      },
    },
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 10, step: 0.5 } },
    pistonSpeed: { control: { type: "range", min: 0.3, max: 3.0, step: 0.1 } },
    glowIntensity: { control: { type: "range", min: 0.5, max: 2.0, step: 0.1 } },
  },
  args: {
    cameraDistance: 3.5,
    pistonSpeed: 1.0,
    glowIntensity: 1.0,
  },
  render,
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const CloseUp: Story = {
  args: { cameraDistance: 2.0, pistonSpeed: 1.5, glowIntensity: 1.2 },
};
export const WideView: Story = {
  args: { cameraDistance: 6, pistonSpeed: 0.8, glowIntensity: 0.8 },
};
export const RapidFire: Story = {
  args: { cameraDistance: 3, pistonSpeed: 2.8, glowIntensity: 1.5 },
  parameters: {
    docs: {
      description: { story: "Pistons firing rapidly — the Quickforge at maximum throughput." },
    },
  },
};
export const BlazingGlow: Story = {
  args: { cameraDistance: 4, pistonSpeed: 1.0, glowIntensity: 2.0 },
};
