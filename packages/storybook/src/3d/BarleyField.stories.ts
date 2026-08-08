import { ACESFilmicToneMapping, CanvasTexture, DirectionalLight, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { createBarleyFieldOverlay, barleyFieldVariantAt, type BarleyFieldVariant } from "@client/client-map-3d-barley-field.js";
import { createStructureOverlay, type StructureKind } from "@client/client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createGrassGround, createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  spacing: number;
  count: number;
};

// The barley field overlay picks a 0/1/2 variant from the
// (worldTileX, worldTileY) hash internally (same approach as the titanium
// deposit). To force a specific variant in a story, search for a
// worldTileX (with worldTileY = 0) that hashes to the target variant —
// the hash is the exported function, so this always matches the module.
const worldXForVariant = (variant: BarleyFieldVariant): number => {
  for (let wx = 0; wx < 200; wx += 1) {
    if (barleyFieldVariantAt(wx, 0) === variant) return wx;
  }
  return 0;
};

// A soft radial-contact-shadow disc placed flat on the ground plane so an
// isolated field on a neutral backdrop still looks grounded instead of
// floating. Unlit, transparent, renders just above the tile surface.
const createContactShadow = (radius: number): { mesh: Mesh; dispose: () => void } => {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(8, 10, 14, 0.45)");
  gradient.addColorStop(0.55, "rgba(8, 10, 14, 0.25)");
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

// Gameplay-context lighting (perspective, on grass): warm golden key so
// the straw stalks and seed heads catch light like a ripe field at low
// sun, with a cool back rim for silhouette separation.
const fieldStage = (opts: { cameraDistance: number; cameraTilt?: number }): Stage => {
  const stage = createStage({ cameraDistance: opts.cameraDistance, cameraTilt: opts.cameraTilt ?? 0.5, background: "#1b1d22" });
  stage.renderer.toneMapping = ACESFilmicToneMapping;
  stage.renderer.toneMappingExposure = 1.25;
  const sun = new DirectionalLight(0xffe0b0, 1.8);
  sun.position.set(-6, 9, -8);
  stage.scene.add(sun);
  const rim = new DirectionalLight(0xc2e1ff, 0.8);
  rim.position.set(0, 6, 12);
  stage.scene.add(rim);
  return stage;
};

// Asset-studio lighting for the orthographic hero shots: a warm near-camera
// key that catches the golden heads facing the viewer, a cool back rim for
// the far silhouette, and a soft fill so the shadow side never clips.
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

const variantsOf = (stage: Stage, overlay: ReturnType<typeof createBarleyFieldOverlay>, spacing: number): void => {
  ([0, 1, 2] as const).forEach((v, idx) => {
    const x = (idx - 1) * spacing;
    overlay.addInstance(x, 0, 0, worldXForVariant(v), 0);
  });
  overlay.commit();
};

const render = (args: Args, groundRadius: number): HTMLElement => {
  const stage = fieldStage({ cameraDistance: args.cameraDistance });
  const ground = createGrassGround(groundRadius, 0);
  stage.scene.add(ground.group);
  const overlay = createBarleyFieldOverlay(stage.scene, Math.max(args.count, 1));
  const offset = (args.count - 1) / 2;
  for (let i = 0; i < args.count; i += 1) {
    overlay.addInstance((i - offset) * args.spacing, 0, 0, i, 0);
  }
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose, ground.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/BarleyField",
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

// The hero asset shot: a single farm tile as a dense mature barley field,
// isolated on a neutral studio backdrop, rendered with an orthographic
// three-quarter camera (no perspective foreshortening) and a soft contact
// shadow — the way the asset will be presented in marketing/UI.
export const Field: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 5, cameraTilt: 0.6, orthoHalfHeight: 1.15, background: "#9aa0a8" });
    const shadow = createContactShadow(0.85);
    stage.scene.add(shadow.mesh);
    const overlay = createBarleyFieldOverlay(stage.scene, 1);
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    return wrapWithCleanup(stage, [overlay.dispose, shadow.dispose]);
  }
};

// The three density/tone variants shown together in the same studio
// style, so the differing crop layouts can be compared directly.
export const Variants: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, cameraTilt: 0.62, orthoHalfHeight: 1.7, background: "#9aa0a8" });
    const overlay = createBarleyFieldOverlay(stage.scene, 3);
    const shadows = ([0, 1, 2] as const).map(() => {
      const shadow = createContactShadow(0.7);
      stage.scene.add(shadow.mesh);
      return shadow;
    });
    variantsOf(stage, overlay, 1.5);
    return wrapWithCleanup(stage, [overlay.dispose, ...shadows.map((s) => s.dispose)]);
  }
};

// A small farm resource field — how a cluster of farm tiles reads from
// the normal game camera.
export const FarmCluster: Story = {
  args: { cameraDistance: 9, spacing: 1.1, count: 7 },
  render: (args) => render(args, 6)
};

// A farmstead built on top of the barley field — the in-game combination
// for an upgraded farm tile (barn + silo + fence on the standing crop).
export const FarmsteadOnField: Story = {
  render: () => {
    const stage = fieldStage({ cameraDistance: 5 });
    const ground = createGrassGround(2, 0);
    stage.scene.add(ground.group);
    const barley = createBarleyFieldOverlay(stage.scene, 1);
    barley.addInstance(0, 0, 0, 0, 0);
    barley.commit();
    const structures = createStructureOverlay(stage.scene, 1);
    structures.addInstance(0, 0, 0, "FARMSTEAD" as StructureKind);
    structures.commit();
    return wrapWithCleanup(stage, [barley.dispose, structures.dispose, ground.dispose]);
  }
};
