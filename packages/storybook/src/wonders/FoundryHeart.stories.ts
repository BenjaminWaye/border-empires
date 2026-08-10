import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Mesh,
  PlaneGeometry,
  PointLight,
  Points,
  ShaderMaterial,
} from "three";
import { createGrassGround, createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  shellOpacity: number;
  fissureCount: number;
};

const uTime = { value: 0 };
const uCyan = { value: new Color(0x40d8ff) };

/* ── Ground shader — the wonder's own tile only; grass fills the rest ── */

const groundMat = (fissureCount: number): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      uTime,
      uFissureCount: { value: fissureCount },
      uCyan,
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
      uniform float uFissureCount;
      uniform vec3 uCyan;
      varying vec3 vWorldPos;

      float fissure(vec2 p, float angle, float w) {
        float c = cos(angle), s = sin(angle);
        float along = dot(p, vec2(c,s));
        float across = dot(p, vec2(-s,c));
        float wid = w * (0.3 + 0.7 * smoothstep(0.0, 3.0, abs(along)));
        return smoothstep(wid, 0.0, abs(across)) * smoothstep(0.2, 0.6, abs(along));
      }
      void main() {
        vec2 p = vWorldPos.xz;
        float dist = length(p);
        float fg = 0.0;
        for (float i = 0.0; i < 12.0; i++) {
          if (i >= uFissureCount) break;
          float a = i * 6.28318 / uFissureCount + 0.3;
          fg += fissure(p, a + sin(a*3.0+dist*2.0)*0.15, 0.04+0.02*sin(i*2.1));
        }
        fg = clamp(fg, 0.0, 1.0);
        float pulse = sin(uTime*1.2)*0.15+0.85;
        float cg = exp(-dist*1.8)*0.7;
        float glow = exp(-dist*2.5)*0.2*pulse;
        float alpha = clamp(fg*0.9*pulse + cg*0.5 + glow, 0.0, 1.0);
        gl_FragColor = vec4(uCyan*1.6*pulse, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
  });

/* ── Shell shader ──────────────────────────────────────────── */

const shellMat = (opacity: number): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uOpacity: { value: opacity }, uCyan, uDeep: { value: new Color(0x1a4060) } },
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
      uniform float uTime, uOpacity;
      uniform vec3 uCyan, uDeep;
      varying vec3 vNormal, vViewPos, vWorldPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0 - max(dot(vNormal,vd),0.0), 3.0);
        float p = sin(uTime*1.2)*0.15+0.85;
        vec3 c = uDeep + uCyan*2.0*f*p;
        c *= 0.5 + 0.5*smoothstep(-0.3, 0.4, vWorldPos.y);
        gl_FragColor = vec4(c, uOpacity);
      }
    `,
    transparent: true,
    side: DoubleSide,
    depthWrite: false,
  });

/* ── Core shader ───────────────────────────────────────────── */

const coreMat = (): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: { uTime, uCyan, uWhite: { value: new Color(0xffffff) } },
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
      uniform vec3 uCyan, uWhite;
      varying vec3 vNormal, vViewPos;
      void main() {
        vec3 vd = normalize(-vViewPos);
        float f = pow(1.0 - max(dot(vNormal,vd),0.0), 2.0);
        float p = sin(uTime*1.2)*0.2+0.8;
        gl_FragColor = vec4(mix(uWhite, uCyan, f) * (1.5+p*0.5), 1.0);
      }
    `,
  });

/* ── Shard particles ───────────────────────────────────────── */

function makeShards(): Points {
  const count = 24;
  const pos = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = 0.5 + Math.random() * 0.6;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.3 + Math.random() * 0.7;
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
        p.y += sin(uTime*0.8+phase)*0.08;
        float a = uTime*0.15+phase;
        p.x += sin(a)*0.04; p.z += cos(a)*0.04;
        vAlpha = 0.4+0.3*sin(uTime*1.5+phase);
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
        gl_FragColor = vec4(uColor, smoothstep(0.5,0.1,d)*vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  return new Points(geo, mat);
}

/* ── Build deformed shell geometry ─────────────────────────── */

function makeShellGeo(): IcosahedronGeometry {
  const geo = new IcosahedronGeometry(0.7, 1);
  const p = geo.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z);
    const irr = 1.0 + 0.15 * Math.sin(x * 5 + z * 3) + 0.1 * Math.cos(y * 7 + x * 2);
    p.setXYZ(i, (x / len) * 0.7 * irr, (y / len) * 0.7 * irr, (z / len) * 0.7 * irr);
  }
  geo.computeVertexNormals();
  return geo;
}

/* ── Story render function ─────────────────────────────────── */

const render = (args: Args): HTMLElement => {
  const stage = createStage({
    cameraDistance: args.cameraDistance,
    background: "#080b10",
  });

  // Ground: grass everywhere (no hole — the wonder's effect plane is
  // transparent, so it overlays the grass instead of replacing it), with
  // the wonder's own fissure effect layered on top, spanning its tile + 8
  // neighbors (3x3).
  const grass = createGrassGround(6);
  stage.scene.add(grass.group);
  const gMat = groundMat(args.fissureCount);
  const ground = new Mesh(new PlaneGeometry(3, 3, 48, 48), gMat);
  ground.geometry.rotateX(-Math.PI / 2);
  ground.position.y = -0.005;
  stage.scene.add(ground);

  // Shell
  const sMat = shellMat(args.shellOpacity);
  const shell = new Mesh(makeShellGeo(), sMat);
  shell.position.y = 0.55;
  stage.scene.add(shell);

  // Core
  const cMat = coreMat();
  const core = new Mesh(new IcosahedronGeometry(0.28, 2), cMat);
  core.position.y = 0.55;
  stage.scene.add(core);

  // Light
  const light = new PointLight(0x50d0ff, 2.5, 5, 1.5);
  light.position.set(0, 0.6, 0);
  stage.scene.add(light);

  // Shards
  const shards = makeShards();
  stage.scene.add(shards);

  // Animation loop — update uniforms, let stage handle render
  const startTime = performance.now();
  let rafId = 0;
  const animate = (): void => {
    const t = (performance.now() - startTime) / 1000;
    uTime.value = t;
    core.rotation.y = t * 0.3;
    core.rotation.x = Math.sin(t * 0.2) * 0.1;
    shell.rotation.y = -t * 0.08;
    light.intensity = 2.0 + Math.sin(t * 1.2) * 0.8;
    rafId = requestAnimationFrame(animate);
  };
  animate();

  return wrapWithCleanup(stage, [
    () => cancelAnimationFrame(rafId),
    grass.dispose,
    () => {
      gMat.dispose(); ground.geometry.dispose();
      sMat.dispose(); (shell.geometry as IcosahedronGeometry).dispose();
      cMat.dispose(); (core.geometry as IcosahedronGeometry).dispose();
      (shards.geometry as BufferGeometry).dispose();
      (shards.material as ShaderMaterial).dispose();
    },
  ]);
};

/* ── Storybook meta ────────────────────────────────────────── */

const meta: Meta<Args> = {
  title: "Natural Wonders/Foundry Heart",
  parameters: {
    docs: {
      description: {
        component:
          "The Foundry Heart — a pulsing crystal geode with glowing aether core, cracked " +
          "fissure ground spanning its tile and 8 neighbors, and floating particle shards, " +
          "surrounded by ordinary grass. Passive effect: owner gains +1 slot of each " +
          "resource type (FOOD, TITANIUM, CRYSTAL, UMBRITE).",
      },
    },
  },
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 10, step: 0.5 } },
    shellOpacity: { control: { type: "range", min: 0.3, max: 1.0, step: 0.05 } },
    fissureCount: { control: { type: "range", min: 2, max: 12, step: 1 } },
  },
  args: {
    cameraDistance: 4,
    shellOpacity: 0.92,
    fissureCount: 6,
  },
  render,
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const CloseUp: Story = {
  args: { cameraDistance: 2.5, shellOpacity: 0.85, fissureCount: 6 },
};
export const WideView: Story = {
  args: { cameraDistance: 8, shellOpacity: 0.92, fissureCount: 8 },
};
export const GhostShell: Story = {
  args: { cameraDistance: 3.5, shellOpacity: 0.45, fissureCount: 6 },
  parameters: {
    docs: {
      description: { story: "Shell at low opacity — shows core and ground glow more prominently." },
    },
  },
};
export const ManyFissures: Story = {
  args: { cameraDistance: 4, shellOpacity: 0.92, fissureCount: 10 },
};
