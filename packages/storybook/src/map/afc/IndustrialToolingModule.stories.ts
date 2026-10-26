import type { Meta, StoryObj } from "@storybook/html-vite";
import { createIndustrialToolingModuleOverlay } from "@client/client-industrial-tooling-module/client-map-3d-industrial-tooling-module.js";
import { createAfcOverlayGroup } from "@client/client-map-3d-afc-module-family.js";
import { drawAfc2D } from "@client/client-map-2d-afc-overlay.js";
import { wrapWithCleanup } from "../../fixtures/three-stage.js";
import { studioStage, createContactShadow, startUpdateLoop } from "../../fixtures/stage-lighting.js";

type Args = { yaw: number };
const meta: Meta<Args> = {
  title: "Map/AFC/Industrial Tooling Module",
  args: { yaw: 0.65 },
  argTypes: { yaw: { control: { type: "range", min: 0, max: Math.PI * 2, step: 0.1 } } },
  parameters: { docs: { description: { component: "Industrial Tooling: dockable precision mill with twin-column gantry, reciprocating spindle, clamped workpiece, cutting-tool magazine and rotating brass drive wheel. Makes and refurbishes equipment for local Manufactories." } } }
};
export default meta;
type Story = StoryObj<Args>;

export const Hero: Story = {
  render: ({ yaw }) => {
    const stage = studioStage({ cameraDistance: 2, cameraTilt: 1, orthoHalfHeight: 0.28, background: "#a6a3a1" });
    stage.camera.lookAt(0, 0.18, 0);
    const overlay = createIndustrialToolingModuleOverlay(stage.scene, 1);
    overlay.addInstance(0, 0, 0, yaw, 8, 4);
    overlay.commit();
    const shadow = createContactShadow(0.2);
    stage.scene.add(shadow.mesh);
    return wrapWithCleanup(stage, [startUpdateLoop([overlay]), overlay.dispose, shadow.dispose]);
  }
};

const docked = (modules: readonly string[]): HTMLElement => {
  const stage = studioStage({ cameraDistance: 5, orthoHalfHeight: 2, background: "#252a2c" });
  const group = createAfcOverlayGroup(stage.scene, 1);
  group.addAfc(0, 0, 0, 0, 0, modules);
  group.commit();
  return wrapWithCleanup(stage, [startUpdateLoop([group]), group.dispose]);
};
export const Docked: Story = { render: () => docked(["trade", "workshops", "masonry", "leatherworking"]) };
export const AllSockets: Story = { render: () => docked(Array<string>(8).fill("trade")) };
export const Fallback2D: Story = {
  render: () => {
    const canvas = document.createElement("canvas");
    canvas.width = 420;
    canvas.height = 280;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#333f35";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawAfc2D(ctx, { x: 0, y: 0, afc: { ownerId: "me", status: "active", modules: ["trade"] } }, 110, 40, 200, 0);
    return canvas;
  }
};
