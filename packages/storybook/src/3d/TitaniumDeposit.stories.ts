import { ACESFilmicToneMapping, CanvasTexture, DirectionalLight, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { createResourceOverlay, type ResourceKind } from "@client/client-map-3d-resource-overlay.js";
import { createTitaniumDepositOverlay, titaniumDepositVariantAt, type TitaniumDepositVariant } from "@client/client-map-3d-titanium-deposit.js";
import { createGrassGround, createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  spacing: number;
  count: number;
};

// The titanium deposit overlay picks a 0/1/2 variant from the
// (worldTileX, worldTileY) hash internally (same approach as the resource
// overlay). To force a specific variant in a story, search for a
// worldTileX (with worldTileY = 0) that hashes to the target variant —
// the hash is the exported function, so this always matches the module.
const worldXForVariant = (variant: TitaniumDepositVariant): number => {
  for (let wx = 0; wx < 200; wx += 1) {
    if (titaniumDepositVariantAt(wx, 0) === variant) return wx;
  }
  return 0;
};

// A soft radial-contact-shadow disc placed flat on the ground plane so an
// isolated deposit on a neutral backdrop still looks grounded instead of
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
// plus back light so the low-poly polished facets catch hard specular
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
// key that catches glints on the facets facing the viewer, a cool back rim
// for the far silhouette, and a soft fill so the shadow side never clips.
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

const variantsOf = (stage: Stage, overlay: ReturnType<typeof createTitaniumDepositOverlay>, spacing: number): void => {
  ([0, 1, 2] as const).forEach((v, idx) => {
    const x = (idx - 1) * spacing;
    overlay.addInstance(x, 0, 0, worldXForVariant(v), 0);
  });
  overlay.commit();
};

const render = (args: Args, groundRadius: number): HTMLElement => {
  const stage = glintStage({ cameraDistance: args.cameraDistance });
  const ground = createGrassGround(groundRadius, 0);
  stage.scene.add(ground.group);
  const overlay = createTitaniumDepositOverlay(stage.scene, Math.max(args.count, 1));
  const offset = (args.count - 1) / 2;
  for (let i = 0; i < args.count; i += 1) {
    overlay.addInstance((i - offset) * args.spacing, 0, 0, i, 0);
  }
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose, ground.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/TitaniumDeposit",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 16, step: 0.5 } },
    spacing: { control: { type: "range", min: 0.8, max: 2.5, step: 0.1 } },
    count: { control: { type: "range", min: 1, max: 7, step: 1 } }
  },
  args: { cameraDistance: 8, spacing: 1.2, count: 3 },
  render: (args) => render(args, 4)
};

export default meta;
type Story = StoryObj<Args>;

// The hero asset shot: a single deposit, isolated on a neutral studio
// backdrop, rendered with an orthographic three-quarter camera (no
// perspective foreshortening) and a soft contact shadow — the way the
// asset will be presented in marketing/UI. Dark gunmetal bedrock against
// bright polished titanium ore breaking through it.
export const Deposit: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 5, cameraTilt: 0.6, orthoHalfHeight: 1.15, background: "#9aa0a8" });
    const shadow = createContactShadow(0.8);
    stage.scene.add(shadow.mesh);
    const overlay = createTitaniumDepositOverlay(stage.scene, 1);
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    return wrapWithCleanup(stage, [overlay.dispose, shadow.dispose]);
  }
};

// The three layout variants shown together in the same studio style, so
// the differing silhouettes (central peak, rising cluster, wide vein
// field) can be compared directly.
export const Variants: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, cameraTilt: 0.62, orthoHalfHeight: 1.7, background: "#9aa0a8" });
    const overlay = createTitaniumDepositOverlay(stage.scene, 3);
    const shadows = ([0, 1, 2] as const).map((v) => {
      const shadow = createContactShadow(0.7);
      stage.scene.add(shadow.mesh);
      return { v, shadow };
    });
    variantsOf(stage, overlay, 1.5);
    return wrapWithCleanup(stage, [overlay.dispose, ...shadows.map((s) => s.shadow.dispose)]);
  }
};

// A small resource field — how a cluster of deposit tiles reads from the
// normal game camera.
export const Field: Story = {
  args: { cameraDistance: 9, spacing: 1.1, count: 7 },
  render: (args) => render(args, 6)
};

// Side-by-side: the legacy iron ore piles (current 3D look) next to the
// new titanium deposit, so the two silhouettes can be compared directly.
export const IronVsTitanium: Story = {
  render: () => {
    const stage = glintStage({ cameraDistance: 6.5 });
    const ground = createGrassGround(2, 0);
    stage.scene.add(ground.group);
    const resources = createResourceOverlay(stage.scene, 3);
    const titanium = createTitaniumDepositOverlay(stage.scene, 3);
    ([0, 1, 2] as const).forEach((v, idx) => {
      const x = (idx - 1) * 1.3;
      resources.addInstance(x - 1.0, 0, 0, "IRON" as ResourceKind, 0, 0);
      titanium.addInstance(x + 1.0, 0, 0, worldXForVariant(v), 0);
    });
    resources.commit();
    titanium.commit();
    return wrapWithCleanup(stage, [resources.dispose, titanium.dispose, ground.dispose]);
  }
};
