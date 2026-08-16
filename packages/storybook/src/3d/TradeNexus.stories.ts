import { ACESFilmicToneMapping, CanvasTexture, DirectionalLight, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { createFortOverlay } from "@client/client-map-3d-fort-overlay.js";
import { createTradeNexusOverlay, type TradeNexusOverlay } from "@client/client-map-3d-trade-nexus-overlay.js";
import { createGrassGround, createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  spacing: number;
  count: number;
};

// A soft radial-contact-shadow disc placed flat — an isolated nexus on a
// neutral backdrop needs the same anchoring a beacon gets, so the wide
// converging roads read as sitting on the surface rather than floating.
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
// so the brass dome, dark iron machinery and amber windows catch specular
// light without flattening the muted stone facades.
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
// key that catches the brass dome and clockwork seal facing the viewer, a
// cool back rim for the far silhouette, and a soft fill so the dark iron
// structures never clip to pure black.
const studioStage = (opts: { cameraDistance: number; cameraTilt?: number; orthoHalfHeight?: number; background: string }): Stage => {
  const stage = createStage({
    camera: "orthographic",
    cameraDistance: opts.cameraDistance,
    cameraTilt: opts.cameraTilt ?? 0.6,
    background: opts.background,
    ...(opts.orthoHalfHeight !== undefined ? { orthoHalfHeight: opts.orthoHalfHeight } : {})
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

// Keep the dome-top clockwork seal winding in every story — the rotating
// spoke-and-gear financial apparatus is the nexus's signature animation.
const startSealSpin = (overlay: TradeNexusOverlay): (() => void) => {
  let rafId = 0;
  const animate = (): void => {
    overlay.update(performance.now());
    rafId = requestAnimationFrame(animate);
  };
  animate();
  return () => cancelAnimationFrame(rafId);
};

const render = (args: Args, groundRadius: number): HTMLElement => {
  const stage = glintStage({ cameraDistance: args.cameraDistance });
  const ground = createGrassGround(groundRadius, 0);
  stage.scene.add(ground.group);
  const overlay = createTradeNexusOverlay(stage.scene, Math.max(args.count, 1));
  const offset = (args.count - 1) / 2;
  for (let i = 0; i < args.count; i += 1) {
    overlay.addInstance((i - offset) * args.spacing, 0, 0, i, 0);
  }
  overlay.commit();
  const cancel = startSealSpin(overlay);
  return wrapWithCleanup(stage, [cancel, overlay.dispose, ground.dispose]);
};

const renderHero = (background: string): HTMLElement => {
  const stage = studioStage({ cameraDistance: 6, cameraTilt: 0.6, orthoHalfHeight: 2.0, background });
  const shadow = createContactShadow(0.9);
  stage.scene.add(shadow.mesh);
  const overlay = createTradeNexusOverlay(stage.scene, 1);
  overlay.addInstance(0, 0, 0, 0, 0);
  overlay.commit();
  const cancel = startSealSpin(overlay);
  return wrapWithCleanup(stage, [cancel, overlay.dispose, shadow.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/TradeNexus",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 20, step: 0.5 } },
    spacing: { control: { type: "range", min: 1.4, max: 4, step: 0.1 } },
    count: { control: { type: "range", min: 1, max: 5, step: 1 } }
  },
  args: { cameraDistance: 12, spacing: 2.2, count: 3 },
  render: (args) => render(args, 5)
};

export default meta;
type Story = StoryObj<Args>;

// The hero asset shot: a single nexus on a light neutral studio backdrop so
// the brass dome, converging roads, warehouses, cranes and cargo punch out,
// rendered with an orthographic three-quarter camera — the way the asset will
// be presented in marketing/UI.
export const NexusHero: Story = {
  render: () => renderHero("#a2a3a8")
};

// Same single-nexus hero shot on a dark neutral backdrop — how the warm
// windows, amber lamps and aether glow read at night and in dark UI panels.
export const NexusHeroDark: Story = {
  render: () => renderHero("#15161b")
};

// A single nexus in normal gameplay context — perspective camera, grass
// ground — to check how the trading hall, roads and freight yard hold up at
// playing distance rather than in the studio close-up.
export const OnGrass: Story = {
  render: () => render({ cameraDistance: 6, spacing: 2.2, count: 1 }, 3)
};

// A cluster of nexuses — this is what a connected trade network's hubs read
// like from the normal game camera, each with its own winding clockwork seal.
export const Field: Story = {
  args: { cameraDistance: 13, spacing: 2.2, count: 3 },
  render: (args) => render(args, 7)
};

// Side-by-side with the light-brown, squat Siege Outpost (watchtower +
// catapult), proving the brass trading hub reads as a prosperous commercial
// centre rather than a military fortification it must not be confused with.
export const NexusVsSiegeOutpost: Story = {
  render: () => {
    const stage = glintStage({ cameraDistance: 7 });
    const ground = createGrassGround(4, 0);
    stage.scene.add(ground.group);
    const nexus = createTradeNexusOverlay(stage.scene, 3);
    const outpost = createFortOverlay(stage.scene, 3);
    for (let i = 0; i < 3; i += 1) {
      const x = (i - 1) * 2.2;
      nexus.addInstance(x - 1.0, 0, 0, i, 0);
      outpost.addInstance(x + 1.0, 0, 0, "SIEGE_OUTPOST", "CLOSED");
    }
    nexus.commit();
    outpost.commit();
    const cancel = startSealSpin(nexus);
    return wrapWithCleanup(stage, [cancel, nexus.dispose, outpost.dispose, ground.dispose]);
  }
};

// A 5x5 field of 25 nexuses with a live GPU-readout HUD: draw calls, rendered
// triangles and fps sampled every half second. Draw calls stay flat (31
// InstancedMesh slots, no per-nexus meshes) and only the rotating clockwork
// seal buffers are re-uploaded each frame, bounding the frame cost.
export const PerformanceHUD: Story = {
  render: () => {
    const stage = glintStage({ cameraDistance: 22 });
    const overlay = createTradeNexusOverlay(stage.scene, 64);
    const N = 5;
    const off = (N - 1) / 2;
    for (let gx = 0; gx < N; gx += 1) {
      for (let gz = 0; gz < N; gz += 1) {
        overlay.addInstance((gx - off) * 2.2, 0, 0, gx, gz);
      }
    }
    overlay.commit();
    const cancelSpin = startSealSpin(overlay);

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
          `nexuses ${N * N}  pieces ${N * N * 69}\n` +
          `draw calls ${info.render.calls}\n` +
          `triangles ${info.render.triangles}\n` +
          `fps ${fps}`;
      }
      hudRafId = requestAnimationFrame(sample);
    };
    hudRafId = requestAnimationFrame(sample);

    return wrapWithCleanup(stage, [
      cancelSpin,
      () => cancelAnimationFrame(hudRafId),
      () => hud.remove(),
      overlay.dispose
    ]);
  }
};