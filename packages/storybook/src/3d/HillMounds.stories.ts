import type { Meta, StoryObj } from "@storybook/html-vite";
import { createHillMounds } from "@client/client-map-3d-hills.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#242618" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const hills = createHillMounds(stage.scene, maxTiles);
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    hills.addInstance(x, z, 0);
  });
  hills.commit();
  return wrapWithCleanup(stage, [hills.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/HillMounds",
  argTypes: {
    gridRadius: { control: { type: "range", min: 1, max: 6, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 4, max: 40, step: 1 } }
  },
  args: { gridRadius: 3, spacing: 1, cameraDistance: 12 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const SingleTile: Story = { args: { gridRadius: 0, spacing: 1, cameraDistance: 4 } };
export const RollingHills: Story = { args: { gridRadius: 5, spacing: 1, cameraDistance: 24 } };
