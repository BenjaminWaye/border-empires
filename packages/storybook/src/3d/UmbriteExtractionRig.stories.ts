import { ACESFilmicToneMapping, CanvasTexture, DirectionalLight, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { createTitaniumDepositOverlay } from "@client/client-map-3d-titanium-deposit.js";
import { createUmbriteExtractionRigOverlay } from "@client/client-map-3d-umbrite-extraction-rig.js";
import { createGrassGround, createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  spacing: number;
  count: number;
};

// A soft radial-contact-shadow disc placed flat on the ground plane so an
// isolated rig on a neutral backdrop still looks firmly anchored instead of
// floating. Unlit, transparent, renders just above the tile surface.
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

// Gameplay-context lighting (perspective, on grass): a bright cool rim
// plus back light so the chunky hard-surface facets catch hard specular
// glints instead of flattening out.
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
// key that catches the dark iron and brass facets facing the viewer, a cool
// back rim for the far silhouette, and a soft fill so the near-black steel
// never clips to pure black.
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

const render = (args: Args, groundRadius: number): HTMLElement => {
  const stage = glintStage({ cameraDistance: args.cameraDistance });
  const ground = createGrassGround(groundRadius, 0);
  stage.scene.add(ground.group);
  const overlay = createUmbriteExtractionRigOverlay(stage.scene, Math.max(args.count, 1));
  const offset = (args.count - 1) / 2;
  for (let i = 0; i < args.count; i += 1) {
    overlay.addInstance((i - offset) * args.spacing, 0, 0, i, 0);
  }
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose, ground.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/UmbriteExtractionRig",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 16, step: 0.5 } },
    spacing: { control: { type: "range", min: 0.8, max: 2.5, step: 0.1 } },
    count: { control: { type: "range", min: 1, max: 7, step: 1 } }
  },
  args: { cameraDistance: 8, spacing: 1.4, count: 3 },
  render: (args) => render(args, 4)
};

export default meta;
type Story = StoryObj<Args>;

// The hero asset shot: a single rig, isolated on a light neutral studio
// backdrop so the dark gunmetal, weathered brass and contained orange
// energy punch out, rendered with an orthographic three-quarter camera
// (no perspective foreshortening) and a soft contact shadow — the way the
// asset will be presented in marketing/UI.
export const RigHero: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 5, cameraTilt: 0.6, orthoHalfHeight: 1.0, background: "#a2a3a8" });
    const shadow = createContactShadow(0.85);
    stage.scene.add(shadow.mesh);
    const overlay = createUmbriteExtractionRigOverlay(stage.scene, 1);
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    return wrapWithCleanup(stage, [overlay.dispose, shadow.dispose]);
  }
};

// Same single-rig hero shot on a dark neutral backdrop — how the machine
// reads on the game's night/dark terrain and in dark UI panels.
export const RigHeroDark: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 5, cameraTilt: 0.6, orthoHalfHeight: 1.0, background: "#15161b" });
    const shadow = createContactShadow(0.85);
    stage.scene.add(shadow.mesh);
    const overlay = createUmbriteExtractionRigOverlay(stage.scene, 1);
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    return wrapWithCleanup(stage, [overlay.dispose, shadow.dispose]);
  }
};

// A single rig in normal gameplay context — perspective camera, grass
// ground — to check how the drill, pipes and tank hold up at playing
// distance rather than studio close-up.
export const OnGrass: Story = {
  render: () => render({ cameraDistance: 5, spacing: 1.4, count: 1 }, 3)
};

// A small extraction field — how a cluster of rig tiles reads from the
// normal game camera.
export const Field: Story = {
  args: { cameraDistance: 9, spacing: 1.4, count: 3 },
  render: (args) => render(args, 6)
};

// Side-by-side: the dark industrial rig next to a silver-grey titanium
// deposit, so the machine's silhouette can be compared against an existing
// resource asset at the same scale.
export const RigVsTitanium: Story = {
  render: () => {
    const stage = glintStage({ cameraDistance: 6.5 });
    const ground = createGrassGround(2, 0);
    stage.scene.add(ground.group);
    const rig = createUmbriteExtractionRigOverlay(stage.scene, 3);
    const titanium = createTitaniumDepositOverlay(stage.scene, 3);
    for (let i = 0; i < 3; i += 1) {
      const x = (i - 1) * 1.4;
      rig.addInstance(x - 1.0, 0, 0, i, 0);
      titanium.addInstance(x + 1.0, 0, 0, i, 0);
    }
    rig.commit();
    titanium.commit();
    return wrapWithCleanup(stage, [rig.dispose, titanium.dispose, ground.dispose]);
  }
};
