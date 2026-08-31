import { ACESFilmicToneMapping, CanvasTexture, DirectionalLight, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { createAetherTowerOverlay } from "@client/client-map-3d-aether-tower-overlay.js";
import { computeLinks } from "@client/client-map-3d-aether-tower-network.js";
import { createGrassGround, createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  spacing: number;
  count: number;
};

// A soft radial-contact-shadow disc placed flat — a lone tower on a neutral
// backdrop needs the same anchoring a beacon gets, so the plinth and glyph
// sit on the surface rather than floating.
const createContactShadow = (radius: number): { mesh: Mesh; dispose: () => void } => {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(8, 10, 14, 0.5)");
  gradient.addColorStop(0.55, "rgba(8, 10, 14, 0.28)");
  gradient.addColorStop(1, "rgba(8, 10, 14, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = "srgb";
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.004;
  mesh.scale.set(radius * 2, radius * 2, 1);
  const dispose = (): void => { geometry.dispose(); material.dispose(); texture.dispose(); };
  return { mesh, dispose };
};

// Gameplay-context lighting (perspective, on grass): a warm key plus cool rim
// so the brass shaft, iron plinth and glowing aether core catch the light
// without flattening against the grass tiles.
const glintStage = (opts: { cameraDistance: number; cameraTilt?: number }): Stage => {
  const stage = createStage({ cameraDistance: opts.cameraDistance, cameraTilt: opts.cameraTilt ?? 0.5, background: "#1b1d22" });
  stage.renderer.toneMapping = ACESFilmicToneMapping;
  stage.renderer.toneMappingExposure = 1.25;
  const rim = new DirectionalLight(0xdfe8ff, 1.6);
  rim.position.set(-6, 8, -10);
  stage.scene.add(rim);
  const back = new DirectionalLight(0xffffff, 0.8);
  back.position.set(0, 6, 12);
  stage.scene.add(back);
  return stage;
};

// Asset-studio lighting for the orthographic hero shots: a warm near-camera
// key that catches the brass shaft and cog stack facing the viewer, a cool
// back rim for the far silhouette, and a soft fill for the dark iron parts.
const studioStage = (opts: { cameraDistance: number; orthoHalfHeight: number; background: string }): Stage => {
  const stage = createStage({
    camera: "orthographic",
    cameraDistance: opts.cameraDistance,
    cameraTilt: 0.62,
    background: opts.background,
    orthoHalfHeight: opts.orthoHalfHeight
  });
  stage.renderer.toneMapping = ACESFilmicToneMapping;
  stage.renderer.toneMappingExposure = 1.3;
  const key = new DirectionalLight(0xfff1dd, 2.2);
  key.position.set(3, 9, 7);
  stage.scene.add(key);
  const rim = new DirectionalLight(0xc2e1ff, 1.4);
  rim.position.set(-7, 6, -9);
  stage.scene.add(rim);
  const fill = new DirectionalLight(0xdbe6f2, 0.7);
  fill.position.set(8, 3, 9);
  stage.scene.add(fill);
  return stage;
};

// The tower's signature animation is perpetual: floating rings precess around
// the core, motes spiral up the shaft, and sync rings/links pulse whenever
// the tower joins the network. Advance it every frame while the story lives.
const startTowerAnims = (overlay: { update: (nowMs: number) => void }): (() => void) => {
  let rafId = 0;
  const animate = (): void => {
    overlay.update(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();
  return () => cancelAnimationFrame(rafId);
};

// A count x count grid of towers on grass — the default story, showing how
// adjacent towers weave conduit links and lock interior members into aether
// clusters at normal playing distance.
const render = (args: Args, groundRadius: number): HTMLElement => {
  const stage = glintStage({ cameraDistance: args.cameraDistance });
  const ground = createGrassGround(groundRadius, 0);
  stage.scene.add(ground.group);
  const overlay = createAetherTowerOverlay(stage.scene, args.count * args.count);
  const offset = (args.count - 1) / 2;
  for (let gx = 0; gx < args.count; gx += 1) {
    for (let gz = 0; gz < args.count; gz += 1) {
      overlay.addInstance((gx - offset) * args.spacing, (gz - offset) * args.spacing, 0, gx, gz);
    }
  }
  overlay.commit();
  const cancel = startTowerAnims(overlay);
  return wrapWithCleanup(stage, [cancel, overlay.dispose, ground.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/AetherTower",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 20, step: 0.5 } },
    spacing: { control: { type: "range", min: 1.4, max: 4.2, step: 0.1 } },
    count: { control: { type: "range", min: 1, max: 8, step: 1 } }
  },
  args: { cameraDistance: 14, spacing: 2.0, count: 3 },
  render: (args) => render(args, 7)
};

export default meta;
type Story = StoryObj<Args>;

// The hero asset shot: a single untouched tower on a light neutral studio
// backdrop — amber core, brass shaft, floating rings and spiralling motes
// all standing alone, the way it appears in marketing/UI.
export const TowerHero: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, orthoHalfHeight: 1.7, background: "#a2a3a8" });
    const shadow = createContactShadow(0.8);
    stage.scene.add(shadow.mesh);
    const overlay = createAetherTowerOverlay(stage.scene, 1);
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    const cancel = startTowerAnims(overlay);
    return wrapWithCleanup(stage, [cancel, overlay.dispose, shadow.dispose]);
  }
};

// Same single-tower hero shot on a dark neutral backdrop — how the aether
// glow, amber lamps and emissive core read at night and in dark UI panels.
export const TowerHeroDark: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, orthoHalfHeight: 1.7, background: "#15161b" });
    const shadow = createContactShadow(0.8);
    stage.scene.add(shadow.mesh);
    const overlay = createAetherTowerOverlay(stage.scene, 1);
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    const cancel = startTowerAnims(overlay);
    return wrapWithCleanup(stage, [cancel, overlay.dispose, shadow.dispose]);
  }
};

// A single tower in normal gameplay context — perspective camera on grass —
// to confirm the silhouette, plinth and ground glyph hold up at playing
// distance rather than in the studio close-up.
export const OnGrass: Story = {
  render: () => {
    const stage = glintStage({ cameraDistance: 6 });
    const ground = createGrassGround(3, 0);
    stage.scene.add(ground.group);
    const overlay = createAetherTowerOverlay(stage.scene, 1);
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    const cancel = startTowerAnims(overlay);
    return wrapWithCleanup(stage, [cancel, overlay.dispose, ground.dispose]);
  }
};

// Three towers spaced within each other's link radius — the minimal network.
// Their conduits lock all three into a single aether cluster, hoisting the
// sync glyph, orb and spinning rings above the triangle centroid.
export const Linked: Story = {
  render: () => {
    const stage = glintStage({ cameraDistance: 8 });
    const ground = createGrassGround(3, 0);
    stage.scene.add(ground.group);
    const overlay = createAetherTowerOverlay(stage.scene, 3);
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.addInstance(2.0, 0.35, 0, 1, 0);
    overlay.addInstance(1.0, 1.9, 0, 2, 0);
    overlay.commit();
    const cancel = startTowerAnims(overlay);
    return wrapWithCleanup(stage, [cancel, overlay.dispose, ground.dispose]);
  }
};

// A hub-and-spoke nexus: one tower within link radius of four satellites that
// stay just outside each other's radius. The center reaches full nexus state
// (maxed sync rings, halo and glyph) while each spoke stays a bridge.
export const Nexus: Story = {
  render: () => {
    const stage = glintStage({ cameraDistance: 9 });
    const ground = createGrassGround(4, 0);
    stage.scene.add(ground.group);
    const overlay = createAetherTowerOverlay(stage.scene, 5);
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.addInstance(2.0, 2.0, 0, 1, 0);
    overlay.addInstance(2.0, -2.0, 0, 1, 1);
    overlay.addInstance(-2.0, 2.0, 0, 1, 2);
    overlay.addInstance(-2.0, -2.0, 0, 1, 3);
    overlay.commit();
    const cancel = startTowerAnims(overlay);
    return wrapWithCleanup(stage, [cancel, overlay.dispose, ground.dispose]);
  }
};

// A 4x4 tall-aether field — every tower links its row and column neighbours,
// and the interior members cluster into aether blocs with shared sync rings,
// while edge towers just span the strands.
export const Web: Story = {
  render: () => render({ cameraDistance: 15, spacing: 2.0, count: 4 }, 8)
};

// A 5x5 field of 25 towers with a live GPU-readout HUD: draw calls, rendered
// triangles and fps sampled every half second. Draw calls stay flat (37
// InstancedMesh slots, no per-tower meshes) and only the animated band
// buffers are re-uploaded each frame, bounding the frame cost.
export const PerformanceHUD: Story = {
  render: () => {
    const N = 5;
    const spacing = 2.0;
    const stage = glintStage({ cameraDistance: 22 });
    const overlay = createAetherTowerOverlay(stage.scene, N * N);
    const off = (N - 1) / 2;
    const pts: Array<{ x: number; z: number }> = [];
    for (let gx = 0; gx < N; gx += 1) {
      for (let gz = 0; gz < N; gz += 1) {
        overlay.addInstance((gx - off) * spacing, (gz - off) * spacing, 0, gx, gz);
        pts.push({ x: (gx - off) * spacing, z: (gz - off) * spacing });
      }
    }
    overlay.commit();
    const links = computeLinks(pts).length;
    const cancelAnims = startTowerAnims(overlay);

    const hud = document.createElement("div");
    hud.style.position = "fixed";
    hud.style.top = "12px";
    hud.style.left = "12px";
    hud.style.zIndex = "10";
    hud.style.background = "rgba(10, 14, 20, 0.8)";
    hud.style.color = "#f2c36b";
    hud.style.fontFamily = "ui-monospace, monospace";
    hud.style.fontSize = "12px";
    hud.style.lineHeight = "1.5";
    hud.style.padding = "8px 12px";
    hud.style.borderRadius = "6px";
    hud.style.pointerEvents = "none";
    hud.style.whiteSpace = "pre";
    hud.textContent = "measuring…";
    document.body.appendChild(hud);

    let frames = 0;
    let last = performance.now();
    let fps = 0;
    let hudRafId = 0;
    const sample = (): void => {
      frames += 1;
      const now = performance.now();
      const elapsed = now - last;
      if (elapsed >= 500) {
        fps = Math.round((frames * 1000) / elapsed);
        frames = 0;
        last = now;
        const info = stage.renderer.info;
        hud.textContent =
          `towers ${N * N}  links ${links}\n` +
          `draw calls ${info.render.calls}\n` +
          `triangles ${info.render.triangles}\n` +
          `fps ${fps}`;
      }
      hudRafId = requestAnimationFrame(sample);
    };
    hudRafId = requestAnimationFrame(sample);

    return wrapWithCleanup(stage, [
      cancelAnims,
      () => cancelAnimationFrame(hudRafId),
      () => hud.remove(),
      overlay.dispose
    ]);
  }
};