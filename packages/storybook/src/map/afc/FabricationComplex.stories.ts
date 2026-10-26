import type { Meta, StoryObj } from "@storybook/html-vite";
import type { Scene } from "three";
import { createFabricationComplexOverlay } from "@client/client-map-3d-fabrication-complex.js";
import { createContactShadow, glintStage, startUpdateLoop, studioStage } from "../../fixtures/stage-lighting.js";
import { createGrassGround, wrapWithCleanup } from "../../fixtures/three-stage.js";
import { AFC_MODULE_MODELS } from "./afc-modules.js";

type Args = {
  cameraDistance: number;
  // How many of the 8 Module_Sockets carry a docked module (models taken in
  // AFC_MODULE_MODELS order; the rest stay as empty bays).
  modules: number;
};

// Builds a single AFC at the origin and docks real upgrade-module assets (one
// from each fabrication family) into the first `modules` sockets via the
// attachment-point API, returning a cleanup list.
const buildAfc = (scene: Scene, modules: number, withGrass: boolean, grassRadius: number): (() => void)[] => {
  const cleanups: (() => void)[] = [];
  if (withGrass) {
    const ground = createGrassGround(grassRadius, 1);
    scene.add(ground.group);
    cleanups.push(ground.dispose);
  } else {
    const shadow = createContactShadow(1.7);
    scene.add(shadow.mesh);
    cleanups.push(shadow.dispose);
  }
  const overlay = createFabricationComplexOverlay(scene, 1);
  const index = overlay.addInstance(0, 0, 0, 5, 5);
  overlay.commit();
  // One overlay per module model so a mixed loadout is visible in one shot;
  // the eight sockets take the first eight models in ring order.
  const families = AFC_MODULE_MODELS.map((model) => model.create(scene, 8));
  const count = Math.max(0, Math.min(modules, 8));
  overlay.moduleSocketAttachments(index).slice(0, count).forEach((attachment, i) => {
    families[i % families.length]!.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, attachment.socketIndex + 1, 0);
  });
  for (const family of families) family.commit();
  cleanups.push(startUpdateLoop([overlay, ...families]), overlay.dispose, ...families.map((family) => family.dispose));
  return cleanups;
};

const meta: Meta<Args> = {
  title: "Map/AFC/Fabrication Complex",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 18, step: 0.5 } },
    modules: { control: { type: "range", min: 0, max: 8, step: 1 } }
  },
  args: { cameraDistance: 9, modules: 6 }
};

export default meta;
type Story = StoryObj<Args>;

// The hero asset shot: the full 9-tile footprint on a light neutral studio
// backdrop, all eight bays populated with one of every module family,
// orthographic three-quarter camera — the way the asset reads in marketing/UI.
export const FabricationComplexHero: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, orthoHalfHeight: 2.2, background: "#a6a3a1" });
    const cleanups = buildAfc(stage.scene, 8, false, 0);
    return wrapWithCleanup(stage, cleanups);
  }
};

export const FabricationComplexHeroDark: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, orthoHalfHeight: 2.2, background: "#15161b" });
    const cleanups = buildAfc(stage.scene, 8, false, 0);
    return wrapWithCleanup(stage, cleanups);
  }
};

// All eight independent module docks populated — every socket on the ring is
// a live attachment hosting a module asset.
export const FullBays: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, orthoHalfHeight: 2.2, background: "#15161b" });
    const cleanups = buildAfc(stage.scene, 8, false, 0);
    return wrapWithCleanup(stage, cleanups);
  }
};

// No modules installed — the "glowing industrial core + spider-like arms +
// eight empty circular bays" silhouette the complex advertises at rest.
export const EmptyBays: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, orthoHalfHeight: 2.2, background: "#15161b" });
    const cleanups = buildAfc(stage.scene, 0, false, 0);
    return wrapWithCleanup(stage, cleanups);
  }
};

// In normal gameplay context on grass tiles, with the 3x3 tile hole its
// footprint spans — modules still pull their (x, y, z, yaw) from the socket
// attachment points.
export const OnGrass: Story = {
  render: () => {
    const stage = glintStage({ cameraDistance: 8, cameraTilt: 0.6 });
    const cleanups = buildAfc(stage.scene, 8, true, 2);
    return wrapWithCleanup(stage, cleanups);
  }
};

// Live module spawn/dock: scrub `modules` to pop upgrade modules into the first N sockets
// and back out — the procedural insertion/removal the identical Module_Sockets
// are built for.
export const ModularDocking: Story = {
  args: { cameraDistance: 9, modules: 4 },
  render: (args) => {
    const stage = studioStage({ cameraDistance: args.cameraDistance, orthoHalfHeight: 2.4, background: "#15161b" });
    const cleanups = buildAfc(stage.scene, args.modules, false, 0);
    return wrapWithCleanup(stage, cleanups);
  }
};