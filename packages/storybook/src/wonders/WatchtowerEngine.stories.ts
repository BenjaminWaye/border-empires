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
import { createGrassGround, createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  beamWidth: number;
  telescopeHeight: number;
};

const uTime = { value: 0 };
const uCyan = { value: new Color(0x40d8ff) };

/* ── Stone foundation shader ──────────────────────────────── */

const groundMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uCyan },
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

/* ── Brass telescope shader ───────────────────────────────── */

const brassMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uBrass: { value: new Color(0xc89830) },
      uHighlight: { value: new Color(0xf0d060) },
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

/* ── Aether beam shader ───────────────────────────────────── */

const beamMat = (width: number): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uCyan,
      uWidth: { value: width },
    },
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

/* ── Star particles ───────────────────────────────────────── */

function makeStars(): Points {
  const count = 50;
  const pos = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
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
  const mat = new ShaderMaterial({
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
  return new Points(geo, mat);
}

/* ── Story render function ─────────────────────────────────── */

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#040610" });
  const scene = stage.scene;

  // Ground: grass field with the wonder's beam-sweep ground glow layered
  // on top, spanning its tile + 8 neighbors (3x3).
  const grass = createGrassGround(6);
  scene.add(grass.group);
  const gm = groundMat();
  const ground = new Mesh(new PlaneGeometry(3, 3, 32, 32), gm);
  ground.geometry.rotateX(-Math.PI / 2);
  ground.position.y = -0.005;
  scene.add(ground);

  const bm = brassMat();
  const th = args.telescopeHeight;

  // Stone base platform
  const base = new Mesh(new CylinderGeometry(0.3, 0.4, 0.1, 16), bm);
  base.position.y = 0.05;
  scene.add(base);

  // Telescope tube (main cylinder, tilted)
  const tube = new Mesh(new CylinderGeometry(0.08, 0.12, th, 12), bm);
  tube.position.set(0, th / 2 + 0.1, 0);
  tube.rotation.z = 0.3; // tilted
  scene.add(tube);

  // Lens dish at top
  const dish = new Mesh(new CylinderGeometry(0.18, 0.08, 0.08, 16), bm);
  dish.position.set(Math.sin(0.3) * th * 0.5, th + 0.1 + Math.cos(0.3) * th * 0.3, 0);
  dish.rotation.z = 0.3;
  scene.add(dish);

  // Gear ring at pivot
  const gear = new Mesh(new TorusGeometry(0.14, 0.025, 8, 16), bm);
  gear.position.set(0, 0.3, 0);
  gear.rotation.x = Math.PI / 2;
  scene.add(gear);

  // Aether beam (flat plane extending from dish)
  const bm2 = beamMat(args.beamWidth);
  const beam = new Mesh(new PlaneGeometry(0.3, 3.0, 1, 32), bm2);
  beam.position.set(Math.sin(0.3) * 1.2, th + 0.5, 0);
  beam.rotation.z = 0.3 + Math.PI / 2;
  scene.add(beam);

  // Light
  const light = new PointLight(0x40d8ff, 2.5, 6, 1.5);
  light.position.set(Math.sin(0.3) * 1.5, th + 0.6, 0);
  scene.add(light);

  // Star particles
  const stars = makeStars();
  scene.add(stars);

  // Animation
  const startTime = performance.now();
  let rafId = 0;
  const animate = (): void => {
    const t = (performance.now() - startTime) / 1000;
    uTime.value = t;
    gear.rotation.z = t * 0.5;
    // Slowly rotate the whole telescope
    tube.parent && (tube.rotation.y = Math.sin(t * 0.15) * 0.3);
    dish.rotation.y = Math.sin(t * 0.15) * 0.3;
    light.intensity = 2.0 + Math.sin(t * 1.5) * 0.8;
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    grass.dispose,
    () => {
      gm.dispose(); ground.geometry.dispose();
      bm.dispose(); bm2.dispose();
      base.geometry.dispose(); tube.geometry.dispose();
      dish.geometry.dispose(); gear.geometry.dispose();
      beam.geometry.dispose();
      (stars.geometry as BufferGeometry).dispose();
      (stars.material as ShaderMaterial).dispose();
    },
  ]);
};

/* ── Storybook meta ────────────────────────────────────────── */

const meta: Meta<Args> = {
  title: "Natural Wonders/Watchtower Engine",
  parameters: {
    docs: {
      description: {
        component:
          "The Watchtower Engine — a tall brass telescope with a sweeping aether beam, rotating gear mechanism, " +
          "and star-like particles. Passive effect: the wonder itself acts as a free Observatory — cast crystal abilities at the standard range and cooldown, no CRYSTAL upkeep.",
      },
    },
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 12, step: 0.5 } },
    beamWidth: { control: { type: "range", min: 0.05, max: 0.4, step: 0.02 } },
    telescopeHeight: { control: { type: "range", min: 0.4, max: 1.5, step: 0.1 } },
  },
  args: {
    cameraDistance: 5,
    beamWidth: 0.15,
    telescopeHeight: 0.8,
  },
  render,
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const CloseUp: Story = {
  args: { cameraDistance: 3, beamWidth: 0.15, telescopeHeight: 0.8 },
};
export const WideView: Story = {
  args: { cameraDistance: 8, beamWidth: 0.12, telescopeHeight: 0.8 },
};
export const WideBeam: Story = {
  args: { cameraDistance: 5, beamWidth: 0.35, telescopeHeight: 1.0 },
  parameters: {
    docs: {
      description: { story: "Broad aether beam sweeping the horizon — maximum observatory range." },
    },
  },
};
export const TallScope: Story = {
  args: { cameraDistance: 6, beamWidth: 0.15, telescopeHeight: 1.4 },
};
