import type { Meta, StoryObj } from "@storybook/html-vite";
import { Group, Scene } from "three";
import { createStructurePieceBuilder } from "@client/client-map-3d-structure-builder.js";
import { registerManpowerStructures } from "@client/client-map-3d-structure-manpower.js";
import { createGrassGround, wrapWithCleanup, type Stage } from "../three-stage.js";
import { createContactShadow, glintStage, studioStage } from "./FabricationComplex.stories.js";

type Args = {
  cameraDistance: number;
};

// The Ancillary Depot (GARRISON_HALL) is a ring structure: a squat blackened-iron
// drum of dormant bodies with two brass bands and a glowing cyan core, surrounded
// by eight body-pods standing like cartridges in a revolver cylinder — each with
// a recessed brass plaque, a pale humanoid silhouette, and a small cyan aether
// visor on its front. The whole asset reads as bodies "on the shelf, ready for
// the hive", so the ring (not the drum) is the silhouette to hero in the shots.
const buildDepot = (content: Scene): { layout: () => void; commit: () => void; dispose: () => void } => {
  const { builder, commit, dispose } = createStructurePieceBuilder(content, 4);
  const manpower = registerManpowerStructures(builder);
  return { layout: () => manpower.layouts.GARRISON_HALL(0, 0, 0), commit, dispose };
};

const buildStage = (stage: Stage, opts: { displayYaw?: number; grassRadius: number; contactShadowRadius?: number }): (() => void)[] => {
  const cleanups: (() => void)[] = [];
  if (opts.grassRadius > 0) {
    const ground = createGrassGround(opts.grassRadius, 0);
    stage.scene.add(ground.group);
    cleanups.push(ground.dispose);
  } else {
    const shadow = createContactShadow(opts.contactShadowRadius ?? 0.5);
    stage.scene.add(shadow.mesh);
    cleanups.push(shadow.dispose);
  }
  const inner = new Scene();
  const { layout, commit, dispose } = buildDepot(inner);
  layout();
  commit();
  const content = new Group();
  content.add(inner);
  content.rotation.y = opts.displayYaw ?? 0;
  stage.scene.add(content);
  cleanups.push(dispose);
  return cleanups;
};

const meta: Meta<Args> = {
  title: "3D Library/AncillaryDepot",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 1, max: 10, step: 0.25 } }
  },
  args: { cameraDistance: 3 }
};

export default meta;
type Story = StoryObj<Args>;

// The hero asset shot: the ring of body-pods facing the camera on a light neutral
// studio backdrop, the drum's brass bands and cyan core glowing between them.
export const AncillaryDepotHero: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 4, orthoHalfHeight: 1, background: "#a6a3a1" });
    const cleanups = buildStage(stage, { grassRadius: 0 });
    return wrapWithCleanup(stage, cleanups);
  }
};

export const AncillaryDepotHeroDark: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 4, orthoHalfHeight: 1, background: "#15161b" });
    const cleanups = buildStage(stage, { grassRadius: 0 });
    return wrapWithCleanup(stage, cleanups);
  }
};

// Slow turntable so the revolver-cylinder ring reads from every azimuth: each
// quarter turn puts a fresh pair of pods and the drum's brass bands in view.
export const Turntable: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 4, orthoHalfHeight: 1.15, background: "#15161b" });
    const inner = new Scene();
    const { layout, commit, dispose } = buildDepot(inner);
    layout();
    commit();
    const content = new Group();
    content.add(inner);
    stage.scene.add(content);
    const shadow = createContactShadow(0.5);
    stage.scene.add(shadow.mesh);
    let rafId = 0;
    const spin = (nowMs: number): void => {
      content.rotation.y = -Math.PI / 4 + nowMs * 0.0005;
      rafId = requestAnimationFrame(spin);
    };
    spin(0);
    const cleanups = [shadow.dispose, dispose, () => cancelAnimationFrame(rafId)];
    return wrapWithCleanup(stage, cleanups);
  }
};

// In gameplay context on a grass tile, aimed toward the viewer — the depot as it
// actually reads when sited on the map: a ring of dormant bodies around a drum,
// rising well above the tileline.
export const OnGrass: Story = {
  render: (args) => {
    const stage = glintStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.5 });
    const cleanups = buildStage(stage, { displayYaw: 0.35, grassRadius: 1, contactShadowRadius: 0.5 });
    return wrapWithCleanup(stage, cleanups);
  }
};