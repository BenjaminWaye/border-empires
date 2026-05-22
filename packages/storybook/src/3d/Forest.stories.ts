import type { Meta, StoryObj } from "@storybook/html-vite";
import { createForest } from "@client/client-map-3d-forest.js";
import { createStage, forEachGridCell, wrapWithCleanup } from "../three-stage.js";

type Args = {
  gridRadius: number;
  spacing: number;
  cameraDistance: number;
};

const render = (args: Args): HTMLElement => {
  const stage = createStage({ cameraDistance: args.cameraDistance, background: "#1a2614" });
  const maxTiles = (args.gridRadius * 2 + 1) ** 2;
  const forest = createForest(stage.scene, maxTiles);
  forEachGridCell({ radius: args.gridRadius, spacing: args.spacing }, (x, z) => {
    forest.addInstance(x, z, 0);
  });
  forest.commit();
  return wrapWithCleanup(stage, [forest.dispose]);
};

const meta: Meta<Args> = {
  title: "3D Library/Forest",
  argTypes: {
    gridRadius: { control: { type: "range", min: 1, max: 8, step: 1 } },
    spacing: { control: { type: "range", min: 1, max: 3, step: 0.25 } },
    cameraDistance: { control: { type: "range", min: 4, max: 40, step: 1 } }
  },
  args: { gridRadius: 4, spacing: 1, cameraDistance: 14 },
  render
};

export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};
export const SmallStand: Story = { args: { gridRadius: 2, spacing: 1, cameraDistance: 8 } };
export const WideForest: Story = { args: { gridRadius: 7, spacing: 1, cameraDistance: 24 } };
