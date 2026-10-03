import type { Meta, StoryObj } from "@storybook/html-vite";
import { Group, Scene } from "three";
import { createFabricationComplexOverlay } from "@client/client-map-3d-fabrication-complex.js";
import { createThunderplateInductionModuleOverlay } from "@client/client-map-3d-thunderplate-induction-module.js";
import { createGrassGround, wrapWithCleanup, type Stage } from "../three-stage.js";
import { createContactShadow, glintStage, startUpdateLoop, studioStage } from "./FabricationComplex.stories.js";

type Args = {
  cameraDistance: number;
};

// The default Storybook camera looks down the +Z axis. This module's energizing
// front — the broad copper coil rings circling the rim-thin armor blank, the two
// chunky electrode columns and their cyan-white arcs — faces +X, so rotating the
// content container by -90° plus an optional display yaw swings the coil and the
// gleaming arcs into the view.
const buildSingleModule = (
  stage: Stage,
  opts: { displayYaw?: number; grassRadius: number; contactShadowRadius?: number }
): (() => void)[] => {
  const cleanups: (() => void)[] = [];
  if (opts.grassRadius > 0) {
    const ground = createGrassGround(opts.grassRadius, 1);
    stage.scene.add(ground.group);
    cleanups.push(ground.dispose);
  } else {
    const shadow = createContactShadow(opts.contactShadowRadius ?? 0.4);
    stage.scene.add(shadow.mesh);
    cleanups.push(shadow.dispose);
  }
  const inner = new Scene();
  const overlay = createThunderplateInductionModuleOverlay(inner, 1);
  overlay.addInstance(0, 0, 0, 0, 8, 4);
  overlay.commit();
  const content = new Group();
  content.add(inner);
  content.rotation.y = -Math.PI / 2 + (opts.displayYaw ?? 0);
  stage.scene.add(content);
  cleanups.push(overlay.dispose, startUpdateLoop([overlay]));
  return cleanups;
};

const meta: Meta<Args> = {
  title: "3D Library/ThunderplateInduction",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 1, max: 10, step: 0.25 } }
  },
  args: { cameraDistance: 3 }
};

export default meta;
type Story = StoryObj<Args>;

// The hero asset shot: the induction rig aimed at the camera on a light neutral
// studio backdrop — the low blackened pod carrying a heavy horizontal armor
// blank wrapped in a huge coil of three broad copper loops, energized by two
// chunky electrode columns whose cyan-white arcs jump the contact gaps, with the
// compact transformer block behind and the heavy rear AFC connector.
export const ThunderplateInductionHero: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 4, orthoHalfHeight: 1, background: "#a6a3a1" });
    const cleanups = buildSingleModule(stage, { grassRadius: 0 });
    return wrapWithCleanup(stage, cleanups);
  }
};

export const ThunderplateInductionHeroDark: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 4, orthoHalfHeight: 1, background: "#15161b" });
    const cleanups = buildSingleModule(stage, { grassRadius: 0 });
    return wrapWithCleanup(stage, cleanups);
  }
};

// Slow turntable so the whole silhouette can be inspected from every side —
// docked seat, the low pod, the heavy armor blank, the three broad copper coil
// loops, the two electrode columns with their brass collars and cyan-white arcs,
// the transformer block behind, and the rear coupling.
export const Turntable: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 4, orthoHalfHeight: 1.15, background: "#15161b" });
    const inner = new Scene();
    const overlay = createThunderplateInductionModuleOverlay(inner, 1);
    overlay.addInstance(0, 0, 0, 0, 8, 4);
    overlay.commit();
    const content = new Group();
    content.add(inner);
    content.rotation.y = -Math.PI / 4;
    stage.scene.add(content);
    const shadow = createContactShadow(0.4);
    stage.scene.add(shadow.mesh);
    let rafId = 0;
    const spin = (nowMs: number): void => {
      overlay.update(nowMs);
      content.rotation.y = -Math.PI / 4 + nowMs * 0.0005;
      rafId = requestAnimationFrame(spin);
    };
    spin(0);
    const cleanups = [shadow.dispose, overlay.dispose, () => cancelAnimationFrame(rafId)];
    return wrapWithCleanup(stage, cleanups);
  }
};

// In gameplay context on grass tiles, aimed toward the viewer — the module as it
// actually reads when seated in a socket on the map: a low pod carrying a coil
// of copper loops around a clamped armor blank, clearly above the tileline.
export const OnGrass: Story = {
  render: (args) => {
    const stage = glintStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.5 });
    const cleanups = buildSingleModule(stage, { displayYaw: 0.35, grassRadius: 1, contactShadowRadius: 0.4 });
    return wrapWithCleanup(stage, cleanups);
  }
};

export const DockedToAfc: Story = {
  args: { cameraDistance: 4.5 },
  render: (args) => {
    const stage = glintStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.5 });
    const cleanups: (() => void)[] = [];
    const shadow = createContactShadow(1.7);
    stage.scene.add(shadow.mesh);
    cleanups.push(shadow.dispose);
    const afc = createFabricationComplexOverlay(stage.scene, 1);
    const afcIndex = afc.addInstance(0, 0, 0, 5, 5);
    afc.commit();
    const modules = createThunderplateInductionModuleOverlay(stage.scene, 1);
    // Socket at the 90° azimuth faces the default camera — the induction rig's
    // coil and arcs read front-on against the bay, clear of the other docked
    // assets.
    const attachment = afc.moduleSocketAttachments(afcIndex)[2]!;
    modules.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, attachment.socketIndex + 1, 0);
    modules.commit();
    cleanups.push(afc.dispose, modules.dispose, startUpdateLoop([afc, modules]));
    return wrapWithCleanup(stage, cleanups);
  }
};