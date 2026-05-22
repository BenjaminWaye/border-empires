import type { Meta, StoryObj } from "@storybook/html";
import { createDockOverlay } from "@client/client-map-3d-dock-overlay.js";
import { createStage, wrapWithCleanup } from "../three-stage.js";

type Args = {
  rotationDegrees: number;
  count: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#102030" });
  const overlay = createDockOverlay(stage.scene, Math.max(args.count, 1));
  const rad = (args.rotationDegrees * Math.PI) / 180;
  for (let i = 0; i < args.count; i += 1) {
    const x = (i - (args.count - 1) / 2) * 1.4;
    overlay.addInstance(x, 0, 0, rad, Math.round(x), 0);
  }
  overlay.commit();
  return wrapWithCleanup(stage, [overlay.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/DockOverlay",
  parameters: {
    docs: { description: { component: "Dock model is built facing +z (south). Rotate to face adjacent water tile." } }
  },
  argTypes: {
    rotationDegrees: { control: { type: "range", min: 0, max: 360, step: 15 } },
    count: { control: { type: "range", min: 1, max: 5, step: 1 } },
    cameraDistance: { control: { type: "range", min: 2, max: 16, step: 0.5 } }
  },
  args: { rotationDegrees: 0, count: 1, cameraDistance: 4 },
  render
};

export default meta;
type Story = StoryObj<Args>;
export const FacingSouth: Story = {};
export const FacingNorth: Story = { args: { rotationDegrees: 180 } };
export const FacingEast: Story = { args: { rotationDegrees: 90 } };
export const Row: Story = { args: { count: 4, cameraDistance: 8 } };
