import type { Meta, StoryObj } from "@storybook/html-vite";
import { Group, Scene } from "three";
import { createFabricationComplexOverlay } from "@client/client-map-3d-fabrication-complex.js";
import { createTranspositionArrayModuleOverlay } from "@client/client-map-3d-transposition-array-module.js";
import { createGrassGround, wrapWithCleanup, type Stage } from "../three-stage.js";
import { createContactShadow, glintStage, startUpdateLoop, studioStage } from "./FabricationComplex.stories.js";

type Args = {
  cameraDistance: number;
};

// The default Storybook camera looks down the +Z axis, and the module's
// transfer array faces +X (the socket yaw). Rotating the content container by
// -90° plus an optional display yaw brings the ring pair toward the front of
// frame.
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
    const shadow = createContactShadow(opts.contactShadowRadius ?? 0.36);
    stage.scene.add(shadow.mesh);
    cleanups.push(shadow.dispose);
  }
  const inner = new Scene();
  const overlay = createTranspositionArrayModuleOverlay(inner, 1);
  overlay.addInstance(0, 0, 0, 0, 7, 3);
  overlay.commit();
  const content = new Group();
  content.add(inner);
  content.rotation.y = -Math.PI / 2 + (opts.displayYaw ?? 0);
  stage.scene.add(content);
  cleanups.push(overlay.dispose, startUpdateLoop([overlay]));
  return cleanups;
};

const meta: Meta<Args> = {
  title: "3D Library/TranspositionArrayModule",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 1, max: 10, step: 0.25 } }
  },
  args: { cameraDistance: 3 }
};

export default meta;
type Story = StoryObj<Args>;

// The hero asset shot: the aether-siphon fabrication cartridge docked and
// aimed at the camera on a light neutral studio backdrop — the pair of opposed
// transfer rings with the bright cyan energy channel suspended between them.
export const TranspositionArrayHero: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 4, orthoHalfHeight: 1, background: "#a6a3a1" });
    const cleanups = buildSingleModule(stage, { grassRadius: 0 });
    return wrapWithCleanup(stage, cleanups);
  }
};

export const TranspositionArrayHeroDark: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 4, orthoHalfHeight: 1, background: "#15161b" });
    const cleanups = buildSingleModule(stage, { grassRadius: 0 });
    return wrapWithCleanup(stage, cleanups);
  }
};

// Slow turntable so the whole silhouette can be inspected from every side —
// docked seat, pod, the opposed ring pair and the rear coupling.
export const Turntable: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 4, orthoHalfHeight: 1.15, background: "#15161b" });
    const inner = new Scene();
    const overlay = createTranspositionArrayModuleOverlay(inner, 1);
    overlay.addInstance(0, 0, 0, 0, 7, 3);
    overlay.commit();
    const content = new Group();
    content.add(inner);
    content.rotation.y = -Math.PI / 4;
    stage.scene.add(content);
    const shadow = createContactShadow(0.36);
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

// In gameplay context on grass tiles, aimed toward the viewer — the module as
// it actually reads when seated in a socket on the map.
export const OnGrass: Story = {
  render: (args) => {
    const stage = glintStage({ cameraDistance: args.cameraDistance, cameraTilt: 0.5 });
    const cleanups = buildSingleModule(stage, { displayYaw: -0.35, grassRadius: 1, contactShadowRadius: 0.36 });
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
    const modules = createTranspositionArrayModuleOverlay(stage.scene, 1);
    // Socket at the 90° azimuth faces the default camera — the module reads
    // rings-first with the empty bays flanking it.
    const attachment = afc.moduleSocketAttachments(afcIndex)[2]!;
    modules.addInstance(attachment.x, attachment.z, attachment.y, attachment.yaw, attachment.socketIndex + 1, 0);
    modules.commit();
    cleanups.push(afc.dispose, modules.dispose, startUpdateLoop([afc, modules]));
    return wrapWithCleanup(stage, cleanups);
  }
};