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
  ShaderMaterial,
  TorusGeometry,
} from "three";
import { createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  waterOpacity: number;
  gearSpeed: number;
};

const uTime = { value: 0 };
const uTeal = { value: new Color(0x20c8b0) };

/* ── Water surface shader ─────────────────────────────────── */

const waterMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uTeal,
      uDeep: { value: new Color(0x061820) },
      uShallow: { value: new Color(0x103848) },
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
      uniform vec3 uTeal, uDeep, uShallow;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      float wave(vec2 p, float t) {
        return sin(p.x*3.0+t*0.7)*0.03 + sin(p.y*4.0-t*0.5)*0.02 + sin((p.x+p.y)*2.0+t*0.9)*0.015;
      }
      void main() {
        vec2 p = vWorldPos.xz;
        float w = wave(p, uTime);
        float dist = length(p);
        float ripple = sin(dist*8.0 - uTime*2.0)*0.5+0.5;
        ripple *= exp(-dist*0.8)*0.4;
        vec3 base = mix(uDeep, uShallow, 0.5+w*2.0);
        base += uTeal * ripple * 0.6;
        float edge = smoothstep(0.8, 0.2, dist)*0.3;
        base += uTeal * edge * (sin(uTime*1.5)*0.2+0.8);
        gl_FragColor = vec4(base, 0.88);
      }
    `,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
  });

/* ── Gear metal shader ────────────────────────────────────── */

const gearMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uCopper: { value: new Color(0x8b5e3c) },
      uHighlight: { value: new Color(0xd4a574) },
      uTeal,
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
      uniform vec3 uCopper, uHighlight, uTeal;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0 - max(dot(vNormal,vd),0.0), 2.5);
        float rim = smoothstep(0.6, 1.0, f);
        float pulse = sin(uTime*2.0 + vWorldPos.y*4.0)*0.15+0.85;
        vec3 c = mix(uCopper, uHighlight, f*0.6);
        c += uTeal * rim * pulse * 0.5;
        c *= 0.7 + 0.3*max(dot(vNormal, normalize(vec3(1,2,1))),0.0);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });

/* ── Bubble particles ──────────────────────────────────────── */

function makeBubbles(): Points {
  const count = 40;
  const pos = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 1.2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = -0.1 + Math.random() * 0.6;
    pos[i * 3 + 2] = Math.sin(a) * r;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("phase", new Float32BufferAttribute(phases, 1));
  const mat = new ShaderMaterial({
    uniforms: { uTime, uColor: uTeal },
    vertexShader: `
      attribute float phase;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime*0.15 + phase*0.3, 0.7) - 0.1;
        p.x += sin(uTime*0.5+phase*2.0)*0.03;
        p.z += cos(uTime*0.4+phase*1.7)*0.03;
        vAlpha = smoothstep(-0.1, 0.1, p.y)*smoothstep(0.6, 0.3, p.y);
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 5.0*(1.0/-mv.z);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord-0.5);
        float ring = smoothstep(0.35, 0.25, d) - smoothstep(0.25, 0.15, d);
        float fill = smoothstep(0.5, 0.3, d)*0.3;
        gl_FragColor = vec4(uColor*1.5, (ring+fill)*vAlpha*0.6);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  return new Points(geo, mat);
}

/* ── Pipe geometry helpers ─────────────────────────────────── */

function makePipe(x1: number, z1: number, x2: number, z2: number, radius: number, mat: ShaderMaterial): Mesh {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx*dx + dz*dz);
  const geo = new CylinderGeometry(radius, radius, len, 8);
  const mesh = new Mesh(geo, mat);
  mesh.position.set((x1+x2)/2, 0.15, (z1+z2)/2);
  mesh.rotation.z = Math.PI/2;
  mesh.rotation.y = -Math.atan2(dz, dx);
  return mesh;
}

/* ── Story render function ─────────────────────────────────── */

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#040c14" });
  const scene = stage.scene;

  // Water surface
  const wm = waterMat();
  const water = new Mesh(new PlaneGeometry(10, 10, 48, 48), wm);
  water.geometry.rotateX(-Math.PI / 2);
  water.position.y = 0.0;
  scene.add(water);

  // Gear material
  const gm = gearMat();

  // Central gear (large torus)
  const mainGear = new Mesh(new TorusGeometry(0.55, 0.08, 12, 24), gm);
  mainGear.position.y = 0.2;
  mainGear.rotation.x = Math.PI / 2;
  scene.add(mainGear);

  // Inner gear ring
  const innerGear = new Mesh(new TorusGeometry(0.3, 0.06, 10, 18), gm);
  innerGear.position.y = 0.22;
  innerGear.rotation.x = Math.PI / 2;
  scene.add(innerGear);

  // Gear teeth (small cylinders on main gear)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tooth = new Mesh(new CylinderGeometry(0.03, 0.03, 0.12, 6), gm);
    tooth.position.set(Math.cos(a) * 0.55, 0.2, Math.sin(a) * 0.55);
    scene.add(tooth);
  }

  // Submerged pipes
  const pipes = [
    makePipe(-1.5, -0.3, -0.5, 0.0, 0.05, gm),
    makePipe(0.5, 0.2, 1.8, -0.4, 0.04, gm),
    makePipe(-0.8, 0.8, 0.3, 1.2, 0.06, gm),
  ];
  pipes.forEach(p => { p.position.y = 0.05; scene.add(p); });

  // Vertical pump cylinders
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const pump = new Mesh(new CylinderGeometry(0.06, 0.08, 0.4, 8), gm);
    pump.position.set(Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7);
    scene.add(pump);
  }

  // Light
  const light = new PointLight(0x30e8d0, 2.5, 5, 1.5);
  light.position.set(0, 0.4, 0);
  scene.add(light);

  // Bubbles
  const bubbles = makeBubbles();
  scene.add(bubbles);

  // Animation
  const startTime = performance.now();
  let rafId = 0;
  const animate = (): void => {
    const t = (performance.now() - startTime) / 1000;
    uTime.value = t;
    mainGear.rotation.z = t * args.gearSpeed;
    innerGear.rotation.z = -t * args.gearSpeed * 1.3;
    light.intensity = 2.0 + Math.sin(t * 1.5) * 0.8;
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    () => {
      wm.dispose(); water.geometry.dispose();
      gm.dispose();
      mainGear.geometry.dispose();
      innerGear.geometry.dispose();
      (bubbles.geometry as BufferGeometry).dispose();
      (bubbles.material as ShaderMaterial).dispose();
      pipes.forEach(p => p.geometry.dispose());
    },
  ]);
};

/* ── Storybook meta ────────────────────────────────────────── */

const meta: Meta<Args> = {
  title: "Natural Wonders/Deepwater Engine",
  parameters: {
    docs: {
      description: {
        component:
          "The Deepwater Engine — a half-submerged industrial facility with gear-driven pumps, " +
          "copper pipes, and rising bubbles. Passive effect: dock gold income doubled; attacks from dock tiles gain +15% attack stat.",
      },
    },
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 10, step: 0.5 } },
    waterOpacity: { control: { type: "range", min: 0.3, max: 1.0, step: 0.05 } },
    gearSpeed: { control: { type: "range", min: 0.2, max: 3.0, step: 0.1 } },
  },
  args: {
    cameraDistance: 4,
    waterOpacity: 0.88,
    gearSpeed: 0.8,
  },
  render,
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const CloseUp: Story = {
  args: { cameraDistance: 2.5, waterOpacity: 0.85, gearSpeed: 1.2 },
};
export const WideView: Story = {
  args: { cameraDistance: 7, waterOpacity: 0.88, gearSpeed: 0.6 },
};
export const FastGears: Story = {
  args: { cameraDistance: 3.5, waterOpacity: 0.88, gearSpeed: 2.5 },
  parameters: {
    docs: {
      description: { story: "Gears spinning fast — shows the engine at full power." },
    },
  },
};
export const CalmWater: Story = {
  args: { cameraDistance: 4, waterOpacity: 0.95, gearSpeed: 0.4 },
};
